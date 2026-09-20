#!/usr/bin/env python3
"""Reconcile only public Gallery derivatives. No originals, DB credentials or long-lived AKs."""
from __future__ import annotations
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

KEY = re.compile(r"gallery/v1/([a-f0-9]{64})\.(jpg|webp)\Z")
ROOT = Path('/var/lib/gallery-media')
MAX_IMAGE = 64 * 1024 * 1024

def atomic_json(filename, data, public=False):
    filename = Path(filename)
    temporary = filename.with_suffix('.next')
    with open(temporary, 'w') as stream:
        os.chmod(temporary, 0o640 if public else 0o600)
        json.dump(data, stream, separators=(',', ':'))
        stream.flush()
        os.fsync(stream.fileno())
    if public and os.geteuid() == 0:
        os.chown(temporary, 0, 1000)
    os.replace(temporary, filename)

def validated_image(record):
    match = KEY.fullmatch(record['key'])
    if not match or len(record['data']) > (MAX_IMAGE * 4 // 3 + 4):
        raise ValueError('Invalid image record')
    data = base64.b64decode(record['data'], validate=True)
    if not data or len(data) > MAX_IMAGE or hashlib.sha256(data).hexdigest() != match[1]:
        raise ValueError('Image checksum mismatch')
    kind = 'image/jpeg' if data[:2] == b'\xff\xd8' else (
        'image/webp' if data[:4] == b'RIFF' and data[8:12] == b'WEBP' else None)
    if kind != record['contentType'] or match[2] != {'image/jpeg': 'jpg', 'image/webp': 'webp'}.get(kind):
        raise ValueError('Image format mismatch')
    return data

def credential_client(config):
    from alibabacloud_credentials.client import Client
    from alibabacloud_credentials.models import Config
    return Client(Config(type='ecs_ram_role', role_name=config['role_name'],
                         enable_imds_v2=True, disable_imds_v1=True))

class Cloud:
    def __init__(self, config):
        import alibabacloud_oss_v2 as oss
        from alibabacloud_cdn20180510.client import Client
        from alibabacloud_tea_openapi.models import Config
        self.oss = oss
        self.config = config
        credentials = credential_client(config)
        def provide():
            c = credentials.get_credential()
            return oss.credentials.Credentials(c.access_key_id, c.access_key_secret, c.security_token)
        cfg = oss.config.Config(region=config['region'], endpoint=config['endpoint'],
              credentials_provider=oss.credentials.CredentialsProviderFunc(provide),
              connect_timeout=10, readwrite_timeout=60, retry_max_attempts=3)
        self.client = oss.Client(cfg)
        self.cdn = Client(Config(credential=credentials, endpoint='cdn.aliyuncs.com', protocol='https'))

    def ensure(self, key, data, content_type):
        try:
            head = self.client.head_object(self.oss.HeadObjectRequest(bucket=self.config['bucket'], key=key))
            if head.content_length == len(data) and (head.metadata or {}).get('sha256') == hashlib.sha256(data).hexdigest():
                return False
        except self.oss.exceptions.ServiceError as error:
            if error.status_code != 404: raise
        self.client.put_object(self.oss.PutObjectRequest(bucket=self.config['bucket'], key=key,
            body=data, content_type=content_type, cache_control='no-store',
            metadata={'sha256': hashlib.sha256(data).hexdigest()}))
        return True

    def delete(self, key):
        if not KEY.fullmatch(key): raise ValueError('Refusing unexpected object key')
        self.client.delete_object(self.oss.DeleteObjectRequest(bucket=self.config['bucket'], key=key))

    def refresh(self, keys):
        from alibabacloud_cdn20180510.models import RefreshObjectCachesRequest
        from alibabacloud_tea_util.models import RuntimeOptions
        for start in range(0, len(keys), 100):
            self.cdn.refresh_object_caches_with_options(RefreshObjectCachesRequest(
                object_path='\n'.join(self.config['origin'] + '/' + k for k in keys[start:start+100]),
                object_type='File'), RuntimeOptions(connect_timeout=10000, read_timeout=30000))

def sign(origin, key, secret, timestamp=None):
    token = f'{int(time.time()) if timestamp is None else timestamp}-{uuid.uuid4().hex}-0'
    digest = hashlib.md5(f'/{key}-{token}-{secret}'.encode()).hexdigest()
    return f'{origin}/{key}?auth_key={token}-{digest}'

def probe_access(config, key):
    import requests
    origin, secret = config['origin'], config['signingKey']
    urls = [(origin + '/' + key, 403),
            (sign(origin, key, secret, int(time.time())-601), 403),
            (sign(origin, key, 'deliberatelyWrongSigningKey000000000'), 403),
            (sign(origin, key, secret), 200)]
    for url, expected in urls:
        with requests.get(url, timeout=(10, 30), stream=True, allow_redirects=False) as response:
            if response.status_code != expected:
                raise RuntimeError('CDN authorization probe failed')
            if expected == 200 and 'no-store' not in response.headers.get('Cache-Control', '').lower():
                raise RuntimeError('CDN browser cache protection missing')

def reconcile(records, cloud, root, config, now=None):
    now = time.time() if now is None else now
    ledger_path = root / 'ledger.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
    desired, ready, failures, uploads = set(), {}, 0, 0
    complete = None
    for record in records:
        if complete is not None: raise ValueError('Trailing export data')
        if record.get('kind') == 'complete':
            complete = record
            continue
        if record.get('kind') != 'media': raise ValueError('Invalid export stream')
        data = validated_image(record)
        key = record['key']
        if key in desired: raise ValueError('Duplicate export object')
        desired.add(key)
        ledger[key] = {'lastSeen': now}
        # Journal BEFORE PutObject: crashes cannot leave an untracked object behind.
        atomic_json(ledger_path, ledger)
        try:
            uploads += bool(cloud.ensure(key, data, record['contentType']))
            ready[key] = True
        except Exception:
            failures += 1
    if complete is None or complete['count'] != len(desired):
        raise ValueError('Incomplete export; refusing garbage collection')
    failures += complete['failures']
    # Remove eligibility before deleting obsolete objects. DB authorization is always checked live.
    atomic_json(root / 'public/ready.json', {'version': 1, 'checkedAt': 0, 'objects': {}}, True)
    if ready: probe_access(config, next(iter(ready)))
    atomic_json(root / 'public/ready.json', {'version': 1, 'checkedAt': int(time.time()*1000), 'objects': ready}, True)
    removed = []
    if not failures:
        for key, entry in list(ledger.items()):
            if key not in desired and now - entry['lastSeen'] >= 600:
                try:
                    cloud.delete(key)
                    removed.append(key)
                except Exception: failures += 1
        if removed:
            try:
                cloud.refresh(removed)
                for key in removed: del ledger[key]
            except Exception: failures += 1  # keep journal entries and retry refresh next run
    atomic_json(ledger_path, ledger)
    return {'objects': len(ready), 'uploaded': uploads, 'removed': len(removed), 'failures': failures}

def main():
    config = json.loads(Path('/etc/gallery/media-sync.json').read_text())
    public = json.loads((ROOT / 'public/config.json').read_text())
    if public.get('enabled') is not True:
        raise RuntimeError('CDN cutover is disabled')
    if not re.fullmatch(r'[A-Za-z0-9]{32,128}', public['signingKey']):
        raise ValueError('Invalid signing key')
    if public['origin'] != config['origin'] or not re.fullmatch(r'https://[a-z0-9.-]+', config['origin']):
        raise ValueError('Invalid CDN origin')
    with open(ROOT / 'task.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Root-owned fixed command, no user-supplied shell, exporter runs as public service user.
        command = ['docker', 'compose', '--env-file', '/srv/vision/secrets/compose.env', '-p', 'vision',
            '-f', '/root/work/immich/deployment/gallery/cloud/compose.yml', 'exec', '-T', 'public',
            'node', 'packages/gallery-db/scripts/export-cdn.ts']
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        def records():
            while True:
                line = process.stdout.readline(MAX_IMAGE*4//3+4096)
                if not line: break
                if not line.endswith(b'\n'): raise ValueError('Oversized export record')
                yield json.loads(line)
            if process.wait() != 0: raise RuntimeError('Gallery export failed')
        try:
            result = reconcile(records(), Cloud(config), ROOT, public)
            atomic_json(ROOT / 'status.json', {'checkedAt': int(time.time()*1000), **result})
            print(json.dumps(result))
            if result['failures']: raise RuntimeError('Some media require retry')
        finally:
            if process.poll() is None: process.kill()
            process.wait()

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # SDK exceptions can include signed requests; never log raw messages/credentials.
        print('Gallery media sync failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)

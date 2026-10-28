#!/usr/bin/env python3
"""Privileged maintenance runner; runtime only enqueues requests, never accesses media."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--local', action='store_true')
parser.add_argument('--watch', action='store_true')
args = parser.parse_args()
source = Path(__file__).resolve().parent
repo = source.parents[3] if args.local else None
state = repo / '.gallery-local/capture-worker' if args.local else Path('/var/lib/gallery-capture')
state.mkdir(parents=True, exist_ok=True, mode=0o700)
collector = repo / 'deployment/gallery/scripts/collect-capture-evidence.cjs' if args.local else source / 'collect-capture-evidence.cjs'
if args.local:
    node = repo / '.gallery-local/toolchain/node-v24.21.0-darwin-arm64/bin/node'
    admin = [str(node), '--env-file=' + str(repo / '.gallery-local/runtime/admin.env'), str(repo / 'packages/gallery-db/scripts/capture-jobs.ts')]
else:
    admin = ['docker', 'exec', '-i', '-w', '/app', os.environ.get('GALLERY_CAPTURE_ADMIN_CONTAINER', 'vision-admin-1'), 'node', 'packages/gallery-db/scripts/capture-jobs.ts']
immich = os.environ.get('GALLERY_CAPTURE_IMMICH_CONTAINER', 'immich_server' if args.local else 'vision-immich-server-1')

def command(argv, data='', timeout=120):
    return subprocess.run(argv, input=data, text=True, encoding='utf-8', capture_output=True, timeout=timeout, cwd=repo)

def admin_call(action, data=None):
    result = command(admin + [action], json.dumps(data) if data is not None else '')
    if result.returncode not in (0, 2):
        raise RuntimeError('Maintenance database operation failed')
    return json.loads(result.stdout), result.returncode

def scan():
    jobs = []
    with (state / 'scan.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        try:
            plan, _ = admin_call('claim')
            jobs = plan['jobs']
            stamp = state / 'last-full-attempt'
            due = not stamp.exists() or time.time() - stamp.stat().st_mtime >= 600
            if not jobs and not due:
                return
            if not jobs:
                stamp.write_text(str(time.time()))  # Back off failed full scans too; targeted retries stay immediate.
            collect = ['docker', 'exec', '-i', '-w', '/usr/src/app/server']
            if jobs:
                collect += ['-e', 'GALLERY_CAPTURE_ASSETS=' + ','.join(j['assetId'] for j in jobs)]
            collect += [immich, 'node']
            report = command(collect, collector.read_text(), timeout=1080)
            if report.returncode:
                raise RuntimeError('Read-only collector failed')
            result, code = admin_call('import', {'jobs': jobs, 'report': json.loads(report.stdout)})
            print(json.dumps(result), flush=True)
            if code != 0 and not args.watch:
                raise SystemExit(code)
        except Exception:
            if jobs:
                try:
                    admin_call('fail', {'jobs': jobs})
                except Exception:
                    pass  # The bounded lease makes retry possible if the database is unavailable.
            print('Capture scan failed; existing evidence and source files are retained.', file=sys.stderr, flush=True)
            if not args.watch:
                raise SystemExit(1)

os.umask(0o077)
while True:
    scan()
    if not args.watch:
        break
    time.sleep(3)

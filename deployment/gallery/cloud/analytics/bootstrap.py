#!/usr/bin/env python3
"""First installation only. Generates secrets, migrates, grants runtime CRUD, replaces default login.
Run from the reviewed checkout with pinned deployment.env already present. Never prints secrets.
"""
import json, os, secrets, subprocess, time, urllib.request
from pathlib import Path
os.umask(0o077)
root = Path(os.environ.get('ANALYTICS_STATE_ROOT', '/srv/gallery-analytics'))
private = root / 'secrets'
private.mkdir(parents=True, exist_ok=True, mode=0o700)
if (private / 'runtime.env').exists():
    raise SystemExit('Already initialized; use the documented upgrade/recovery procedure.')
owner, runtime, password = (secrets.token_hex(32) for _ in range(3))
(private / 'database.env').write_text(f'POSTGRES_USER=umami_owner\nPOSTGRES_DB=umami\nPOSTGRES_PASSWORD={owner}\n')
(private / 'migration.env').write_text(f'DATABASE_URL=postgresql://umami_owner:{owner}@database:5432/umami\n')
(private / 'runtime.env').write_text(f'DATABASE_URL=postgresql://umami_runtime:{runtime}@database:5432/umami\nAPP_SECRET={secrets.token_hex(32)}\nTWO_FACTOR_ENCRYPTION_KEY={secrets.token_hex(32)}\n')
credentials = private / 'login.json'
credentials.write_text(json.dumps({'username':'admin','password':password}, indent=2)+'\n')
compose = ['docker','compose','--env-file',str(root/'deployment.env'),'-f',str(Path(__file__).with_name('compose.yml'))]
def run(*args, **kwargs):
    return subprocess.run(compose+list(args), check=True, **kwargs)
subprocess.run(['docker','network','create','gallery-analytics-edge'], check=True, stdout=subprocess.DEVNULL)
run('up','-d','--wait','database')
run('run','--rm','migrate')
sql = f"""
CREATE ROLE umami_runtime LOGIN PASSWORD '{runtime}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE ALL ON DATABASE umami FROM PUBLIC;
GRANT CONNECT ON DATABASE umami TO umami_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO umami_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO umami_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO umami_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE umami_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO umami_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE umami_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO umami_runtime;
REVOKE ALL ON TABLE public._prisma_migrations FROM umami_runtime;
"""
run('exec','-T','database','psql','-U','umami_owner','-d','umami','-v','ON_ERROR_STOP=1', input=sql, text=True, stdout=subprocess.DEVNULL)
run('up','-d','--wait','--wait-timeout','180','umami')
def api(path, data, token=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    request=urllib.request.Request('http://127.0.0.1:3300/api/'+path, data=json.dumps(data).encode(), headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response: return json.load(response)
token=api('auth/login',{'username':'admin','password':'umami'})['token']
api('me/password',{'currentPassword':'umami','newPassword':password},token)
token=api('auth/login',{'username':'admin','password':password})['token']
website=api('websites',{'name':'光和远方','domain':'vision.ke'},token)
(root/'website.json').write_text(json.dumps({'id':website['id'],'domain':'vision.ke'},indent=2)+'\n')
print('Initialized; default password replaced; private credentials in secrets/login.json.')

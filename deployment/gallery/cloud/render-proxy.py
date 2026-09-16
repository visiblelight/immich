#!/usr/bin/env python3
"""Render extra vhosts for an existing Nginx; does not modify or reload it."""
import argparse
import re
from urllib.parse import urlsplit

p = argparse.ArgumentParser()
p.add_argument('--public-origin', required=True)
p.add_argument('--admin-origin', required=True)
p.add_argument('--immich-origin', required=True)
p.add_argument('--certificate-name', required=True)
p.add_argument('--http-only', action='store_true')
a = p.parse_args()

def host(origin):
    value = urlsplit(origin)
    if value.scheme != 'https' or not value.hostname or value.netloc != value.hostname or value.path not in ('', '/') or value.query or value.fragment:
        raise SystemExit('Expected an HTTPS origin with a DNS name and no path or port')
    if not re.fullmatch(r'[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?', value.hostname):
        raise SystemExit('Invalid DNS name')
    return value.hostname

hosts = [host(a.public_origin), host(a.admin_origin), host(a.immich_origin)]
if len(set(hosts)) != 3 or not re.fullmatch(r'[a-zA-Z0-9_.-]+', a.certificate_name):
    raise SystemExit('Expected three distinct hosts and a safe certificate name')
print('# BEGIN GALLERY MANAGED VHOSTS')
print('server {\n    listen 80;\n    server_name ' + ' '.join(hosts) + ';')
print('    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }')
print('    location / { ' + ('return 503;' if a.http_only else 'return 308 https://$host$request_uri;') + ' }\n}')
if not a.http_only:
    for domain, upstream, limit in zip(hosts, ['vision-gallery-public:3000', 'vision-gallery-admin:3000', 'vision-immich:2283'], ['1M', '12M', '50000M']):
        print(f'''server {{
    listen 443 ssl;
    server_name {domain};
    ssl_certificate /etc/letsencrypt/live/{a.certificate_name}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{a.certificate_name}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size {limit};
    resolver 127.0.0.11 valid=30s ipv6=off;
    set $gallery_upstream {upstream};
    location / {{
        proxy_pass http://$gallery_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        send_timeout 600s;
    }}
}}''')
print('# END GALLERY MANAGED VHOSTS')

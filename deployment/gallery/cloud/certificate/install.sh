#!/bin/sh
# Run from the reviewed Git checkout on ECS. Does not issue a cert, enable a timer,
# change DNS/IAM, or replace the existing Edge/JVS certificate tasks.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root on ECS' >&2; exit 1; }
src=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
base=/opt/gallery-certificate
revision=d5fc938d80e266dba3239f54cf4665432f17c00b
command -v python3 >/dev/null
command -v git >/dev/null
command -v curl >/dev/null
command -v openssl >/dev/null
command -v flock >/dev/null
command -v nft >/dev/null
python3 -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11 or newer is required"'
if ! id gallery-certificate >/dev/null 2>&1; then
  useradd --system --home-dir /srv/vision/certificate --shell /usr/sbin/nologin gallery-certificate
fi
install -d -m 0755 "$base" /etc/gallery
install -d -m 0700 -o gallery-certificate -g gallery-certificate /srv/vision/certificate
if [ ! -d "$base/acme/.git" ]; then
  git init -q "$base/acme"
  git -C "$base/acme" remote add origin https://github.com/acmesh-official/acme.sh.git
fi
[ "$(git -C "$base/acme" remote get-url origin)" = https://github.com/acmesh-official/acme.sh.git ]
git -C "$base/acme" fetch --depth 1 origin "$revision"
git -C "$base/acme" checkout --detach "$revision"
[ "$(git -C "$base/acme" rev-parse HEAD)" = "$revision" ]
python3 -m venv "$base/venv"
"$base/venv/bin/pip" install -r "$src/requirements.lock"
install -m 0755 "$src/cloud_certificate.py" "$src/run.sh" "$src/metadata-guard.sh" "$base/"
install -m 0644 "$src/metadata-guard.nft" "$base/"
install -m 0644 "$src/dns_gallery.sh" "$base/acme/dnsapi/dns_gallery.sh"
if [ ! -f /etc/gallery/cdn-certificate.json ]; then
  install -m 0640 -g gallery-certificate "$src/config.example.json" /etc/gallery/cdn-certificate.json
fi
install -m 0644 "$src/gallery-certificate.service" "$src/gallery-certificate.timer" "$src/gallery-metadata-guard.service" /etc/systemd/system/
systemctl daemon-reload
printf '%s\n' 'Installed only. Review config, IAM and DNS; validate staging before issuing production.'

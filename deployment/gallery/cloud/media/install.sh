#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root from reviewed Git checkout'; exit 1; }
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -d -m 755 /opt/gallery-media /etc/gallery
install -d -m 711 /var/lib/gallery-media
install -d -o root -g 1000 -m 750 /var/lib/gallery-media/public
python3 -m venv /opt/gallery-media/venv
/opt/gallery-media/venv/bin/pip install --index-url https://pypi.org/simple -r "$source_dir/requirements.lock"
install -m 644 "$source_dir/sync.py" /opt/gallery-media/sync.py
if [ ! -f /etc/gallery/media-sync.json ]; then
  install -m 600 "$source_dir/config.example.json" /etc/gallery/media-sync.json
fi
install -m 644 "$source_dir/gallery-media-sync.service" "$source_dir/gallery-media-sync.timer" /etc/systemd/system/
systemctl daemon-reload
echo 'Installed. Configure signing key, CDN protection and public config before enabling timer.'

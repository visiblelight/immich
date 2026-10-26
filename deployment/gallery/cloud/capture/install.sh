#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root from the reviewed checkout'; exit 1; }
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -d -m 700 /opt/gallery-capture /var/lib/gallery-capture
install -m 700 "$source_dir/sync.sh" /opt/gallery-capture/sync.sh
install -m 600 "$source_dir/../../scripts/collect-capture-evidence.cjs" /opt/gallery-capture/collect-capture-evidence.cjs
install -m 644 "$source_dir/gallery-capture.service" "$source_dir/gallery-capture.timer" /etc/systemd/system/
systemctl daemon-reload
echo 'Installed; timer remains disabled. Validate migration and one scan before enabling.'

#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../../../.." && pwd)
python=${GALLERY_CERT_PYTHON:-"$root/.gallery-local/cloud-cert-venv/bin/python"}
"$python" -m unittest discover -s "$root/deployment/gallery/cloud/certificate" -p 'test_*.py' -v
"$python" -m unittest discover -s "$root/deployment/gallery/cloud/media" -p 'test_*.py' -v
sh -n "$root/deployment/gallery/cloud/media/install.sh"
sh -n "$root/deployment/gallery/cloud/certificate/run.sh"
sh -n "$root/deployment/gallery/cloud/certificate/dns_gallery.sh"
sh -n "$root/deployment/gallery/cloud/certificate/install.sh"
sh -n "$root/deployment/gallery/cloud/certificate/metadata-guard.sh"

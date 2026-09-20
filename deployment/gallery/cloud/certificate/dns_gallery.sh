#!/usr/bin/env sh
# acme.sh DNS alias hook. TXT tokens are public challenge data, not credentials.
dns_gallery_add() {
  /opt/gallery-certificate/venv/bin/python /opt/gallery-certificate/cloud_certificate.py dns-add "$1" "$2"
}
dns_gallery_rm() {
  /opt/gallery-certificate/venv/bin/python /opt/gallery-certificate/cloud_certificate.py dns-remove "$1" "$2"
}

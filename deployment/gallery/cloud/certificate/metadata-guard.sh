#!/bin/sh
set -eu
# Apply atomically, replacing only this task's dedicated table on repeat runs.
rules=/opt/gallery-certificate/metadata-guard.nft
if nft list table inet gallery_metadata_guard >/dev/null 2>&1; then
  { printf '%s\n' 'delete table inet gallery_metadata_guard'; cat "$rules"; } | nft -f -
else
  nft -f "$rules"
fi

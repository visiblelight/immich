#!/bin/sh
# Privileged maintenance only. Application containers never receive original media or owner credentials.
set -eu
umask 077
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$source_dir/worker.py"

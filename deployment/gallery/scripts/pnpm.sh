#!/bin/sh
set -eu

# Prefer the isolated local toolchain when present; otherwise use the user's mise/PATH.
GALLERY_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../../.." && pwd)
GALLERY_NODE="$GALLERY_ROOT/.gallery-local/toolchain/node-v24.15.0-darwin-arm64/bin"
if [ -x "$GALLERY_NODE/node" ]; then
  PATH="$GALLERY_NODE:$PATH"
  export PATH
  COREPACK_HOME="$GALLERY_ROOT/.gallery-local/corepack"
  XDG_CACHE_HOME="$GALLERY_ROOT/.gallery-local/cache"
  XDG_DATA_HOME="$GALLERY_ROOT/.gallery-local/data"
  XDG_STATE_HOME="$GALLERY_ROOT/.gallery-local/state"
  export COREPACK_HOME XDG_CACHE_HOME XDG_DATA_HOME XDG_STATE_HOME
  cd "$GALLERY_ROOT"
  exec pnpm --config.store-dir="$GALLERY_ROOT/.gallery-local/pnpm-store" "$@"
fi
cd "$GALLERY_ROOT"
exec pnpm "$@"

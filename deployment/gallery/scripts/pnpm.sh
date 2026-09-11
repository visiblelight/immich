#!/bin/sh
set -eu

# Fail on stale dependencies instead of allowing pnpm to reinstall the whole
# monorepo implicitly (which loses workspace filters and can cross host/Docker links).
pnpm_config_verify_deps_before_run=error
export pnpm_config_verify_deps_before_run

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
  # Nested pnpm calls (including dependency verification) must use the same store.
  npm_config_store_dir="$GALLERY_ROOT/.gallery-local/pnpm-store"
  export npm_config_store_dir
  cd "$GALLERY_ROOT"
  # Scope commands to Gallery; dependency mismatches require an explicit filtered
  # install. Unrelated Linux-only dependencies live in Docker volumes.
  exec pnpm --config.store-dir="$GALLERY_ROOT/.gallery-local/pnpm-store" --filter immich-monorepo --filter '@gallery/*' "$@"
fi
cd "$GALLERY_ROOT"
exec pnpm --filter immich-monorepo --filter '@gallery/*' "$@"

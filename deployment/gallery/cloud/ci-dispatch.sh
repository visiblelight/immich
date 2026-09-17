#!/bin/bash
set -euo pipefail
# Used with an authorized_keys restrict,command= entry, never a general SSH shell.
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})\ (ghcr.io/visiblelight/gallery@sha256:[0-9a-f]{64})$ ]]; then
    exec sudo -n /usr/local/lib/gallery/deploy.sh "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
echo 'Only Gallery deploy with a commit and immutable image digest is allowed' >&2
exit 2

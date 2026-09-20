#!/bin/sh
set -eu
umask 077
base=/opt/gallery-certificate
python="$base/venv/bin/python"
helper="$base/cloud_certificate.py"
state=$("$python" "$helper" config state_dir)
domain=$("$python" "$helper" config domain)
zone=$("$python" "$helper" config validation_zone)
email=$("$python" "$helper" config email)
mkdir -p "$state"
exec 9>"$state/task.lock"
flock -n 9 || exit 0
action=${1:-renew}
case "$action" in
  issue-staging) state="$state/staging"; server=letsencrypt_test ;;
  issue|renew|sync) server=letsencrypt ;;
  *) echo 'Expected issue-staging, issue, renew or sync' >&2; exit 2 ;;
esac
mkdir -p "$state/config" "$state/certs"
renew_result=0
if [ "$action" = issue ] || [ "$action" = issue-staging ]; then
  # Initial invocation accepts the CA terms; only run after the account holder's approval.
  "$base/acme/acme.sh" --issue --server "$server" --home "$base/acme" \
    --config-home "$state/config" --cert-home "$state/certs" --accountemail "$email" \
    --dns dns_gallery --challenge-alias "$zone" --dnssleep 1 --keylength ec-256 -d "$domain"
elif [ "$action" = renew ]; then
  "$base/acme/acme.sh" --cron --home "$base/acme" --config-home "$state/config" \
    --cert-home "$state/certs" || renew_result=$?
fi
if [ "$action" != issue-staging ]; then
  # Re-run deployment even when no renewal is due: repairs a previous failed deployment.
  "$python" "$helper" sync
fi
exit "$renew_result"

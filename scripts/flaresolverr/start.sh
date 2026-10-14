#!/bin/sh
set -eu

if [ -z "${PROXY_URL:-}" ] && [ -n "${HTTPS_PROXY:-${HTTP_PROXY:-}}" ]; then
    PROXY_URL="${HTTPS_PROXY:-$HTTP_PROXY}"
    export PROXY_URL
fi

# Optional public CA for environments whose outbound proxy terminates TLS.
if [ -n "${PROXY_CA_FILE:-}" ]; then
    mkdir -p "$HOME/.pki/nssdb"
    if [ ! -f "$HOME/.pki/nssdb/cert9.db" ]; then
        certutil -N --empty-password -d "sql:$HOME/.pki/nssdb"
    fi
    certutil -A -d "sql:$HOME/.pki/nssdb" -n paperback-test-proxy -t 'C,,' -i "$PROXY_CA_FILE"
fi

exec python /app/flaresolverr.py

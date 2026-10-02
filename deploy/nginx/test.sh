#!/bin/sh
# Render the template with fake values and validate it. Does not use docker.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

export KAVITA_API_KEY=fake-kavita-key LL_API_KEY=fake-ll-key SR_COUCH_USER_B64=ZmFrZTpmYWtl
envsubst '${KAVITA_API_KEY} ${LL_API_KEY} ${SR_COUCH_USER_B64}' \
  < "$here/reader.conf.template" > "$tmp/reader.conf"

if grep -n '\${' "$tmp/reader.conf"; then
  echo "FAIL: unresolved \${...} in rendered config" >&2
  exit 1
fi
for v in "$KAVITA_API_KEY" "$LL_API_KEY" "$SR_COUCH_USER_B64"; do
  grep -q "$v" "$tmp/reader.conf" || { echo "FAIL: $v not rendered" >&2; exit 1; }
done
grep -q '\$arg_cmd' "$tmp/reader.conf" || { echo "FAIL: nginx variable lost" >&2; exit 1; }

if command -v nginx >/dev/null 2>&1; then
  mkdir -p "$tmp/html"
  cat > "$tmp/nginx.conf" <<CONF
pid $tmp/nginx.pid;
error_log $tmp/error.log;
events {}
http {
  access_log off;
  client_body_temp_path $tmp/b; proxy_temp_path $tmp/p; fastcgi_temp_path $tmp/f;
  uwsgi_temp_path $tmp/u; scgi_temp_path $tmp/s;
  include $tmp/reader.conf;
}
CONF
  nginx -t -c "$tmp/nginx.conf"
else
  echo "nginx not installed: skipped nginx -t"
fi
echo "OK"

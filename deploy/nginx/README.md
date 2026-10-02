# Nginx config for the speedreader container

`reader.conf.template` serves the SPA and proxies `/api/*` to Kavita, LazyLibrarian and CouchDB.
The browser never sees a key; nginx adds them.

## Container settings

The official image renders files in `/etc/nginx/templates` into `/etc/nginx/conf.d`
(docs: https://hub.docker.com/_/nginx, section "Using environment variables in nginx configuration").
Mount the template as `/etc/nginx/templates/reader.conf.template`, make `/etc/nginx/conf.d`
writable, and set:

```
KAVITA_API_KEY=...
LL_API_KEY=...
SR_COUCH_USER_B64=<base64 of user:pass>
NGINX_ENVSUBST_FILTER=^(KAVITA_API_KEY|LL_API_KEY|SR_COUCH_USER_B64)$
```

The filter is required: without it envsubst would also replace nginx variables such as `$host`
and `$arg_cmd` with empty strings. Remove the image's default `default.conf` (or mount over it),
otherwise two servers listen on port 80.

## Test

`./test.sh` renders the template with fake values and checks for unresolved `${...}`.
If `nginx` is installed it also runs `nginx -t`.

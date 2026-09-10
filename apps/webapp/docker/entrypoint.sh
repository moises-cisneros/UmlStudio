#!/bin/sh
# Runtime entrypoint for the UmlStudio webapp container.
#
# - Writes /usr/share/nginx/html/env.js with window.__UMLSTUDIO_ENV__ object
#   for runtime config.

set -eu

HTML_DIR="/usr/share/nginx/html"
ENV_FILE="${HTML_DIR}/env.js"

log() { printf '[umlstudio-entrypoint] %s\n' "$*" >&2; }

cat > "$ENV_FILE" <<EOF
window.__UMLSTUDIO_ENV__ = {};
EOF

log "Wrote runtime env to ${ENV_FILE}."

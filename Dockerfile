FROM nginxinc/nginx-unprivileged:stable-alpine

LABEL org.opencontainers.image.title="WLED Preview" \
      org.opencontainers.image.description="Web UI to preview WLED presets on your own LED layout" \
      org.opencontainers.image.source="https://github.com/adman234/wled-preview" \
      org.opencontainers.image.licenses="MIT"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

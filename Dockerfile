FROM node:22-alpine3.24

ARG VERSION=1.7.0-beta.15
LABEL org.opencontainers.image.title="ProxPanel" \
      org.opencontainers.image.description="Self-hosted Proxmox VE management panel" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.url="https://proxpanel.fr" \
      org.opencontainers.image.source="https://github.com/ItechLabFr/proxpanel" \
      org.opencontainers.image.licenses="MIT"

# Security hardening for the runtime image:
# - refresh Alpine packages so security fixes from the stable repository are applied
# - rely on BusyBox unzip already included by Alpine for OTA extraction
# - add only the SSH client pieces required for lm-sensors collection
# - remove npm/corepack/yarn: ProxPanel has no runtime npm dependencies and these
#   toolchains unnecessarily increase the runtime attack surface and CVE count
RUN apk upgrade --no-cache \
    && apk add --no-cache openssh-client sshpass \
    && rm -rf /usr/local/lib/node_modules/npm \
              /usr/local/lib/node_modules/corepack \
              /opt/yarn-v* \
    && rm -f /usr/local/bin/npm \
             /usr/local/bin/npx \
             /usr/local/bin/corepack \
             /usr/local/bin/yarn \
             /usr/local/bin/yarnpkg \
    && rm -rf /var/cache/apk/* /tmp/*

WORKDIR /opt/proxpanel-bootstrap
COPY launcher.js ./launcher.js
COPY app /opt/proxpanel-seed
COPY release.json /opt/proxpanel-seed/release.json
RUN mkdir -p /opt/proxpanel-runtime /app/data \
    && chown -R node:node /opt/proxpanel-bootstrap /opt/proxpanel-seed /opt/proxpanel-runtime /app/data

USER node
ENV NODE_ENV=production \
    PORT=8080 \
    PROXPANEL_RUNTIME_DIR=/opt/proxpanel-runtime \
    PROXPANEL_DATA_DIR=/app/data \
    PROXPANEL_SEED_DIR=/opt/proxpanel-seed
EXPOSE 8080
VOLUME ["/app/data", "/opt/proxpanel-runtime"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "/opt/proxpanel-bootstrap/launcher.js"]

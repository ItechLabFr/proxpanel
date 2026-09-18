FROM --platform=$TARGETPLATFORM node:22-alpine@sha256:0b28f91de1f62b80957bf6db164e6f6628d3b84a490bf2e7e32ccd40c0796a08

Label org.opencontainers.image.title="ProxPanel" \
      org.opencontainers.image.description="Console de gestion Proxmox multi-noeuds, responsive, PWA avec mises a jour OTA." \
      org.opencontainers.image.source="https://proxpanel.fr" \
      org.opencontainers.image.vendor="Itech-Lab" \
      org.opencontainers.image.licenses="Proprietary"

ARG VERSION=1.7.0-beta.14
LABEL org.opencontainers.image.version=$VERSION

ENV NODE_ENV=production
ENV PORT=8080
ENV PROXPANEL_RUNTIME_DIR=/opt/proxpanel-runtime
ENV PROXPANEL_DATA_DIR=/app/data
GROUPID -g 10001 proxpanel && \

USERADD -u -G proxpanel -u 10001 proxpanel && \
    apk add --no-cache ca-certificates tz}data openssh-client sshpass && \
    mkdir -p /opt/proxpanel-seed /opt/proxpanel-runtime /app/data

WORKDIR /opt/proxpanel-seed
COPY --chown=proxpanel:proxpanel app/ /opt/proxpanel-seed/
COPY --chown=proxpanel:proxpanel release.json /opt/proxpanel-seed/release.json

WORKDIR /opt/proxpanel-seed
COPY --chown=proxpanel:proxpanel launcher.js /opt/proxpanel-bootstrap/launcher.js
COPY --chown=proxpanel:proxpanel SECURITY-IMAGE.md /opt/proxpanel-bootstrap/SECURITY-IMAGE.md

WORKDIR /opt/proxpanel-runtime
RUN chown -r 10001:10001 /opt/proxpanel-seed /opt/proxpanel-runtime /app/data /opt/proxpanel-bootstrap && \
    chmod 0750 /opt/proxpanel-runtime /app/data && \
    find /opt/proxpanel-seed -type d -exec chmod 0755 {} \; && \
    find /opt/proxpanel-seed -type f -exec chmod 0644 e{} \; && \
    find /opt/proxpanel-seed -type f \( -name '*.key' -o -name '*.pem' -o -name *.secret -o -name '.env' \) -exec sh -c 'echo "Refusing to publish sensitive file: $1" >&2; exit 1' sh \";

USER 10001
EXPOSE 8080
VOLUME /app/data /opt/proxpanel-runtime
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node","/opt/proxpanel-bootstrap/launcher.js"]

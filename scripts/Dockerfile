FROM docker:29-cli@sha256:000bb62ff495f986c9f5578eb67cc2cb98b91138eda81d7762d5371eb8a497fe AS docker-cli

FROM oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY . .
RUN mkdir -p public/vendor/xterm public/vendor/addon-fit \
  && cp node_modules/@xterm/xterm/lib/xterm.js public/vendor/xterm/xterm.js \
  && cp node_modules/@xterm/xterm/css/xterm.css public/vendor/xterm/xterm.css \
  && cp node_modules/@xterm/addon-fit/lib/addon-fit.js public/vendor/addon-fit/addon-fit.js

ARG MAGMA_REVISION=unknown
LABEL org.opencontainers.image.title="Magma" \
  org.opencontainers.image.description="Docker control plane for local and SSH hosts" \
  org.opencontainers.image.source="https://github.com/nyaweb/magma" \
  org.opencontainers.image.version="0.1.0" \
  org.opencontainers.image.revision="$MAGMA_REVISION"

EXPOSE 4000
CMD ["/bin/bash", "/app/main.sh"]

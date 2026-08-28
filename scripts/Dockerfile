FROM docker:29-cli@sha256:000bb62ff495f986c9f5578eb67cc2cb98b91138eda81d7762d5371eb8a497fe AS docker-cli

FROM oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

WORKDIR /app
COPY . .
RUN chmod +x /app/main.sh /app/magma.sh

ARG MAGMA_REVISION=unknown
LABEL org.opencontainers.image.title="Magma" \
  org.opencontainers.image.description="Tablero de orbes para Docker commit, compose y linaje" \
  org.opencontainers.image.source="https://github.com/nyaweb/magma" \
  org.opencontainers.image.version="1.4.0" \
  org.opencontainers.image.revision="$MAGMA_REVISION"

EXPOSE 3100
CMD ["/bin/bash", "/app/main.sh"]

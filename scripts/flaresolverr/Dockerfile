FROM ghcr.io/flaresolverr/flaresolverr:v3.4.6

USER root
RUN --mount=type=secret,id=proxy_ca \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends libnss3-tools \
    && rm -rf /var/lib/apt/lists/*

# FlareSolverr disables TLS verification by default. Use Chromium's trust store.
RUN sed -i '/options.add_argument.*--ignore-certificate-errors/d; /options.add_argument.*--ignore-ssl-errors/d' /app/utils.py
COPY --chmod=0555 start.sh /app/start-tests.sh
USER flaresolverr
ENTRYPOINT ["sh", "/app/start-tests.sh"]

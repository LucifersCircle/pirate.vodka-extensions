FROM ghcr.io/flaresolverr/flaresolverr:v3.4.6

USER root
RUN --mount=type=secret,id=proxy_ca \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends libnss3-tools \
    && rm -rf /var/lib/apt/lists/*

# Fail closed on upstream changes; allow passive page/JS waiting, never CAPTCHA input.
COPY --chmod=0444 browser_request.py patch_passive.py passive_verification.py test_passive.py /app/
RUN python /app/patch_passive.py /app && python /app/test_passive.py --source /app
RUN sed -i '/^if __name__ == "__main__":/i\import browser_request\nbrowser_request.register(app)\n' /app/flaresolverr.py
COPY --chmod=0555 start.sh /app/start-tests.sh
USER flaresolverr
ENTRYPOINT ["sh", "/app/start-tests.sh"]

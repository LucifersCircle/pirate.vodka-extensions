FROM ghcr.io/flaresolverr/flaresolverr:v3.4.6

USER root
RUN --mount=type=secret,id=proxy_ca \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends libnss3-tools \
    && rm -rf /var/lib/apt/lists/*

# FlareSolverr disables TLS verification by default. Use Chromium's trust store.
RUN sed -i '/options.add_argument.*--ignore-certificate-errors/d; /options.add_argument.*--ignore-ssl-errors/d' /app/utils.py
# Refuse WebView execution if the browser accepts invalid certificates. Keep
# ordinary Chromium TLS verification enabled for every source in this container.
RUN sed -i '/options =.*ChromeOptions()/a\    options.set_capability("acceptInsecureCerts", False)' /app/utils.py \
    && grep -q 'options.set_capability("acceptInsecureCerts", False)' /app/utils.py
COPY --chmod=0444 browser_request.py /app/browser_request.py
RUN sed -i '/^if __name__ == "__main__":/i\import browser_request\nbrowser_request.register(app)\n' /app/flaresolverr.py
COPY --chmod=0444 paperback_webview.py /app/paperback_webview.py
RUN sed -i '/^if __name__ == "__main__":/i\import paperback_webview\npaperback_webview.register(app)\n' /app/flaresolverr.py
COPY --chmod=0444 cloudflare_assistance.py cloudflare_assistance_contract.py /app/
RUN sed -i '/^if __name__ == "__main__":/i\import cloudflare_assistance\ncloudflare_assistance.register(app)\n' /app/flaresolverr.py
COPY --chmod=0555 start.sh /app/start-tests.sh
USER flaresolverr
ENTRYPOINT ["sh", "/app/start-tests.sh"]

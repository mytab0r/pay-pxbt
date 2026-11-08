# pay.pxbt.app: Node stdlib в рантайме; единственная сборка — бандл WalletConnect (web/ -> esbuild).
#   docker build -f deploy/pay-page/Dockerfile .

# WalletConnect собираем на своём домене: esm.sh в рантайме падал у части провайдеров,
# из-за этого кнопка подключения кошелька «умирала».
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/entry.js ./
RUN npx esbuild entry.js --bundle --format=iife --minify --outfile=/web/paywc.js

FROM node:22-alpine
WORKDIR /app
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV PORT=8080 DATA_DIR=/data
COPY functions ./functions
COPY config/payment-providers.json ./deploy/pay-page/payment-providers.json
COPY deploy/pay-page/server.mjs ./deploy/pay-page/server.mjs
COPY deploy/pay-page/public/favicon.svg ./deploy/pay-page/public/favicon.svg
COPY --from=web /web/paywc.js ./deploy/pay-page/public/paywc.js
# projectId Reown публичный (уходит в HTML каждому браузеру), не секрет; secrets.json перекрывает
ENV REOWN_PROJECT_ID=987afabd28d84f735c75cab6a6742e54
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "deploy/pay-page/server.mjs"]

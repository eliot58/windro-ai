FROM mirror.gcr.io/library/node:24.14.0-slim AS base

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
# Видеокарты на сервере нет, поэтому библиотеки CUDA не скачиваем
ENV ONNXRUNTIME_NODE_INSTALL=skip

FROM base AS manifest
COPY package.json ./
RUN node -e "const p = require('./package.json'); \
  const keep = { name: p.name, version: p.version, dependencies: p.dependencies, devDependencies: p.devDependencies }; \
  if (p.overrides) keep.overrides = p.overrides; \
  require('fs').mkdirSync('/deps'); \
  require('fs').writeFileSync('/deps/package.json', JSON.stringify(keep, null, 2));"

FROM base AS build
COPY --from=manifest /deps/package.json ./package.json
COPY package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL="postgresql://db:5432/db" npx prisma generate
RUN npm run build

FROM base
# LibreOffice конвертирует DOC и DOCX в PDF. Шрифты заменяют Arial и Calibri,
# без них вёрстка таблиц в документах съезжает
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer fonts-liberation fonts-crosextra-carlito \
  && rm -rf /var/lib/apt/lists/*
COPY --from=manifest /deps/package.json ./package.json
COPY package-lock.json ./
# Сборки для других систем только раздувают образ
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf node_modules/onnxruntime-node/bin/napi-v*/win32 \
    node_modules/onnxruntime-node/bin/napi-v*/darwin \
    node_modules/onnxruntime-node/bin/napi-v*/linux/arm64
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY --from=build /usr/src/app/dist ./dist

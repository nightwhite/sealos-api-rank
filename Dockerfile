FROM public.ecr.aws/docker/library/node:22.22.2-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM public.ecr.aws/docker/library/node:22.22.2-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3099
ENV DATABASE_PATH=data/rank.sqlite
ENV TZ=Asia/Shanghai

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3099

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:' + (process.env.PORT || 3099) + '/', (res) => process.exit(res.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]

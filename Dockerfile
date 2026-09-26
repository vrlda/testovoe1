FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_PATH=/app/data/funnel.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY dist ./dist
COPY server ./server
COPY shared ./shared
COPY configs ./configs
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node","--experimental-strip-types","server/index.ts"]

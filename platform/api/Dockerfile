FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Stamped into the image so /health can say which build is running.
#
# "Is the deployed API current?" had no answer for weeks, and the cost was a
# working camera being blamed for a stale container. Pass these from compose:
#   BUILD_COMMIT: git rev-parse --short HEAD
#   BUILD_TIME:   date -u +%Y-%m-%dT%H:%M:%SZ
# They default to "unknown", which is honest — a wrong hash would be worse
# than none, because it ends an investigation that should have continued.
ARG BUILD_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV BUILD_COMMIT=$BUILD_COMMIT
ENV BUILD_TIME=$BUILD_TIME
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8080
CMD ["node", "dist/index.js"]

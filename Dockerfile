# Circuvent WebSite (marketing/shop) — Platform VM port 3022
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund --ignore-scripts

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DATABASE_DRIVER=pg
ENV DATABASE_SSL=false
ENV ACCOUNT_SECRET=build-only-placeholder-not-for-runtime-32chars-xx
ENV NEXT_PUBLIC_SITE_URL=https://circuvent.com
ENV ADMIN_SSO_ISSUER=https://myaccount.circuvent.com
ENV ADMIN_SSO_CLIENT_ID=website-admin
ENV CV365_URL=https://work.circuvent.com
ENV NEXT_PUBLIC_CV365_URL=https://work.circuvent.com
ENV CONTROL_PLANE_URL=https://api.circuvent.com
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3022
RUN useradd --system --uid 1001 --create-home nextjs
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
USER nextjs
EXPOSE 3022
CMD ["npx", "next", "start", "-p", "3022", "-H", "0.0.0.0"]

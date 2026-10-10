FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/web --include-workspace-root --ignore-scripts
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm --workspace apps/web run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3280 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3280
CMD ["node", "apps/web/server.js"]

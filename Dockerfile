FROM node:26-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN npm install --global pnpm@12.16.1

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter apps-web build
RUN pnpm --filter apps-api build
RUN pnpm --filter apps-api deploy --prod /prod/app

FROM node:26-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/app ./
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/contracts/openapi ./packages/contracts/openapi

EXPOSE 3000
CMD ["node", "dist/server.js"]

FROM node:24-alpine AS dependencies

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY apps/runtime/package.json apps/runtime/package-lock.json ./

RUN npm ci

FROM dependencies AS development

COPY apps/runtime/ ./

CMD ["npm", "run", "dev"]

FROM dependencies AS build

COPY apps/runtime/ ./

RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY apps/runtime/package.json apps/runtime/package-lock.json ./

RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]

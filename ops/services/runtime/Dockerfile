FROM node:24-alpine

WORKDIR /app

COPY apps/runtime/package.json apps/runtime/package-lock.json ./

RUN npm ci

COPY apps/runtime/ ./

CMD ["npm", "run", "dev"]

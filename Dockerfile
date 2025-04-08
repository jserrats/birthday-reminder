FROM node:20 AS builder

WORKDIR /usr/src/app
COPY --chown=node:node package.json ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src/ ./src

RUN npm install && npm run build

FROM node:20 AS production

USER node
WORKDIR /usr/src/app

COPY --chown=node:node package.json ./

COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["node", "./dist/src/index.js"]
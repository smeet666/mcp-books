# How this server is built for a directory that runs it in a container.
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# The image ships a user for the purpose, and a read-only client of two public
# websites has nothing to do with root.
USER node

CMD ["node", "dist/index.js"]

FROM node:20-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
RUN npm install --omit=dev
COPY --chown=node:node . .
EXPOSE 3001
USER node
CMD ["node", "server.js"]


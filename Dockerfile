FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node package.json ./
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "src/server.js"]

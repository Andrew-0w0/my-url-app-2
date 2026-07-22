FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]

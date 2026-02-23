FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_GITHUB_TOKEN
ENV VITE_GITHUB_TOKEN=$VITE_GITHUB_TOKEN
RUN node scripts/cache-github.js && npm run build

FROM node:20-alpine
RUN npm install -g serve
COPY --from=builder /app/dist /app
CMD ["sh", "-c", "serve -s /app -l ${PORT:-8080}"]

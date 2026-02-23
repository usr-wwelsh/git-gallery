FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN npm install -g serve
COPY --from=builder /app/dist /app
CMD ["sh", "-c", "serve -s /app -l ${PORT:-8080}"]

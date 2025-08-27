# Backend Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install || true
COPY . .
RUN npm run build
EXPOSE 8787
CMD [ "node", "dist/index.js" ]

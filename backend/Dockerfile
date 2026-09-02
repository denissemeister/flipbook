FROM node:20-alpine

# Install build deps for sharp (native bindings)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3000
CMD ["node", "src/index.js"]

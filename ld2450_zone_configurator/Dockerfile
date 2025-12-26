ARG BUILD_FROM
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the static files
RUN npm run build

# Production stage
FROM $BUILD_FROM

# Install nginx
RUN apk add --no-cache nginx

# Copy built files from builder
COPY --from=builder /app/dist /var/www/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Create nginx pid directory
RUN mkdir -p /run/nginx

# Copy s6-overlay service files
COPY rootfs /

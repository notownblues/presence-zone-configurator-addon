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

# Copy run script
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Copy config template script
COPY generate-config.sh /generate-config.sh
RUN chmod +x /generate-config.sh

WORKDIR /var/www/html

CMD ["/run.sh"]

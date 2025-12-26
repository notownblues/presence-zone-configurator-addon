ARG BUILD_FROM
FROM $BUILD_FROM

# Install nginx and nodejs for building
RUN apk add --no-cache nginx nodejs npm

# Create nginx pid directory
RUN mkdir -p /run/nginx

# Copy and build the web app
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Move built files to nginx directory
RUN cp -r /app/dist/* /var/www/html/ || mkdir -p /var/www/html && cp -r /app/dist/* /var/www/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Cleanup build files
RUN rm -rf /app/node_modules /app/src

# Copy s6-overlay service files
COPY rootfs /

#!/usr/bin/env bashio

# Generate runtime configuration from HA options
/generate-config.sh

bashio::log.info "Starting LD2450 Zone Configurator..."

# Start nginx
exec nginx -g "daemon off;"

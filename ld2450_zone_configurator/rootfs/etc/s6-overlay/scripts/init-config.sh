#!/command/with-contenv bashio

MQTT_HOST=$(bashio::config 'mqtt_host')
MQTT_PORT=$(bashio::config 'mqtt_port')
MQTT_USERNAME=$(bashio::config 'mqtt_username')
MQTT_PASSWORD=$(bashio::config 'mqtt_password')
MQTT_BASE_TOPIC=$(bashio::config 'mqtt_base_topic')

bashio::log.info "Configuring MQTT: ${MQTT_HOST}:${MQTT_PORT}"

cat > /var/www/html/config.json << EOF
{
  "mqtt": {
    "host": "${MQTT_HOST}",
    "port": ${MQTT_PORT},
    "wsPort": 9001,
    "username": "${MQTT_USERNAME}",
    "password": "${MQTT_PASSWORD}",
    "baseTopic": "${MQTT_BASE_TOPIC}"
  }
}
EOF

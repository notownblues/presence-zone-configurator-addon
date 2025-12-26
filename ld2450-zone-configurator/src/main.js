import mqtt from 'mqtt';
import { RadarCanvas } from './radarCanvas.js';
import { ZoneManager } from './zoneManager.js';

// LocalStorage key for saving credentials
const STORAGE_KEY = 'ld2450_zone_config_settings';

// ============================================================================
// Application State
// ============================================================================

const state = {
    mqtt: {
        client: null,
        connected: false,
        broker: 'ws://localhost:9001',
        username: '',
        password: '',
        baseTopic: 'zigbee2mqtt/SHS01'
    },
    sensor: {
        targets: [],
        targetCount: 0,
        occupancy: false,
        positionReporting: false,
        zones: [
            { occupied: false },
            { occupied: false },
            { occupied: false }
        ],
        // Store raw position data from MQTT
        positions: {
            t1: { x: 0, y: 0, distance: 0 },
            t2: { x: 0, y: 0, distance: 0 },
            t3: { x: 0, y: 0, distance: 0 }
        }
    },
    zones: {
        type: 0, // 0=disabled, 1=detection, 2=filter
        zones: [
            { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
            { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
            { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 }
        ]
    },
    ui: {
        activeZone: 1
    },
    // Home Assistant addon configuration
    haConfig: null,
    isAddonMode: false
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
    // MQTT Connection
    mqttStatus: document.getElementById('mqttStatus'),
    mqttStatusText: document.getElementById('mqttStatusText'),
    mqttBroker: document.getElementById('mqttBroker'),
    mqttUsername: document.getElementById('mqttUsername'),
    mqttPassword: document.getElementById('mqttPassword'),
    mqttTopic: document.getElementById('mqttTopic'),
    connectBtn: document.getElementById('connectBtn'),
    positionReportingBtn: document.getElementById('positionReportingBtn'),

    // Canvas
    radarCanvas: document.getElementById('radarCanvas'),

    // Target Info
    targetCount: document.getElementById('targetCount'),
    occupancy: document.getElementById('occupancy'),
    targetList: document.getElementById('targetList'),

    // Zone Controls
    zoneType: document.getElementById('zoneType'),
    zoneTabs: document.querySelectorAll('.zone-tab'),
    zone1Editor: document.getElementById('zone1Editor'),
    zone2Editor: document.getElementById('zone2Editor'),
    zone3Editor: document.getElementById('zone3Editor'),

    // Zone 1
    zone1Enable: document.getElementById('zone1Enable'),
    zone1X1: document.getElementById('zone1X1'),
    zone1Y1: document.getElementById('zone1Y1'),
    zone1X2: document.getElementById('zone1X2'),
    zone1Y2: document.getElementById('zone1Y2'),
    zone1Status: document.getElementById('zone1Status'),

    // Zone 2
    zone2Enable: document.getElementById('zone2Enable'),
    zone2X1: document.getElementById('zone2X1'),
    zone2Y1: document.getElementById('zone2Y1'),
    zone2X2: document.getElementById('zone2X2'),
    zone2Y2: document.getElementById('zone2Y2'),
    zone2Status: document.getElementById('zone2Status'),

    // Zone 3
    zone3Enable: document.getElementById('zone3Enable'),
    zone3X1: document.getElementById('zone3X1'),
    zone3Y1: document.getElementById('zone3Y1'),
    zone3X2: document.getElementById('zone3X2'),
    zone3Y2: document.getElementById('zone3Y2'),
    zone3Status: document.getElementById('zone3Status'),

    // Buttons
    applyZonesBtn: document.getElementById('applyZonesBtn'),
    resetZonesBtn: document.getElementById('resetZonesBtn')
};

// ============================================================================
// Radar Canvas & Zone Manager
// ============================================================================

const radarCanvas = new RadarCanvas(elements.radarCanvas);
const zoneManager = new ZoneManager(state.zones);

// ============================================================================
// Home Assistant Addon Configuration
// ============================================================================

async function loadHAConfig() {
    try {
        const response = await fetch('/config.json');
        if (response.ok) {
            const config = await response.json();
            console.log('Loaded Home Assistant addon config:', config);
            state.haConfig = config;
            state.isAddonMode = true;
            applyHAConfig(config);
            return true;
        }
    } catch (error) {
        console.log('No HA config found, running in standalone mode');
    }
    return false;
}

function applyHAConfig(config) {
    if (!config.mqtt) return;

    // Build WebSocket URL for MQTT
    // In HA addon mode, we need to connect via WebSocket to the MQTT broker
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = config.mqtt.host || 'core-mosquitto';
    const wsPort = config.mqtt.wsPort || 9001;

    // For HA addons, construct the broker URL
    // If running inside HA, use the internal hostname
    const brokerUrl = `${wsProtocol}//${host}:${wsPort}`;

    elements.mqttBroker.value = brokerUrl;
    if (config.mqtt.username) {
        elements.mqttUsername.value = config.mqtt.username;
    }
    if (config.mqtt.password) {
        elements.mqttPassword.value = config.mqtt.password;
    }
    if (config.mqtt.baseTopic) {
        elements.mqttTopic.value = config.mqtt.baseTopic;
    }

    console.log('Applied HA config - Broker:', brokerUrl, 'Topic:', config.mqtt.baseTopic);
}

// ============================================================================
// MQTT Functions
// ============================================================================

function connectMQTT() {
    const broker = elements.mqttBroker.value;
    const username = elements.mqttUsername.value;
    const password = elements.mqttPassword.value;
    const baseTopic = elements.mqttTopic.value;

    // Update state
    state.mqtt.broker = broker;
    state.mqtt.username = username;
    state.mqtt.password = password;
    state.mqtt.baseTopic = baseTopic;

    // Create MQTT client options
    const options = {
        clientId: `ld2450-configurator-${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 5000
    };

    if (username) {
        options.username = username;
        options.password = password;
    }

    console.log('Connecting to MQTT broker:', broker);
    elements.mqttStatusText.textContent = 'Connecting...';

    // Connect to broker
    state.mqtt.client = mqtt.connect(broker, options);

    // Connection events
    state.mqtt.client.on('connect', () => {
        console.log('Connected to MQTT broker');
        state.mqtt.connected = true;
        updateConnectionStatus(true);

        // Subscribe to sensor data topic (occupancy, zones, target count, position data)
        const topic = `${baseTopic}`;
        state.mqtt.client.subscribe(topic, (err) => {
            if (err) {
                console.error('Failed to subscribe to sensor topic:', err);
            } else {
                console.log('Subscribed to sensor data:', topic);
            }
        });

        // Enable position reporting button
        if (elements.positionReportingBtn) {
            elements.positionReportingBtn.disabled = false;
        }
    });

    state.mqtt.client.on('error', (error) => {
        console.error('MQTT error:', error);
        updateConnectionStatus(false);
    });

    state.mqtt.client.on('close', () => {
        console.log('Disconnected from MQTT broker');
        state.mqtt.connected = false;
        updateConnectionStatus(false);
    });

    state.mqtt.client.on('message', handleMQTTMessage);
}

function disconnectMQTT() {
    if (state.mqtt.client) {
        state.mqtt.client.end();
        state.mqtt.client = null;
        state.mqtt.connected = false;
        updateConnectionStatus(false);
    }

    // Disable position reporting button
    if (elements.positionReportingBtn) {
        elements.positionReportingBtn.disabled = true;
    }
}

// ============================================================================
// MQTT Message Handling
// ============================================================================

function handleMQTTMessage(topic, message) {
    try {
        const data = JSON.parse(message.toString());
        console.log('Received MQTT message:', data);

        // Update target count from Zigbee2MQTT
        if (data.ld2450_target_count !== undefined) {
            state.sensor.targetCount = data.ld2450_target_count;
            updateTargetCountDisplay();
        }

        // Update occupancy
        if (data.occupancy_ld2450 !== undefined) {
            state.sensor.occupancy = data.occupancy_ld2450;
            updateOccupancyDisplay();
        }

        // Update position reporting status
        if (data.position_reporting !== undefined) {
            state.sensor.positionReporting = data.position_reporting;
            updatePositionReportingButton();
        }

        // Update zone occupancy
        if (data.zone1_occupied !== undefined) {
            state.sensor.zones[0].occupied = data.zone1_occupied;
            elements.zone1Status.textContent = data.zone1_occupied ? 'Occupied' : 'Clear';
            elements.zone1Status.classList.toggle('occupied', data.zone1_occupied);
        }
        if (data.zone2_occupied !== undefined) {
            state.sensor.zones[1].occupied = data.zone2_occupied;
            elements.zone2Status.textContent = data.zone2_occupied ? 'Occupied' : 'Clear';
            elements.zone2Status.classList.toggle('occupied', data.zone2_occupied);
        }
        if (data.zone3_occupied !== undefined) {
            state.sensor.zones[2].occupied = data.zone3_occupied;
            elements.zone3Status.textContent = data.zone3_occupied ? 'Occupied' : 'Clear';
            elements.zone3Status.classList.toggle('occupied', data.zone3_occupied);
        }

        // Update position data from EP8-16 (Target 1, 2, 3 X/Y/Distance)
        // Target 1: EP8=X, EP9=Y, EP10=Distance
        if (data.target1_x !== undefined) {
            const isNegative = data.target1_x < 0;
            console.log(`[DEBUG] Received target1_x: ${data.target1_x} (${isNegative ? 'LEFT' : 'RIGHT'} side, type: ${typeof data.target1_x})`);
            state.sensor.positions.t1.x = data.target1_x;
        }
        if (data.target1_y !== undefined) state.sensor.positions.t1.y = data.target1_y;
        if (data.target1_distance !== undefined) state.sensor.positions.t1.distance = data.target1_distance;

        // Target 2: EP11=X, EP12=Y, EP13=Distance
        if (data.target2_x !== undefined) state.sensor.positions.t2.x = data.target2_x;
        if (data.target2_y !== undefined) state.sensor.positions.t2.y = data.target2_y;
        if (data.target2_distance !== undefined) state.sensor.positions.t2.distance = data.target2_distance;

        // Target 3: EP14=X, EP15=Y, EP16=Distance
        if (data.target3_x !== undefined) state.sensor.positions.t3.x = data.target3_x;
        if (data.target3_y !== undefined) state.sensor.positions.t3.y = data.target3_y;
        if (data.target3_distance !== undefined) state.sensor.positions.t3.distance = data.target3_distance;

        // Build targets array from position data
        updateTargetsFromPositions();

        // Redraw canvas with current targets
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);

    } catch (error) {
        console.error('Error parsing MQTT message:', error);
    }
}

function updateTargetsFromPositions() {
    state.sensor.targets = [];

    // Add target 1 if active (non-zero position)
    if (state.sensor.positions.t1.x !== 0 || state.sensor.positions.t1.y !== 0) {
        state.sensor.targets.push({
            x: state.sensor.positions.t1.x,
            y: state.sensor.positions.t1.y,
            distance: state.sensor.positions.t1.distance,
            speed: 0  // Speed not provided via Zigbee
        });
    }

    // Add target 2 if active
    if (state.sensor.positions.t2.x !== 0 || state.sensor.positions.t2.y !== 0) {
        state.sensor.targets.push({
            x: state.sensor.positions.t2.x,
            y: state.sensor.positions.t2.y,
            distance: state.sensor.positions.t2.distance,
            speed: 0
        });
    }

    // Add target 3 if active
    if (state.sensor.positions.t3.x !== 0 || state.sensor.positions.t3.y !== 0) {
        state.sensor.targets.push({
            x: state.sensor.positions.t3.x,
            y: state.sensor.positions.t3.y,
            distance: state.sensor.positions.t3.distance,
            speed: 0
        });
    }

    updateTargetListDisplay();
}

function togglePositionReporting() {
    if (!state.mqtt.connected || !state.mqtt.client) {
        alert('Not connected to MQTT broker');
        return;
    }

    // Toggle the state
    const newState = !state.sensor.positionReporting;

    // Publish to set topic
    const config = { position_reporting: newState };
    const topic = `${state.mqtt.baseTopic}/set`;

    state.mqtt.client.publish(topic, JSON.stringify(config), { retain: false }, (err) => {
        if (err) {
            console.error('Failed to toggle position reporting:', err);
            alert('Failed to toggle position reporting');
        } else {
            console.log('Toggled position reporting:', newState);
        }
    });
}

function publishZoneConfig() {
    if (!state.mqtt.connected || !state.mqtt.client) {
        alert('Not connected to MQTT broker');
        return;
    }

    // Build zone configuration message
    const config = {
        zone_type: state.zones.type,
        zone1_enabled: state.zones.zones[0].enabled,
        zone1_x1: state.zones.zones[0].x1,
        zone1_y1: state.zones.zones[0].y1,
        zone1_x2: state.zones.zones[0].x2,
        zone1_y2: state.zones.zones[0].y2,
        zone2_enabled: state.zones.zones[1].enabled,
        zone2_x1: state.zones.zones[1].x1,
        zone2_y1: state.zones.zones[1].y1,
        zone2_x2: state.zones.zones[1].x2,
        zone2_y2: state.zones.zones[1].y2,
        zone3_enabled: state.zones.zones[2].enabled,
        zone3_x1: state.zones.zones[2].x1,
        zone3_y1: state.zones.zones[2].y1,
        zone3_x2: state.zones.zones[2].x2,
        zone3_y2: state.zones.zones[2].y2
    };

    // Publish to set topic
    const topic = `${state.mqtt.baseTopic}/set`;
    state.mqtt.client.publish(topic, JSON.stringify(config), { retain: false }, (err) => {
        if (err) {
            console.error('Failed to publish zone config:', err);
            alert('Failed to apply zone configuration');
        } else {
            console.log('Published zone config:', config);
            alert('Zone configuration applied successfully!');
        }
    });
}

// ============================================================================
// LocalStorage Functions
// ============================================================================

function saveCredentials() {
    const settings = {
        broker: elements.mqttBroker.value,
        username: elements.mqttUsername.value,
        password: elements.mqttPassword.value,
        baseTopic: elements.mqttTopic.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    console.log('Saved credentials to localStorage');
}

function loadCredentials() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.broker) elements.mqttBroker.value = settings.broker;
            if (settings.username) elements.mqttUsername.value = settings.username;
            if (settings.password) elements.mqttPassword.value = settings.password;
            if (settings.baseTopic) elements.mqttTopic.value = settings.baseTopic;
            console.log('Loaded credentials from localStorage');
        }
    } catch (error) {
        console.error('Error loading credentials:', error);
    }
}

// ============================================================================
// UI Update Functions
// ============================================================================

function updateConnectionStatus(connected) {
    if (connected) {
        elements.mqttStatus.classList.add('online');
        elements.mqttStatusText.textContent = 'Connected';
        if (elements.connectBtn) {
            elements.connectBtn.textContent = 'Disconnect';
            elements.connectBtn.classList.remove('btn-primary');
            elements.connectBtn.classList.add('btn-danger');
        }
    } else {
        elements.mqttStatus.classList.remove('online');
        elements.mqttStatusText.textContent = 'Disconnected';
        if (elements.connectBtn) {
            elements.connectBtn.textContent = 'Connect';
            elements.connectBtn.classList.remove('btn-danger');
            elements.connectBtn.classList.add('btn-primary');
        }
    }
}

function updateTargetCountDisplay() {
    elements.targetCount.textContent = state.sensor.targetCount;
}

function updateOccupancyDisplay() {
    elements.occupancy.textContent = state.sensor.occupancy ? 'Occupied' : 'Clear';
    elements.occupancy.style.color = state.sensor.occupancy ? '#3fb950' : '#8b949e';
}

function updateTargetListDisplay() {
    if (state.sensor.targets.length === 0) {
        elements.targetList.innerHTML = '<p class="text-muted">No targets detected</p>';
        return;
    }

    elements.targetList.innerHTML = state.sensor.targets.map((target, i) => `
        <div class="target-item">
            <strong>Target ${i + 1}:</strong>
            X=${target.x}mm, Y=${target.y}mm,
            Dist=${Math.round(target.distance)}mm
        </div>
    `).join('');
}

function updatePositionReportingButton() {
    if (!elements.positionReportingBtn) return;

    if (state.sensor.positionReporting) {
        elements.positionReportingBtn.textContent = 'Disable Position Reporting';
        elements.positionReportingBtn.classList.add('btn-warning');
        elements.positionReportingBtn.classList.remove('btn-secondary');
    } else {
        elements.positionReportingBtn.textContent = 'Enable Position Reporting';
        elements.positionReportingBtn.classList.remove('btn-warning');
        elements.positionReportingBtn.classList.add('btn-secondary');
    }
}

function switchZoneTab(zoneNumber) {
    // Update active tab
    elements.zoneTabs.forEach(tab => {
        tab.classList.toggle('active', parseInt(tab.dataset.zone) === zoneNumber);
    });

    // Show corresponding editor
    elements.zone1Editor.style.display = zoneNumber === 1 ? 'block' : 'none';
    elements.zone2Editor.style.display = zoneNumber === 2 ? 'block' : 'none';
    elements.zone3Editor.style.display = zoneNumber === 3 ? 'block' : 'none';

    state.ui.activeZone = zoneNumber;
}

function loadZoneFormValues() {
    // Zone Type
    elements.zoneType.value = state.zones.type;

    // Zone 1
    elements.zone1Enable.checked = state.zones.zones[0].enabled;
    elements.zone1X1.value = state.zones.zones[0].x1;
    elements.zone1Y1.value = state.zones.zones[0].y1;
    elements.zone1X2.value = state.zones.zones[0].x2;
    elements.zone1Y2.value = state.zones.zones[0].y2;

    // Zone 2
    elements.zone2Enable.checked = state.zones.zones[1].enabled;
    elements.zone2X1.value = state.zones.zones[1].x1;
    elements.zone2Y1.value = state.zones.zones[1].y1;
    elements.zone2X2.value = state.zones.zones[1].x2;
    elements.zone2Y2.value = state.zones.zones[1].y2;

    // Zone 3
    elements.zone3Enable.checked = state.zones.zones[2].enabled;
    elements.zone3X1.value = state.zones.zones[2].x1;
    elements.zone3Y1.value = state.zones.zones[2].y1;
    elements.zone3X2.value = state.zones.zones[2].x2;
    elements.zone3Y2.value = state.zones.zones[2].y2;
}

function saveZoneFormValues() {
    // Zone Type
    state.zones.type = parseInt(elements.zoneType.value);

    // Zone 1
    state.zones.zones[0].enabled = elements.zone1Enable.checked;
    state.zones.zones[0].x1 = parseInt(elements.zone1X1.value);
    state.zones.zones[0].y1 = parseInt(elements.zone1Y1.value);
    state.zones.zones[0].x2 = parseInt(elements.zone1X2.value);
    state.zones.zones[0].y2 = parseInt(elements.zone1Y2.value);

    // Zone 2
    state.zones.zones[1].enabled = elements.zone2Enable.checked;
    state.zones.zones[1].x1 = parseInt(elements.zone2X1.value);
    state.zones.zones[1].y1 = parseInt(elements.zone2Y1.value);
    state.zones.zones[1].x2 = parseInt(elements.zone2X2.value);
    state.zones.zones[1].y2 = parseInt(elements.zone2Y2.value);

    // Zone 3
    state.zones.zones[2].enabled = elements.zone3Enable.checked;
    state.zones.zones[2].x1 = parseInt(elements.zone3X1.value);
    state.zones.zones[2].y1 = parseInt(elements.zone3Y1.value);
    state.zones.zones[2].x2 = parseInt(elements.zone3X2.value);
    state.zones.zones[2].y2 = parseInt(elements.zone3Y2.value);

    // Redraw canvas with updated zones
    radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);
}

function resetZones() {
    if (confirm('Reset all zones to default values?')) {
        state.zones = {
            type: 0,
            zones: [
                { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
                { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 },
                { enabled: false, x1: -1500, y1: 0, x2: 1500, y2: 3000 }
            ]
        };
        loadZoneFormValues();
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

// Connect Button - toggle connect/disconnect
if (elements.connectBtn) {
    elements.connectBtn.addEventListener('click', () => {
        if (state.mqtt.connected) {
            disconnectMQTT();
        } else {
            saveCredentials(); // Save credentials when connecting
            connectMQTT();
        }
    });
}

// Zone Tabs
elements.zoneTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        switchZoneTab(parseInt(tab.dataset.zone));
    });
});

// Zone Type Change
elements.zoneType.addEventListener('change', () => {
    saveZoneFormValues();
});

// Zone Input Changes (live preview)
const zoneInputs = [
    elements.zone1Enable, elements.zone1X1, elements.zone1Y1, elements.zone1X2, elements.zone1Y2,
    elements.zone2Enable, elements.zone2X1, elements.zone2Y1, elements.zone2X2, elements.zone2Y2,
    elements.zone3Enable, elements.zone3X1, elements.zone3Y1, elements.zone3X2, elements.zone3Y2
];

zoneInputs.forEach(input => {
    input.addEventListener('input', () => {
        saveZoneFormValues();
    });
});

// Apply Zones Button
elements.applyZonesBtn.addEventListener('click', () => {
    saveZoneFormValues();
    publishZoneConfig();
});

// Reset Zones Button
elements.resetZonesBtn.addEventListener('click', resetZones);

// Position Reporting Toggle Button
if (elements.positionReportingBtn) {
    elements.positionReportingBtn.addEventListener('click', togglePositionReporting);
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    console.log('LD2450 Zone Configurator initialized');

    // Try to load HA addon config first
    const hasHAConfig = await loadHAConfig();

    // If not in addon mode, load saved credentials from localStorage
    if (!hasHAConfig) {
        loadCredentials();
    }

    // Load initial form values
    loadZoneFormValues();

    // Draw initial canvas state
    radarCanvas.drawFrame([], state.zones.zones);

    // Start animation loop for canvas
    function animate() {
        radarCanvas.drawFrame(state.sensor.targets, state.zones.zones);
        requestAnimationFrame(animate);
    }
    animate();

    // User must click Connect button to connect
    updateConnectionStatus(false);
}

// Start application
init();

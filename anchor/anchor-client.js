require('dotenv').config();
const BeaconScanner = require('node-beacon-scanner');
const { io } = require('socket.io-client');

// --- Configuration from .env ---
const ANCHOR_ID = process.env.ANCHOR_ID;
const SERVER_URL = process.env.SERVER_URL;
const ANCHOR_X = parseFloat(process.env.ANCHOR_POSITION_X);
const ANCHOR_Y = parseFloat(process.env.ANCHOR_POSITION_Y);
const TARGET_UUID = process.env.TARGET_BEACON_UUID || '';
const TARGET_MAJOR = process.env.TARGET_MAJOR ? parseInt(process.env.TARGET_MAJOR) : null;
const TARGET_MINOR = process.env.TARGET_MINOR ? parseInt(process.env.TARGET_MINOR) : null;
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL) || 1000;

if (!ANCHOR_ID || !SERVER_URL) {
  console.error('ERROR: ANCHOR_ID and SERVER_URL must be set in .env');
  process.exit(1);
}

const log = (msg) => {
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
  console.log(`[${ts}] [${ANCHOR_ID}] ${msg}`);
};

log(`Starting anchor client...`);
log(`  Server: ${SERVER_URL}`);
log(`  Position: (${ANCHOR_X}, ${ANCHOR_Y})`);
if (TARGET_UUID) log(`  Target UUID filter: ${TARGET_UUID}`);
if (TARGET_MAJOR !== null) log(`  Target Major filter: ${TARGET_MAJOR}`);
if (TARGET_MINOR !== null) log(`  Target Minor filter: ${TARGET_MINOR}`);

// --- Socket.IO connection to central server ---
const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

socket.on('connect', () => {
  log(`Connected to server (socket: ${socket.id})`);
  socket.emit('anchor:register', {
    anchorId: ANCHOR_ID,
    position: { x: ANCHOR_X, y: ANCHOR_Y },
  });
});

socket.on('disconnect', (reason) => {
  log(`Disconnected from server: ${reason}`);
});

socket.on('connect_error', (err) => {
  log(`Connection error: ${err.message}`);
});

socket.on('server:command', (cmd) => {
  log(`Server command: ${JSON.stringify(cmd)}`);
  if (cmd.command === 'setScanInterval' && cmd.value) {
    log(`Scan interval updated to ${cmd.value}ms (restart required)`);
  }
});

// --- BLE Scanner ---
const scanner = new BeaconScanner();
let scanTimeout = null;

function matchesTarget(ad) {
  if (TARGET_UUID) {
    const adUuid = (ad.iBeacon.uuid || '').toLowerCase().replace(/-/g, '');
    const filterUuid = TARGET_UUID.toLowerCase().replace(/-/g, '');
    if (adUuid !== filterUuid) return false;
  }
  if (TARGET_MAJOR !== null && ad.iBeacon.major !== TARGET_MAJOR) return false;
  if (TARGET_MINOR !== null && ad.iBeacon.minor !== TARGET_MINOR) return false;
  return true;
}

scanner.onadvertisement = (ad) => {
  if (ad.beaconType !== 'iBeacon') return;
  if (!matchesTarget(ad)) return;

  const payload = {
    anchorId: ANCHOR_ID,
    beaconId: ad.iBeacon.minor,  // Minor value identifies each fixed iBeacon
    rssi: ad.rssi,
    timestamp: Date.now(),
    beaconMac: ad.address || 'Unknown',
    major: ad.iBeacon.major,
    minor: ad.iBeacon.minor,
  };

  if (socket.connected) {
    socket.emit('anchor:rssi', payload);
  }

  log(`iBeacon #${payload.beaconId} RSSI: ${ad.rssi} dBm | MAC: ${payload.beaconMac} | Major: ${payload.major} Minor: ${payload.minor}`);
};

const startScanning = () => {
  scanner.startScan().then(() => {
    scanTimeout = setTimeout(() => {
      scanner.stopScan();
      startScanning();
    }, SCAN_INTERVAL);
  }).catch((err) => {
    log(`Scan error: ${err.message}`);
    setTimeout(startScanning, 2000);
  });
};

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  log('Shutting down...');
  clearTimeout(scanTimeout);
  scanner.stopScan();
  socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  clearTimeout(scanTimeout);
  scanner.stopScan();
  socket.disconnect();
  process.exit(0);
});

// --- Start ---
log('Starting BLE scanner...');
startScanning();

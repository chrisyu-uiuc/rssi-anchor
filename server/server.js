require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const AnchorManager = require('./lib/anchor-manager');
const RssiAggregator = require('./lib/rssi-aggregator');
const FingerprintDB = require('./lib/fingerprint-db');
const StandardScaler = require('./lib/standard-scaler');
const { weightedKnn } = require('./lib/weighted-knn');

// --- Initialize components ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const anchorManager = new AnchorManager();
const aggregator = new RssiAggregator(anchorManager);
const fingerprintDB = new FingerprintDB();

const log = (msg) => {
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
  console.log(`[${ts}] [SERVER] ${msg}`);
};

// --- System state ---
let mode = 'TRAINING'; // 'TRAINING' or 'LOCALIZATION'

// Training state
let trainingState = {
  collecting: false,
  point: null,        // { x, y }
  startTime: null,
  rawReadings: [],    // all raw RSSI readings during collection
  windowVectors: [],  // aggregated vectors during collection
};

// Localization state
let localizationState = {
  scaler: null,
  trainX: null,    // scaled training features
  trainY: null,    // training coordinates
  ready: false,
};

// --- Serve static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- REST endpoint for config ---
app.get('/api/config', (req, res) => {
  res.json({
    anchors: config.ANCHOR_POSITIONS,
    beacons: config.BEACON_POSITIONS,
    beaconIds: config.BEACON_IDS,
    grid: config.GRID,
    knn: config.KNN,
    anchorIds: config.ANCHOR_IDS,
    featureSize: config.ANCHOR_IDS.length * config.BEACON_IDS.length,
  });
});

// --- Socket.IO: Anchor connections ---
io.on('connection', (socket) => {
  const clientType = socket.handshake.query.type;

  // Determine if this is an anchor or dashboard client
  socket.on('anchor:register', (data) => {
    const { anchorId, position } = data;
    const anchor = anchorManager.register(socket.id, anchorId, position);
    log(`Anchor ${anchorId} registered at (${anchor.position.x}, ${anchor.position.y}) [socket: ${socket.id}]`);
    broadcastAnchorStatus();
  });

  socket.on('anchor:rssi', (data) => {
    const { anchorId, beaconId, rssi, timestamp, beaconMac, major, minor } = data;
    anchorManager.addRssi(anchorId, beaconId, rssi, timestamp);

    // If training and collecting, also store raw reading
    if (mode === 'TRAINING' && trainingState.collecting) {
      trainingState.rawReadings.push({
        anchorId,
        beaconId,
        rssi,
        timestamp,
        beaconMac,
        major,
        minor,
      });
    }
  });

  // --- Dashboard events ---
  socket.on('mode:set', (data) => {
    const newMode = data.mode;
    if (newMode !== 'TRAINING' && newMode !== 'LOCALIZATION') return;

    mode = newMode;
    log(`Mode changed to: ${mode}`);

    if (mode === 'LOCALIZATION') {
      initLocalization();
    } else {
      localizationState.ready = false;
    }

    io.emit('mode:changed', { mode });
  });

  socket.on('training:start', (data) => {
    if (mode !== 'TRAINING') return;
    if (trainingState.collecting) return;

    const { x, y } = data;
    trainingState = {
      collecting: true,
      point: { x, y },
      startTime: Date.now(),
      rawReadings: [],
      windowVectors: [],
    };

    log(`Training: collecting at (${x}, ${y}) for ${config.TRAINING_DURATION}ms`);
    io.emit('training:collecting', { point: { x, y }, duration: config.TRAINING_DURATION });

    // Auto-stop after training duration
    setTimeout(() => {
      if (trainingState.collecting && trainingState.point &&
          trainingState.point.x === x && trainingState.point.y === y) {
        finishTrainingCollection();
      }
    }, config.TRAINING_DURATION);
  });

  socket.on('training:stop', () => {
    if (trainingState.collecting) {
      log('Training: collection cancelled');
      trainingState.collecting = false;
      io.emit('training:cancelled', {});
    }
  });

  socket.on('training:delete', (data) => {
    const { x, y } = data;
    const deleted = fingerprintDB.removeFingerprint(x, y);
    log(`Training: deleted fingerprint at (${x}, ${y}): ${deleted}`);
    io.emit('training:status', getTrainingStatus());
  });

  socket.on('config:update', (data) => {
    if (data.knnK) config.KNN.K = data.knnK;
    if (data.knnSigma) config.KNN.SIGMA = data.knnSigma;
    if (data.gridSpacing) config.GRID.SPACING = data.gridSpacing;
    if (data.aggregationWindow) aggregator.setWindow(data.aggregationWindow);
    if (data.trainingDuration) config.TRAINING_DURATION = data.trainingDuration;
    log(`Config updated: ${JSON.stringify(data)}`);
    io.emit('config:updated', {
      knn: config.KNN,
      grid: config.GRID,
      aggregationWindow: config.AGGREGATION_WINDOW,
      trainingDuration: config.TRAINING_DURATION,
    });
  });

  // --- On connect: send current state ---
  socket.emit('mode:changed', { mode });
  socket.emit('training:status', getTrainingStatus());
  socket.emit('dashboard:anchorStatus', anchorManager.getStatus());

  socket.on('disconnect', () => {
    const anchorId = anchorManager.disconnect(socket.id);
    if (anchorId) {
      log(`Anchor ${anchorId} disconnected`);
      broadcastAnchorStatus();
    }
  });
});

// --- Helper functions ---

function broadcastAnchorStatus() {
  io.emit('dashboard:anchorStatus', anchorManager.getStatus());
}

function getTrainingStatus() {
  return {
    gridPoints: fingerprintDB.getGridPoints(),
    collectedCount: fingerprintDB.getCollectedPoints().length,
    totalPoints: fingerprintDB.getTotalGridPoints(),
    collecting: trainingState.collecting,
    currentPoint: trainingState.point,
  };
}

function finishTrainingCollection() {
  if (!trainingState.collecting || !trainingState.point) return;

  const { x, y } = trainingState.point;
  const readings = trainingState.rawReadings;

  // Compute average RSSI per anchor per beacon (anchor × beacon matrix, flattened)
  const rssiVector = [];
  for (const aid of config.ANCHOR_IDS) {
    for (const bid of config.BEACON_IDS) {
      const matched = readings.filter(r => r.anchorId === aid && r.beaconId === bid);
      if (matched.length > 0) {
        rssiVector.push(matched.reduce((sum, r) => sum + r.rssi, 0) / matched.length);
      } else {
        rssiVector.push(config.NO_SIGNAL_RSSI);
      }
    }
  }

  // Save fingerprint
  fingerprintDB.addFingerprint(x, y, rssiVector);

  // Save raw readings
  if (readings.length > 0) {
    fingerprintDB.saveRaw(x, y, readings);
  }

  log(`Training: collected (${x}, ${y}) -> [${rssiVector.map(v => v.toFixed(1)).join(', ')}] (${readings.length} raw readings)`);

  trainingState.collecting = false;
  trainingState.point = null;

  io.emit('training:complete', {
    point: { x, y },
    fingerprint: rssiVector,
    readingCount: readings.length,
  });
  io.emit('training:status', getTrainingStatus());
}

function initLocalization() {
  fingerprintDB.load();
  const { X, y } = fingerprintDB.getTrainingData();

  if (X.length === 0) {
    log('Localization: no training data available');
    localizationState.ready = false;
    io.emit('localization:error', { message: 'No training data. Collect fingerprints first.' });
    return;
  }

  const scaler = new StandardScaler();
  const scaledX = scaler.fitTransform(X);

  localizationState = {
    scaler,
    trainX: scaledX,
    trainY: y,
    ready: true,
  };

  log(`Localization: initialized with ${X.length} fingerprints, k=${config.KNN.K}, sigma=${config.KNN.SIGMA}`);
  io.emit('localization:ready', { fingerprintCount: X.length });
}

// --- Aggregation event handler ---
aggregator.on('aggregated', (result) => {
  const { vector, matrix, counts } = result;

  // Broadcast RSSI matrix for monitoring (anchor -> beacon -> rssi)
  io.emit('dashboard:rssiUpdate', { matrix, counts });

  // Training mode: accumulate vectors
  if (mode === 'TRAINING' && trainingState.collecting) {
    trainingState.windowVectors.push(vector);
    const elapsed = Date.now() - trainingState.startTime;
    io.emit('training:progress', {
      point: trainingState.point,
      elapsed,
      total: config.TRAINING_DURATION,
      rawCount: trainingState.rawReadings.length,
      windowCount: trainingState.windowVectors.length,
    });
  }

  // Localization mode: predict position
  if (mode === 'LOCALIZATION' && localizationState.ready) {
    const scaled = localizationState.scaler.transform(vector);
    const prediction = weightedKnn(
      scaled,
      localizationState.trainX,
      localizationState.trainY,
      config.KNN.K,
      config.KNN.SIGMA
    );

    io.emit('dashboard:position', {
      x: prediction.x,
      y: prediction.y,
      confidence: prediction.confidence,
      neighbors: prediction.neighbors,
      matrix,
      timestamp: Date.now(),
    });
  }
});

// --- Periodic anchor status broadcast ---
setInterval(() => {
  broadcastAnchorStatus();
}, 1000);

// --- Load existing fingerprints on startup ---
const loaded = fingerprintDB.load();
log(`Loaded ${loaded.count} existing fingerprints`);

// --- Start ---
server.listen(config.PORT, () => {
  const featureSize = config.ANCHOR_IDS.length * config.BEACON_IDS.length;
  log(`Server running on port ${config.PORT}`);
  log(`Dashboard: http://localhost:${config.PORT}`);
  log(`Mode: ${mode}`);
  log(`Anchors: ${config.ANCHOR_IDS.length} (${config.ANCHOR_IDS.join(', ')})`);
  log(`Beacons: ${config.BEACON_IDS.length} (IDs: ${config.BEACON_IDS.join(', ')})`);
  log(`Feature vector: ${config.ANCHOR_IDS.length} anchors x ${config.BEACON_IDS.length} beacons = ${featureSize} dimensions`);
  log(`Grid: ${config.GRID.WIDTH}x${config.GRID.HEIGHT}cm, spacing=${config.GRID.SPACING}cm`);
  log(`Expected grid points: ${fingerprintDB.getTotalGridPoints()}`);
  log(`KNN: k=${config.KNN.K}, sigma=${config.KNN.SIGMA}`);
  aggregator.start();
});

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  log('Shutting down...');
  aggregator.stop();
  server.close();
  process.exit(0);
});

module.exports = {
  // Anchor definitions (RPi scanner nodes)
  ANCHOR_IDS: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
  ANCHOR_POSITIONS: {
    A1: { x: 0,   y: 490 },
    A2: { x: 490, y: 490 },
    A3: { x: 490, y: 0   },
    A4: { x: 0,   y: 0   },
    A5: { x: 245, y: 490 },
    A6: { x: 245, y: 0   },
  },

  // Fixed iBeacon definitions (placed throughout the area)
  // Each beacon is identified by its Minor value (or Major:Minor combo)
  // Update these to match your actual iBeacon Minor IDs
  BEACON_IDS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  BEACON_POSITIONS: {
    1:  { x: 0,   y: 0   },
    2:  { x: 163, y: 0   },
    3:  { x: 326, y: 0   },
    4:  { x: 490, y: 0   },
    5:  { x: 0,   y: 245 },
    6:  { x: 163, y: 245 },
    7:  { x: 326, y: 245 },
    8:  { x: 490, y: 245 },
    9:  { x: 0,   y: 490 },
    10: { x: 163, y: 490 },
    11: { x: 326, y: 490 },
    12: { x: 490, y: 490 },
  },

  // Feature vector: ANCHOR_IDS.length × BEACON_IDS.length
  // e.g., 6 anchors × 12 beacons = 72 features

  // Deployment area grid
  GRID: {
    WIDTH: 490,    // cm
    HEIGHT: 490,   // cm
    SPACING: 70,   // cm (70cm = 8x8 = 64 points; use 49 for 11x11 = 121 points)
  },

  // RSSI aggregation
  AGGREGATION_WINDOW: 2000,   // ms - time window for averaging RSSI
  NO_SIGNAL_RSSI: -100,       // dBm value when anchor doesn't see beacon

  // Training mode
  TRAINING_DURATION: 10000,   // ms - collection time per grid point

  // Algorithm selection: 'KNN' or 'NAIVE_BAYES'
  ALGORITHM: 'KNN',

  // Weighted K-NN parameters
  KNN: {
    K: 3,
    SIGMA: 1.0,
  },

  // Server
  PORT: parseInt(process.env.PORT) || 3000,
};

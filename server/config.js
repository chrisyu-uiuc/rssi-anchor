module.exports = {
  // Anchor definitions
  ANCHOR_IDS: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
  ANCHOR_POSITIONS: {
    A1: { x: 0,   y: 490 },
    A2: { x: 490, y: 490 },
    A3: { x: 490, y: 0   },
    A4: { x: 0,   y: 0   },
    A5: { x: 245, y: 490 },
    A6: { x: 245, y: 0   },
  },

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

  // Weighted K-NN parameters
  KNN: {
    K: 3,
    SIGMA: 1.0,
  },

  // Server
  PORT: parseInt(process.env.PORT) || 3000,
};

const config = require('../config');

class AnchorManager {
  constructor() {
    // anchorId -> { socketId, position, connected, lastSeen, rssiBuffers: { beaconId -> [] } }
    this.anchors = new Map();

    // Initialize all expected anchors as disconnected
    for (const id of config.ANCHOR_IDS) {
      this.anchors.set(id, this._emptyAnchor(id));
    }
  }

  _emptyAnchor(id) {
    // Create per-beacon RSSI buffers
    const rssiBuffers = {};
    for (const bid of config.BEACON_IDS) {
      rssiBuffers[bid] = [];
    }
    return {
      anchorId: id,
      socketId: null,
      position: config.ANCHOR_POSITIONS[id] || { x: 0, y: 0 },
      connected: false,
      lastSeen: null,
      rssiBuffers,
    };
  }

  register(socketId, anchorId, position) {
    const existing = this.anchors.get(anchorId);
    const anchor = {
      ...this._emptyAnchor(anchorId),
      socketId,
      position: position || (existing && existing.position) || { x: 0, y: 0 },
      connected: true,
      lastSeen: Date.now(),
    };
    this.anchors.set(anchorId, anchor);
    return anchor;
  }

  disconnect(socketId) {
    for (const [id, anchor] of this.anchors) {
      if (anchor.socketId === socketId) {
        anchor.connected = false;
        anchor.socketId = null;
        return id;
      }
    }
    return null;
  }

  /**
   * Add an RSSI reading for a specific beacon from a specific anchor.
   * @param {string} anchorId - e.g., 'A1'
   * @param {number} beaconId - iBeacon Minor value (matches config.BEACON_IDS)
   * @param {number} rssi - RSSI in dBm
   * @param {number} timestamp - Unix timestamp
   */
  addRssi(anchorId, beaconId, rssi, timestamp) {
    const anchor = this.anchors.get(anchorId);
    if (!anchor) return;
    anchor.lastSeen = Date.now();

    // Only track beacons we know about
    if (config.BEACON_IDS.includes(beaconId)) {
      if (!anchor.rssiBuffers[beaconId]) {
        anchor.rssiBuffers[beaconId] = [];
      }
      anchor.rssiBuffers[beaconId].push({ rssi, timestamp, receivedAt: Date.now() });
    }
  }

  /**
   * Get aggregated RSSI matrix from all anchors × all beacons, then clear buffers.
   * Returns {
   *   vector: number[] (length = ANCHOR_IDS × BEACON_IDS, flattened row-major),
   *   matrix: { anchorId: { beaconId: avgRssi } },
   *   counts: { anchorId: { beaconId: count } }
   * }
   * Vector order: [A1_B1, A1_B2, ..., A1_BN, A2_B1, A2_B2, ..., AN_BN]
   */
  getAggregatedRssi() {
    const vector = [];
    const matrix = {};
    const counts = {};

    for (const aid of config.ANCHOR_IDS) {
      const anchor = this.anchors.get(aid);
      matrix[aid] = {};
      counts[aid] = {};

      for (const bid of config.BEACON_IDS) {
        const buffer = anchor ? (anchor.rssiBuffers[bid] || []) : [];

        if (buffer.length > 0) {
          const avg = buffer.reduce((sum, r) => sum + r.rssi, 0) / buffer.length;
          vector.push(avg);
          matrix[aid][bid] = avg;
          counts[aid][bid] = buffer.length;
        } else {
          vector.push(config.NO_SIGNAL_RSSI);
          matrix[aid][bid] = config.NO_SIGNAL_RSSI;
          counts[aid][bid] = 0;
        }
      }

      // Clear all buffers for this anchor
      if (anchor) {
        for (const bid of config.BEACON_IDS) {
          anchor.rssiBuffers[bid] = [];
        }
      }
    }

    return { vector, matrix, counts };
  }

  /**
   * Get latest RSSI per anchor per beacon without clearing buffers.
   */
  getCurrentRssi() {
    const rssi = {};
    for (const aid of config.ANCHOR_IDS) {
      rssi[aid] = {};
      const anchor = this.anchors.get(aid);
      for (const bid of config.BEACON_IDS) {
        const buffer = anchor ? (anchor.rssiBuffers[bid] || []) : [];
        rssi[aid][bid] = buffer.length > 0 ? buffer[buffer.length - 1].rssi : null;
      }
    }
    return rssi;
  }

  getStatus() {
    const status = [];
    for (const id of config.ANCHOR_IDS) {
      const anchor = this.anchors.get(id);
      let totalBuffered = 0;
      for (const bid of config.BEACON_IDS) {
        totalBuffered += (anchor.rssiBuffers[bid] || []).length;
      }
      status.push({
        anchorId: id,
        position: anchor.position,
        connected: anchor.connected,
        lastSeen: anchor.lastSeen,
        bufferSize: totalBuffered,
      });
    }
    return status;
  }

  getConnectedCount() {
    let count = 0;
    for (const anchor of this.anchors.values()) {
      if (anchor.connected) count++;
    }
    return count;
  }
}

module.exports = AnchorManager;

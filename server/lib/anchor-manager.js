const config = require('../config');

class AnchorManager {
  constructor() {
    // anchorId -> { socketId, position, connected, lastSeen, rssiBuffer[] }
    this.anchors = new Map();

    // Initialize all expected anchors as disconnected
    for (const id of config.ANCHOR_IDS) {
      this.anchors.set(id, {
        anchorId: id,
        socketId: null,
        position: config.ANCHOR_POSITIONS[id] || { x: 0, y: 0 },
        connected: false,
        lastSeen: null,
        rssiBuffer: [],
      });
    }
  }

  register(socketId, anchorId, position) {
    const anchor = this.anchors.get(anchorId) || {};
    this.anchors.set(anchorId, {
      ...anchor,
      anchorId,
      socketId,
      position: position || anchor.position || { x: 0, y: 0 },
      connected: true,
      lastSeen: Date.now(),
      rssiBuffer: [],
    });
    return this.anchors.get(anchorId);
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

  addRssi(anchorId, rssi, timestamp) {
    const anchor = this.anchors.get(anchorId);
    if (!anchor) return;
    anchor.lastSeen = Date.now();
    anchor.rssiBuffer.push({ rssi, timestamp, receivedAt: Date.now() });
  }

  /**
   * Get aggregated RSSI vector from all anchors, then clear buffers.
   * Returns { vector: number[6], counts: { A1: n, A2: n, ... } }
   * Vector order matches config.ANCHOR_IDS order.
   */
  getAggregatedRssi() {
    const vector = [];
    const counts = {};

    for (const id of config.ANCHOR_IDS) {
      const anchor = this.anchors.get(id);
      const buffer = anchor ? anchor.rssiBuffer : [];

      if (buffer.length > 0) {
        const avg = buffer.reduce((sum, r) => sum + r.rssi, 0) / buffer.length;
        vector.push(avg);
        counts[id] = buffer.length;
      } else {
        vector.push(config.NO_SIGNAL_RSSI);
        counts[id] = 0;
      }

      // Clear buffer for next window
      if (anchor) anchor.rssiBuffer = [];
    }

    return { vector, counts };
  }

  /**
   * Get raw RSSI readings from all anchors without clearing buffers.
   * Used for real-time monitoring display.
   */
  getCurrentRssi() {
    const rssi = {};
    for (const id of config.ANCHOR_IDS) {
      const anchor = this.anchors.get(id);
      const buffer = anchor ? anchor.rssiBuffer : [];
      if (buffer.length > 0) {
        rssi[id] = buffer[buffer.length - 1].rssi; // latest reading
      } else {
        rssi[id] = null;
      }
    }
    return rssi;
  }

  getStatus() {
    const status = [];
    for (const id of config.ANCHOR_IDS) {
      const anchor = this.anchors.get(id);
      status.push({
        anchorId: id,
        position: anchor.position,
        connected: anchor.connected,
        lastSeen: anchor.lastSeen,
        bufferSize: anchor.rssiBuffer.length,
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

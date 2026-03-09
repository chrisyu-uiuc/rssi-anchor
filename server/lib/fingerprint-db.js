const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FINGERPRINT_FILE = path.join(DATA_DIR, 'fingerprints', 'fingerprints.csv');
const RAW_DIR = path.join(DATA_DIR, 'raw');

class FingerprintDB {
  constructor() {
    // In-memory store: Map of "x,y" -> { x, y, rssi: number[6] }
    this.fingerprints = new Map();
    this._ensureDirs();
  }

  _ensureDirs() {
    const dirs = [
      path.join(DATA_DIR, 'fingerprints'),
      RAW_DIR,
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  _key(x, y) {
    return `${x},${y}`;
  }

  /**
   * Load fingerprint database from CSV.
   * CSV format: x,y,rssi_A1,rssi_A2,rssi_A3,rssi_A4,rssi_A5,rssi_A6
   */
  load() {
    this.fingerprints.clear();

    if (!fs.existsSync(FINGERPRINT_FILE)) {
      return { count: 0 };
    }

    const content = fs.readFileSync(FINGERPRINT_FILE, 'utf-8').trim();
    const lines = content.split('\n');
    if (lines.length < 2) return { count: 0 }; // header only

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(Number);
      if (parts.length < 2 + config.ANCHOR_IDS.length) continue;

      const x = parts[0];
      const y = parts[1];
      const rssi = parts.slice(2);

      this.fingerprints.set(this._key(x, y), { x, y, rssi });
    }

    return { count: this.fingerprints.size };
  }

  /**
   * Save all fingerprints to CSV.
   */
  save() {
    const header = ['x', 'y', ...config.ANCHOR_IDS.map(id => `rssi_${id}`)].join(',');
    const rows = [];

    for (const fp of this.fingerprints.values()) {
      rows.push([fp.x, fp.y, ...fp.rssi.map(v => v.toFixed(1))].join(','));
    }

    // Sort by x then y for consistent ordering
    rows.sort();

    const content = [header, ...rows].join('\n') + '\n';
    fs.writeFileSync(FINGERPRINT_FILE, content);

    return { count: this.fingerprints.size, path: FINGERPRINT_FILE };
  }

  /**
   * Add or overwrite a fingerprint for a grid point.
   * @param {number} x - X coordinate in cm
   * @param {number} y - Y coordinate in cm
   * @param {number[]} rssiVector - Average RSSI per anchor (length = ANCHOR_IDS.length)
   */
  addFingerprint(x, y, rssiVector) {
    this.fingerprints.set(this._key(x, y), { x, y, rssi: rssiVector });
    this.save();
    return { x, y, rssi: rssiVector };
  }

  /**
   * Remove a fingerprint for a grid point.
   */
  removeFingerprint(x, y) {
    const deleted = this.fingerprints.delete(this._key(x, y));
    if (deleted) this.save();
    return deleted;
  }

  /**
   * Save raw RSSI readings for a grid point (UoG-compatible format).
   * Format: objloc,rss,time,anchor
   * Where anchor is 1-indexed matching ANCHOR_IDS order.
   */
  saveRaw(x, y, readings) {
    const objloc = String(x).padStart(3, '0') + String(y).padStart(3, '0');
    const filename = `${objloc}_raw.csv`;
    const filepath = path.join(RAW_DIR, filename);

    const header = 'objloc,rss,time,anchor\n';
    const rows = readings.map(r => {
      const anchorIdx = config.ANCHOR_IDS.indexOf(r.anchorId) + 1;
      return `${objloc},${Math.round(r.rssi)},${r.timestamp},${anchorIdx}`;
    }).join('\n');

    fs.writeFileSync(filepath, header + rows + '\n');
    return { path: filepath, count: readings.length };
  }

  /**
   * Get training data in the format needed by KNN.
   * Returns { X: number[][], y: number[][] }
   */
  getTrainingData() {
    const X = [];
    const y = [];

    for (const fp of this.fingerprints.values()) {
      X.push([...fp.rssi]);
      y.push([fp.x, fp.y]);
    }

    return { X, y };
  }

  /**
   * Get list of collected grid points.
   */
  getCollectedPoints() {
    const points = [];
    for (const fp of this.fingerprints.values()) {
      points.push({ x: fp.x, y: fp.y });
    }
    return points;
  }

  /**
   * Get total expected grid points based on config.
   */
  getTotalGridPoints() {
    const cols = Math.floor(config.GRID.WIDTH / config.GRID.SPACING) + 1;
    const rows = Math.floor(config.GRID.HEIGHT / config.GRID.SPACING) + 1;
    return cols * rows;
  }

  /**
   * Generate all expected grid point coordinates.
   */
  getGridPoints() {
    const points = [];
    const cols = Math.floor(config.GRID.WIDTH / config.GRID.SPACING) + 1;
    const rows = Math.floor(config.GRID.HEIGHT / config.GRID.SPACING) + 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * config.GRID.SPACING;
        const y = r * config.GRID.SPACING;
        points.push({
          x, y,
          collected: this.fingerprints.has(this._key(x, y)),
        });
      }
    }
    return points;
  }
}

module.exports = FingerprintDB;

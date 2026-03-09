class RssiMonitor {
  constructor(socket) {
    this.socket = socket;
    this.anchorIds = [];
    this.beaconIds = [];

    this.elAnchorGrid = document.getElementById('anchorGrid');
    this.elAnchorCount = document.getElementById('anchorCount');
    this.elRssiBars = document.getElementById('rssiBars');

    this.socket.on('dashboard:anchorStatus', (data) => this._updateAnchors(data));
    this.socket.on('dashboard:rssiUpdate', (data) => this._updateRssi(data));
  }

  setConfig(anchorIds, beaconIds) {
    this.anchorIds = anchorIds;
    this.beaconIds = beaconIds;
    this._buildAnchorCards();
    this._buildRssiMatrix();
  }

  _buildAnchorCards() {
    this.elAnchorGrid.innerHTML = '';
    for (const id of this.anchorIds) {
      const card = document.createElement('div');
      card.className = 'anchor-card';
      card.id = `anchor-card-${id}`;
      card.innerHTML = `
        <div class="anchor-card-header">
          <span class="anchor-id">${id}</span>
          <span class="anchor-status" id="anchor-status-${id}"></span>
        </div>
        <div class="anchor-pos" id="anchor-pos-${id}">--</div>
      `;
      this.elAnchorGrid.appendChild(card);
    }
  }

  _buildRssiMatrix() {
    this.elRssiBars.innerHTML = '';

    // Build a compact matrix: rows = anchors, cols = beacons
    const table = document.createElement('div');
    table.className = 'rssi-matrix';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.className = 'rssi-matrix-row rssi-matrix-header';
    headerRow.innerHTML = '<span class="rssi-matrix-label"></span>';
    for (const bid of this.beaconIds) {
      headerRow.innerHTML += `<span class="rssi-matrix-cell header-cell">B${bid}</span>`;
    }
    table.appendChild(headerRow);

    // Data rows (one per anchor)
    for (const aid of this.anchorIds) {
      const row = document.createElement('div');
      row.className = 'rssi-matrix-row';
      row.innerHTML = `<span class="rssi-matrix-label">${aid}</span>`;
      for (const bid of this.beaconIds) {
        row.innerHTML += `<span class="rssi-matrix-cell" id="rssi-${aid}-${bid}">--</span>`;
      }
      table.appendChild(row);
    }

    this.elRssiBars.appendChild(table);
  }

  _updateAnchors(statusList) {
    let connectedCount = 0;

    for (const s of statusList) {
      const card = document.getElementById(`anchor-card-${s.anchorId}`);
      const posEl = document.getElementById(`anchor-pos-${s.anchorId}`);

      if (!card) continue;

      if (s.connected) {
        card.classList.add('connected');
        connectedCount++;
      } else {
        card.classList.remove('connected');
      }

      if (posEl) {
        posEl.textContent = `(${s.position.x}, ${s.position.y})`;
      }
    }

    this.elAnchorCount.textContent = `${connectedCount}/${this.anchorIds.length} connected`;
  }

  _updateRssi(data) {
    const { matrix } = data;
    if (!matrix) return;

    for (const aid of this.anchorIds) {
      if (!matrix[aid]) continue;
      for (const bid of this.beaconIds) {
        const cell = document.getElementById(`rssi-${aid}-${bid}`);
        if (!cell) continue;

        const value = matrix[aid][bid];

        if (value === undefined || value === null || value <= -100) {
          cell.textContent = '--';
          cell.className = 'rssi-matrix-cell rssi-none';
          continue;
        }

        cell.textContent = Math.round(value);

        // Color code by signal strength
        if (value > -60) {
          cell.className = 'rssi-matrix-cell rssi-strong';
        } else if (value > -75) {
          cell.className = 'rssi-matrix-cell rssi-good';
        } else if (value > -90) {
          cell.className = 'rssi-matrix-cell rssi-weak';
        } else {
          cell.className = 'rssi-matrix-cell rssi-very-weak';
        }
      }
    }
  }
}

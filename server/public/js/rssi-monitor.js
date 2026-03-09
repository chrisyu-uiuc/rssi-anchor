class RssiMonitor {
  constructor(socket) {
    this.socket = socket;
    this.anchorIds = [];

    this.elAnchorGrid = document.getElementById('anchorGrid');
    this.elAnchorCount = document.getElementById('anchorCount');
    this.elRssiBars = document.getElementById('rssiBars');

    this.socket.on('dashboard:anchorStatus', (data) => this._updateAnchors(data));
    this.socket.on('dashboard:rssiUpdate', (data) => this._updateRssi(data));
  }

  setAnchorIds(ids) {
    this.anchorIds = ids;
    this._buildAnchorCards();
    this._buildRssiBars();
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

  _buildRssiBars() {
    this.elRssiBars.innerHTML = '';
    for (const id of this.anchorIds) {
      const row = document.createElement('div');
      row.className = 'rssi-row';
      row.innerHTML = `
        <span class="rssi-label">${id}</span>
        <div class="rssi-bar-bg">
          <div class="rssi-bar-fill" id="rssi-bar-${id}" style="width:0%"></div>
        </div>
        <span class="rssi-value" id="rssi-val-${id}">--</span>
      `;
      this.elRssiBars.appendChild(row);
    }
  }

  _updateAnchors(statusList) {
    let connectedCount = 0;

    for (const s of statusList) {
      const card = document.getElementById(`anchor-card-${s.anchorId}`);
      const statusDot = document.getElementById(`anchor-status-${s.anchorId}`);
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
    const { rssi } = data;

    for (const id of this.anchorIds) {
      const barEl = document.getElementById(`rssi-bar-${id}`);
      const valEl = document.getElementById(`rssi-val-${id}`);
      if (!barEl || !valEl) continue;

      const value = rssi[id];

      if (value === undefined || value === null || value <= -100) {
        barEl.style.width = '0%';
        barEl.style.background = '#334455';
        valEl.textContent = 'N/A';
        continue;
      }

      // Map RSSI from [-100, -30] to [0%, 100%]
      const pct = Math.max(0, Math.min(100, ((value + 100) / 70) * 100));
      barEl.style.width = `${pct}%`;

      // Color: green (strong) -> yellow -> red (weak)
      if (value > -60) {
        barEl.style.background = 'linear-gradient(90deg, #00ff88, #44ff99)';
      } else if (value > -75) {
        barEl.style.background = 'linear-gradient(90deg, #ffdd00, #ffaa00)';
      } else if (value > -90) {
        barEl.style.background = 'linear-gradient(90deg, #ff8800, #ff6600)';
      } else {
        barEl.style.background = 'linear-gradient(90deg, #ff4444, #ff2222)';
      }

      valEl.textContent = `${Math.round(value)} dBm`;
    }
  }
}

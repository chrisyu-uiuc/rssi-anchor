class TrainingPanel {
  constructor(socket, gridCanvas) {
    this.socket = socket;
    this.grid = gridCanvas;

    this.selectedPoint = null;
    this.collecting = false;
    this.gridPoints = [];

    // DOM elements
    this.elPanel = document.getElementById('trainingPanel');
    this.elProgress = document.getElementById('trainingProgress');
    this.elSelectedPoint = document.getElementById('selectedPoint');
    this.elBtnCollect = document.getElementById('btnCollect');
    this.elBtnCancel = document.getElementById('btnCancel');
    this.elBtnDelete = document.getElementById('btnDelete');
    this.elProgressContainer = document.getElementById('progressContainer');
    this.elProgressFill = document.getElementById('progressFill');
    this.elProgressText = document.getElementById('progressText');
    this.elAutoAdvance = document.getElementById('autoAdvance');

    // Wire grid point selection
    this.grid.onPointSelected = (x, y) => this._onPointSelected(x, y);

    // Button handlers
    this.elBtnCollect.addEventListener('click', () => this._startCollection());
    this.elBtnCancel.addEventListener('click', () => this._cancelCollection());
    this.elBtnDelete.addEventListener('click', () => this._deletePoint());

    // Socket events
    this.socket.on('training:status', (data) => this._onStatus(data));
    this.socket.on('training:collecting', (data) => this._onCollecting(data));
    this.socket.on('training:progress', (data) => this._onProgress(data));
    this.socket.on('training:complete', (data) => this._onComplete(data));
    this.socket.on('training:cancelled', () => this._onCancelled());
  }

  show() { this.elPanel.style.display = ''; }
  hide() { this.elPanel.style.display = 'none'; }

  _onPointSelected(x, y) {
    this.selectedPoint = { x, y };
    this.elSelectedPoint.textContent = `(${x}, ${y}) cm`;
    this.elBtnCollect.disabled = this.collecting;

    // Check if point is already collected
    const pt = this.gridPoints.find(p => p.x === x && p.y === y);
    this.elBtnDelete.disabled = !pt || !pt.collected;
  }

  _startCollection() {
    if (!this.selectedPoint || this.collecting) return;
    this.socket.emit('training:start', this.selectedPoint);
  }

  _cancelCollection() {
    this.socket.emit('training:stop');
  }

  _deletePoint() {
    if (!this.selectedPoint) return;
    this.socket.emit('training:delete', this.selectedPoint);
  }

  _onStatus(data) {
    this.gridPoints = data.gridPoints || [];
    this.grid.setGridPoints(this.gridPoints);
    this.elProgress.textContent = `${data.collectedCount}/${data.totalPoints} points`;

    // If no point selected, select first uncollected
    if (!this.selectedPoint) {
      this._selectNextUncollected();
    }
  }

  _onCollecting(data) {
    this.collecting = true;
    this.elBtnCollect.disabled = true;
    this.elBtnCancel.style.display = '';
    this.elProgressContainer.style.display = '';
    this.elProgressFill.style.width = '0%';
    this.elProgressText.textContent = 'Collecting...';
  }

  _onProgress(data) {
    const pct = Math.min(100, (data.elapsed / data.total) * 100);
    this.elProgressFill.style.width = `${pct}%`;
    this.elProgressText.textContent = `${Math.round(pct)}% (${data.rawCount} readings)`;
  }

  _onComplete(data) {
    this.collecting = false;
    this.elBtnCollect.disabled = false;
    this.elBtnCancel.style.display = 'none';
    this.elProgressContainer.style.display = 'none';

    // Auto-advance to next uncollected point
    if (this.elAutoAdvance.checked) {
      this._selectNextUncollected();
    }
  }

  _onCancelled() {
    this.collecting = false;
    this.elBtnCollect.disabled = false;
    this.elBtnCancel.style.display = 'none';
    this.elProgressContainer.style.display = 'none';
  }

  _selectNextUncollected() {
    const next = this.gridPoints.find(p => !p.collected);
    if (next) {
      this.selectedPoint = { x: next.x, y: next.y };
      this.elSelectedPoint.textContent = `(${next.x}, ${next.y}) cm`;
      this.elBtnCollect.disabled = false;
      this.elBtnDelete.disabled = true;
      this.grid.selectPoint(next.x, next.y);
    } else {
      this.elSelectedPoint.textContent = 'All points collected!';
      this.elBtnCollect.disabled = true;
    }
  }
}

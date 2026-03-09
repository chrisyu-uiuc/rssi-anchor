class GridCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Grid config (will be updated from server)
    this.gridWidth = 490;
    this.gridHeight = 490;
    this.spacing = 70;

    // Drawing state
    this.padding = 40;
    this.scale = 1;

    // Data
    this.anchors = {};
    this.gridPoints = [];
    this.selectedPoint = null;
    this.position = null;
    this.positionTrail = [];
    this.maxTrail = 30;
    this.showTrail = true;

    // Callbacks
    this.onPointSelected = null;

    // Handle canvas click
    this.canvas.addEventListener('click', (e) => this._handleClick(e));

    // Handle resize
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const container = this.canvas.parentElement;
    const maxW = container.clientWidth - 24;
    const maxH = container.clientHeight - 24;

    // Maintain square aspect ratio
    const gridSize = Math.max(this.gridWidth, this.gridHeight);
    const totalSize = gridSize + this.padding * 2;

    this.scale = Math.min(maxW / totalSize, maxH / totalSize, 1.2);

    this.canvas.width = totalSize * this.scale;
    this.canvas.height = totalSize * this.scale;

    this.draw();
  }

  _toCanvas(x, y) {
    return {
      cx: (x + this.padding) * this.scale,
      cy: (this.gridHeight - y + this.padding) * this.scale, // Flip Y
    };
  }

  _fromCanvas(cx, cy) {
    const x = cx / this.scale - this.padding;
    const y = this.gridHeight - (cy / this.scale - this.padding);
    return { x, y };
  }

  _handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x, y } = this._fromCanvas(cx, cy);

    // Snap to nearest grid point
    const snapX = Math.round(x / this.spacing) * this.spacing;
    const snapY = Math.round(y / this.spacing) * this.spacing;

    if (snapX >= 0 && snapX <= this.gridWidth && snapY >= 0 && snapY <= this.gridHeight) {
      this.selectedPoint = { x: snapX, y: snapY };
      this.draw();
      if (this.onPointSelected) {
        this.onPointSelected(snapX, snapY);
      }
    }
  }

  setConfig(cfg) {
    if (cfg.grid) {
      this.gridWidth = cfg.grid.WIDTH;
      this.gridHeight = cfg.grid.HEIGHT;
      this.spacing = cfg.grid.SPACING;
    }
    if (cfg.anchors) {
      this.anchors = cfg.anchors;
    }
    this._resize();
  }

  setGridPoints(points) {
    this.gridPoints = points;
    this.draw();
  }

  setPosition(x, y, confidence) {
    this.position = { x, y, confidence };
    this.positionTrail.push({ x, y, timestamp: Date.now() });
    if (this.positionTrail.length > this.maxTrail) {
      this.positionTrail.shift();
    }
    this.draw();
  }

  clearPosition() {
    this.position = null;
    this.positionTrail = [];
    this.draw();
  }

  selectPoint(x, y) {
    this.selectedPoint = { x, y };
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = '#0a1520';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= this.gridWidth; x += this.spacing) {
      const { cx: x1 } = this._toCanvas(x, 0);
      const { cy: y1 } = this._toCanvas(x, 0);
      const { cy: y2 } = this._toCanvas(x, this.gridHeight);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y2);
      ctx.stroke();
    }

    for (let y = 0; y <= this.gridHeight; y += this.spacing) {
      const { cx: x1, cy: y1 } = this._toCanvas(0, y);
      const { cx: x2 } = this._toCanvas(this.gridWidth, y);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.stroke();
    }

    // Draw border
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.15)';
    ctx.lineWidth = 2;
    const tl = this._toCanvas(0, this.gridHeight);
    const br = this._toCanvas(this.gridWidth, 0);
    ctx.strokeRect(tl.cx, tl.cy, br.cx - tl.cx, br.cy - tl.cy);

    // Draw grid points
    for (const pt of this.gridPoints) {
      const { cx, cy } = this._toCanvas(pt.x, pt.y);
      const isSelected = this.selectedPoint &&
        this.selectedPoint.x === pt.x && this.selectedPoint.y === pt.y;

      if (isSelected) {
        // Pulsing yellow for selected
        ctx.fillStyle = '#ffdd00';
        ctx.shadowColor = 'rgba(255, 221, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, 6 * this.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (pt.collected) {
        // Green for collected
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * this.scale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Gray for pending
        ctx.fillStyle = '#334455';
        ctx.beginPath();
        ctx.arc(cx, cy, 3 * this.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw anchors
    for (const [id, pos] of Object.entries(this.anchors)) {
      const { cx, cy } = this._toCanvas(pos.x, pos.y);
      const size = 8 * this.scale;

      // Anchor square
      ctx.fillStyle = '#ff8800';
      ctx.shadowColor = 'rgba(255, 136, 0, 0.4)';
      ctx.shadowBlur = 8;
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = '#ff8800';
      ctx.font = `bold ${10 * this.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(id, cx, cy - size);
    }

    // Draw position trail
    if (this.showTrail && this.positionTrail.length > 1) {
      for (let i = 1; i < this.positionTrail.length; i++) {
        const prev = this._toCanvas(this.positionTrail[i - 1].x, this.positionTrail[i - 1].y);
        const curr = this._toCanvas(this.positionTrail[i].x, this.positionTrail[i].y);
        const alpha = (i / this.positionTrail.length) * 0.6;

        ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
        ctx.lineWidth = 2 * this.scale;
        ctx.beginPath();
        ctx.moveTo(prev.cx, prev.cy);
        ctx.lineTo(curr.cx, curr.cy);
        ctx.stroke();

        // Trail dot
        ctx.fillStyle = `rgba(0, 200, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(curr.cx, curr.cy, 2 * this.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw current position
    if (this.position) {
      const { cx, cy } = this._toCanvas(this.position.x, this.position.y);

      // Outer glow
      ctx.fillStyle = 'rgba(0, 200, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, 16 * this.scale, 0, Math.PI * 2);
      ctx.fill();

      // Main dot
      ctx.fillStyle = '#00c8ff';
      ctx.shadowColor = 'rgba(0, 200, 255, 0.7)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * this.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 2 * this.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Axis labels
    ctx.fillStyle = '#445566';
    ctx.font = `${9 * this.scale}px sans-serif`;
    ctx.textAlign = 'center';

    // X axis
    for (let x = 0; x <= this.gridWidth; x += this.spacing * 2) {
      const { cx, cy } = this._toCanvas(x, 0);
      ctx.fillText(`${x}`, cx, cy + 14 * this.scale);
    }

    // Y axis
    ctx.textAlign = 'right';
    for (let y = 0; y <= this.gridHeight; y += this.spacing * 2) {
      const { cx, cy } = this._toCanvas(0, y);
      ctx.fillText(`${y}`, cx - 6 * this.scale, cy + 3 * this.scale);
    }
  }
}

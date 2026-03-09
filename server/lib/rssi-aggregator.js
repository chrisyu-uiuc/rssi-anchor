const EventEmitter = require('events');
const config = require('../config');

class RssiAggregator extends EventEmitter {
  constructor(anchorManager) {
    super();
    this.anchorManager = anchorManager;
    this.intervalId = null;
    this.window = config.AGGREGATION_WINDOW;
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      const result = this.anchorManager.getAggregatedRssi();
      this.emit('aggregated', result);
    }, this.window);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setWindow(ms) {
    this.window = ms;
    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }
}

module.exports = RssiAggregator;

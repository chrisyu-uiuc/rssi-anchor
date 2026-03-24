/**
 * Gaussian Naive Bayes classifier for indoor localization.
 * Each grid point (x,y) is a discrete class. For each class,
 * we fit a Gaussian distribution per RSSI feature.
 *
 * At prediction time, we compute log-posteriors and return the
 * class with the highest probability.
 */
class GaussianNaiveBayes {
  constructor() {
    this.classes = [];       // unique class labels ("x,y" strings)
    this.classCoords = {};   // "x,y" -> { x, y }
    this.priors = {};        // "x,y" -> log prior
    this.means = {};         // "x,y" -> number[] (per-feature mean)
    this.variances = {};     // "x,y" -> number[] (per-feature variance)
    this.fitted = false;
  }

  /**
   * Fit the model from training data.
   * @param {number[][]} X - Feature matrix (n_samples x n_features), raw RSSI
   * @param {number[][]} y - Coordinate pairs (n_samples x 2), [x, y] in cm
   */
  fit(X, y) {
    const nSamples = X.length;
    const nFeatures = X[0].length;

    // Group samples by class label
    const groups = {};  // "x,y" -> { indices: [] }
    for (let i = 0; i < nSamples; i++) {
      const key = `${y[i][0]},${y[i][1]}`;
      if (!groups[key]) {
        groups[key] = { indices: [], x: y[i][0], y: y[i][1] };
      }
      groups[key].indices.push(i);
    }

    this.classes = Object.keys(groups);

    const MIN_VARIANCE = 1.0; // floor to prevent log(0) issues

    for (const key of this.classes) {
      const group = groups[key];
      const indices = group.indices;
      const count = indices.length;

      this.classCoords[key] = { x: group.x, y: group.y };
      this.priors[key] = Math.log(count / nSamples);

      // Per-feature mean
      const mean = new Array(nFeatures).fill(0);
      for (let j = 0; j < nFeatures; j++) {
        let sum = 0;
        for (const idx of indices) {
          sum += X[idx][j];
        }
        mean[j] = sum / count;
      }
      this.means[key] = mean;

      // Per-feature variance
      const variance = new Array(nFeatures).fill(0);
      for (let j = 0; j < nFeatures; j++) {
        let sumSq = 0;
        for (const idx of indices) {
          sumSq += (X[idx][j] - mean[j]) ** 2;
        }
        variance[j] = Math.max(sumSq / count, MIN_VARIANCE);
      }
      this.variances[key] = variance;
    }

    this.fitted = true;
    return this;
  }

  /**
   * Predict the most likely grid point for a live RSSI vector.
   * @param {number[]} sample - Raw RSSI vector (n_features)
   * @returns {{ x: number, y: number, confidence: number, probabilities: object[] }}
   */
  predict(sample) {
    if (!this.fitted) throw new Error('GaussianNaiveBayes not fitted. Call fit() first.');

    const LOG_2PI = Math.log(2 * Math.PI);
    const logPosteriors = [];

    for (const key of this.classes) {
      const mean = this.means[key];
      const variance = this.variances[key];
      let logP = this.priors[key];

      // Sum log-likelihood for each feature: log N(x | mu, sigma^2)
      for (let j = 0; j < sample.length; j++) {
        const diff = sample[j] - mean[j];
        logP += -0.5 * (LOG_2PI + Math.log(variance[j]) + (diff * diff) / variance[j]);
      }

      logPosteriors.push({ key, logP });
    }

    // Sort by descending log-posterior
    logPosteriors.sort((a, b) => b.logP - a.logP);

    const best = logPosteriors[0];
    const coords = this.classCoords[best.key];

    // Confidence: softmax-style normalization of top predictions
    // Use log-sum-exp for numerical stability
    const maxLogP = best.logP;
    let sumExp = 0;
    for (const item of logPosteriors) {
      sumExp += Math.exp(item.logP - maxLogP);
    }
    const confidence = 1 / sumExp; // probability of the top class

    // Top probabilities for debugging
    const topN = Math.min(5, logPosteriors.length);
    const probabilities = [];
    for (let i = 0; i < topN; i++) {
      const item = logPosteriors[i];
      const c = this.classCoords[item.key];
      probabilities.push({
        x: c.x,
        y: c.y,
        probability: Math.exp(item.logP - maxLogP) / sumExp,
      });
    }

    return {
      x: coords.x,
      y: coords.y,
      confidence,
      neighbors: probabilities,
    };
  }
}

module.exports = { GaussianNaiveBayes };

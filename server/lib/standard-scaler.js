/**
 * JavaScript equivalent of sklearn.preprocessing.StandardScaler
 * Ported from the pattern in weighted_knn_uog.py lines 124-128
 */
class StandardScaler {
  constructor() {
    this.mean = null;
    this.std = null;
    this.fitted = false;
  }

  /**
   * Compute mean and std per feature from training data.
   * @param {number[][]} X - Training feature matrix (n_samples x n_features)
   */
  fit(X) {
    const nSamples = X.length;
    const nFeatures = X[0].length;

    this.mean = new Array(nFeatures).fill(0);
    this.std = new Array(nFeatures).fill(0);

    // Compute mean per feature
    for (let j = 0; j < nFeatures; j++) {
      let sum = 0;
      for (let i = 0; i < nSamples; i++) {
        sum += X[i][j];
      }
      this.mean[j] = sum / nSamples;
    }

    // Compute std per feature
    for (let j = 0; j < nFeatures; j++) {
      let sumSq = 0;
      for (let i = 0; i < nSamples; i++) {
        sumSq += (X[i][j] - this.mean[j]) ** 2;
      }
      this.std[j] = Math.sqrt(sumSq / nSamples);
      // Prevent division by zero
      if (this.std[j] === 0) this.std[j] = 1;
    }

    this.fitted = true;
    return this;
  }

  /**
   * Transform a single sample or matrix.
   * @param {number[]|number[][]} X - Single sample or matrix
   * @returns {number[]|number[][]} Scaled values
   */
  transform(X) {
    if (!this.fitted) throw new Error('StandardScaler not fitted. Call fit() first.');

    // Single sample (1D array)
    if (!Array.isArray(X[0])) {
      return X.map((val, j) => (val - this.mean[j]) / this.std[j]);
    }

    // Matrix (2D array)
    return X.map(row => row.map((val, j) => (val - this.mean[j]) / this.std[j]));
  }

  /**
   * Fit and transform in one step.
   */
  fitTransform(X) {
    this.fit(X);
    return this.transform(X);
  }

  /**
   * Serialize scaler state for persistence.
   */
  toJSON() {
    return { mean: this.mean, std: this.std, fitted: this.fitted };
  }

  /**
   * Restore scaler from serialized state.
   */
  static fromJSON(json) {
    const scaler = new StandardScaler();
    scaler.mean = json.mean;
    scaler.std = json.std;
    scaler.fitted = json.fitted;
    return scaler;
  }
}

module.exports = StandardScaler;

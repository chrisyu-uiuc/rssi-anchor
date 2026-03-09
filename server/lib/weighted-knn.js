/**
 * Weighted K-NN with Gaussian kernel for indoor localization.
 * Ported from weighted_knn_uog.py lines 83-112.
 *
 * @param {number[]} testSample - Scaled RSSI vector (n_features)
 * @param {number[][]} dbRssi - Scaled training RSSI matrix (n_samples x n_features)
 * @param {number[][]} dbCoords - Training coordinates matrix (n_samples x 2), in cm
 * @param {number} k - Number of nearest neighbors
 * @param {number} sigma - Bandwidth for Gaussian kernel
 * @returns {{ x: number, y: number, confidence: number, neighbors: object[] }}
 */
function weightedKnn(testSample, dbRssi, dbCoords, k = 3, sigma = 1.0) {
  // 1. Euclidean distance in RSSI space
  const distances = dbRssi.map((row, idx) => {
    let sumSq = 0;
    for (let j = 0; j < row.length; j++) {
      sumSq += (row[j] - testSample[j]) ** 2;
    }
    return { dist: Math.sqrt(sumSq), idx };
  });

  // 2. Sort by distance, take k nearest
  distances.sort((a, b) => a.dist - b.dist);
  const kNearest = distances.slice(0, k);

  // 3. Gaussian kernel weights
  const weights = kNearest.map(n => Math.exp(-(n.dist ** 2) / (2 * sigma ** 2)));
  const weightSum = weights.reduce((s, w) => s + w, 0);

  // 4. Weighted average of coordinates
  let predX = 0;
  let predY = 0;
  const neighbors = [];

  kNearest.forEach((n, j) => {
    const w = weights[j] / weightSum;
    predX += dbCoords[n.idx][0] * w;
    predY += dbCoords[n.idx][1] * w;
    neighbors.push({
      x: dbCoords[n.idx][0],
      y: dbCoords[n.idx][1],
      distance: n.dist,
      weight: w,
    });
  });

  // Confidence: inverse of average distance to k neighbors (higher = better)
  const avgDist = kNearest.reduce((s, n) => s + n.dist, 0) / k;
  const confidence = avgDist > 0 ? 1 / (1 + avgDist) : 1;

  return { x: predX, y: predY, confidence, neighbors };
}

module.exports = { weightedKnn };

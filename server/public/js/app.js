// Initialize Socket.IO
const socket = io();

// Initialize components
const gridCanvas = new GridCanvas('gridCanvas');
const trainingPanel = new TrainingPanel(socket, gridCanvas);
const rssiMonitor = new RssiMonitor(socket);

// DOM elements
const elServerStatus = document.getElementById('serverStatus');
const elServerStatusText = document.getElementById('serverStatusText');
const elBtnTraining = document.getElementById('btnTraining');
const elBtnLocalization = document.getElementById('btnLocalization');
const elTrainingPanel = document.getElementById('trainingPanel');
const elLocalizationPanel = document.getElementById('localizationPanel');
const elPredictedPosition = document.getElementById('predictedPosition');
const elConfidenceValue = document.getElementById('confidenceValue');
const elUpdateRate = document.getElementById('updateRate');
const elShowTrail = document.getElementById('showTrail');
const elGridInfo = document.getElementById('gridInfo');
const elKnnK = document.getElementById('knnK');
const elKnnSigma = document.getElementById('knnSigma');
const elBtnUpdateKnn = document.getElementById('btnUpdateKnn');

// State
let currentMode = 'TRAINING';
let lastPositionTime = 0;
let positionCount = 0;
let rateInterval = null;

// --- Connection status ---
socket.on('connect', () => {
  elServerStatus.classList.add('connected');
  elServerStatusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
  elServerStatus.classList.remove('connected');
  elServerStatusText.textContent = 'Disconnected';
});

// --- Fetch config ---
fetch('/api/config')
  .then(res => res.json())
  .then(cfg => {
    gridCanvas.setConfig(cfg);
    rssiMonitor.setConfig(cfg.anchorIds, cfg.beaconIds);
    elGridInfo.textContent = `${cfg.grid.WIDTH} x ${cfg.grid.HEIGHT} cm (${cfg.grid.SPACING}cm grid) | ${cfg.featureSize} features`;
    elKnnK.value = cfg.knn.K;
    elKnnSigma.value = cfg.knn.SIGMA;
  });

// --- Mode switching ---
function setMode(mode) {
  currentMode = mode;
  socket.emit('mode:set', { mode });
}

elBtnTraining.addEventListener('click', () => setMode('TRAINING'));
elBtnLocalization.addEventListener('click', () => setMode('LOCALIZATION'));

socket.on('mode:changed', (data) => {
  currentMode = data.mode;

  elBtnTraining.classList.toggle('active', data.mode === 'TRAINING');
  elBtnLocalization.classList.toggle('active', data.mode === 'LOCALIZATION');

  if (data.mode === 'TRAINING') {
    trainingPanel.show();
    elLocalizationPanel.style.display = 'none';
    gridCanvas.clearPosition();
  } else {
    trainingPanel.hide();
    elLocalizationPanel.style.display = '';
    positionCount = 0;
    startRateCounter();
  }
});

// --- Localization events ---
socket.on('dashboard:position', (data) => {
  const x = data.x.toFixed(0);
  const y = data.y.toFixed(0);
  elPredictedPosition.textContent = `(${x}, ${y}) cm`;

  // Confidence color
  const conf = data.confidence;
  if (conf > 0.3) {
    elConfidenceValue.textContent = `${(conf * 100).toFixed(0)}% (Good)`;
    elConfidenceValue.style.color = '#00ff88';
  } else if (conf > 0.15) {
    elConfidenceValue.textContent = `${(conf * 100).toFixed(0)}% (Fair)`;
    elConfidenceValue.style.color = '#ffdd00';
  } else {
    elConfidenceValue.textContent = `${(conf * 100).toFixed(0)}% (Weak)`;
    elConfidenceValue.style.color = '#ff4444';
  }

  gridCanvas.setPosition(data.x, data.y, data.confidence);
  positionCount++;
});

socket.on('localization:ready', (data) => {
  console.log(`Localization ready with ${data.fingerprintCount} fingerprints`);
});

socket.on('localization:error', (data) => {
  elPredictedPosition.textContent = data.message;
  elPredictedPosition.style.color = '#ff4444';
});

// --- KNN parameter update ---
elBtnUpdateKnn.addEventListener('click', () => {
  const k = parseInt(elKnnK.value);
  const sigma = parseFloat(elKnnSigma.value);
  if (k > 0 && sigma > 0) {
    socket.emit('config:update', { knnK: k, knnSigma: sigma });
  }
});

// --- Trail toggle ---
elShowTrail.addEventListener('change', () => {
  gridCanvas.showTrail = elShowTrail.checked;
  gridCanvas.draw();
});

// --- Update rate counter ---
function startRateCounter() {
  if (rateInterval) clearInterval(rateInterval);
  let lastCount = 0;
  rateInterval = setInterval(() => {
    const rate = positionCount - lastCount;
    lastCount = positionCount;
    elUpdateRate.textContent = `${(rate / 2).toFixed(1)} Hz`;
  }, 2000);
}

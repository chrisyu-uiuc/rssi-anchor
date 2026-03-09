# Indoor Positioning System — Real-Time iBeacon Fingerprinting

A distributed BLE indoor positioning system that uses RSSI fingerprinting to localize an iBeacon target in real time. Built on the same Weighted K-NN approach as the [UoG BLE Localization dataset](../README.md), adapted for a live deployment with Raspberry Pi anchor nodes and a central Mac server.

## Architecture

```
                        ┌──────────────┐
                        │  iBeacon HW  │   Target to be localized
                        │  (moves)     │   Broadcasts BLE advertisements
                        └──────┬───────┘
                               │  BLE signal received by all anchors
          ┌────────┬───────────┼───────────┬────────┬────────┐
          │        │           │           │        │        │
       ┌──┴──┐ ┌──┴──┐    ┌──┴──┐    ┌──┴──┐ ┌──┴──┐ ┌──┴──┐
       │ A1  │ │ A2  │    │ A3  │    │ A4  │ │ A5  │ │ A6  │
       │ RPi │ │ RPi │    │ RPi │    │ RPi │ │ RPi │ │ RPi │
       └──┬──┘ └──┬──┘    └──┬──┘    └──┬──┘ └──┬──┘ └──┬──┘
          │        │          │          │        │        │
          └────────┴──────────┼──────────┴────────┴────────┘
                              │  WiFi (Socket.IO)
                       ┌──────┴───────┐
                       │  Mac Server  │   Central server
                       │  Express +   │   Aggregates RSSI, runs KNN
                       │  Socket.IO   │   Serves web dashboard
                       └──────┬───────┘
                              │
                       ┌──────┴───────┐
                       │  Dashboard   │   Real-time position on grid
                       │  (Browser)   │   Training & localization UI
                       └──────────────┘
```

## Deployment Area

490 x 490 cm open area with 6 anchors (4 corners + 2 midpoints):

```
  A1(0,490) ─────── A5(245,490) ─────── A2(490,490)
  │                                               │
  │                                               │
  │                490 x 490 cm                   │
  │                                               │
  │                                               │
  A4(0,0) ──────── A6(245,0) ──────── A3(490,0)
```

## Hardware Requirements

| Component | Quantity | Purpose |
|---|---|---|
| Raspberry Pi Zero 2W | 6 | Anchor scanner nodes |
| Dedicated iBeacon | 1 | Target to localize (the thing that moves) |
| Mac laptop | 1 | Central server + dashboard |
| WiFi network | 1 | All devices on the same network |

## Project Structure

```
indoor-positioning-system/
│
├── anchor/                        # Runs on each Raspberry Pi
│   ├── anchor-client.js           # BLE scanner → sends RSSI to server
│   ├── package.json
│   ├── .env.example               # Config template
│   ├── anchor-scanner.service     # systemd auto-start service
│   └── deploy.sh                  # One-command RPi deployment
│
└── server/                        # Runs on Mac laptop
    ├── server.js                  # Express + Socket.IO central server
    ├── config.js                  # Anchor positions, grid, KNN params
    ├── package.json
    │
    ├── lib/
    │   ├── anchor-manager.js      # Tracks 6 anchors + RSSI buffers
    │   ├── rssi-aggregator.js     # Time-windowed RSSI averaging
    │   ├── fingerprint-db.js      # CSV fingerprint database
    │   ├── weighted-knn.js        # K-NN with Gaussian kernel
    │   └── standard-scaler.js     # Feature normalization
    │
    ├── data/
    │   ├── fingerprints/          # Saved fingerprint CSV (generated)
    │   └── raw/                   # Raw RSSI logs per grid point
    │
    └── public/                    # Web dashboard
        ├── index.html
        ├── css/styles.css
        └── js/
            ├── app.js             # Main client app + Socket.IO
            ├── grid-canvas.js     # Canvas grid visualization
            ├── training-panel.js  # Training mode controls
            └── rssi-monitor.js    # Anchor status + live RSSI bars
```

## Quick Start

### 1. Prepare Each Raspberry Pi Zero 2W

Flash Raspberry Pi OS Lite, then on each RPi:

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install -y nodejs

# Enable Bluetooth
sudo systemctl enable bluetooth
sudo usermod -a -G bluetooth pi

# Enable SSH
sudo systemctl enable ssh

# Reboot
sudo reboot
```

Make sure each RPi is connected to the same WiFi network as your Mac.

### 2. Start the Central Server (Mac)

```bash
cd indoor-positioning-system/server
npm install
npm start
```

The dashboard opens at **http://localhost:3000**

Find your Mac's local IP (you'll need it for the anchors):

```bash
ipconfig getifaddr en0
```

### 3. Deploy to All 6 Raspberry Pis

From your Mac, run the deploy script for each anchor:

```bash
cd indoor-positioning-system/anchor

# Replace 192.168.x.x with your Mac's IP from step 2
SERVER=http://192.168.x.x:3000

./deploy.sh rpi-a1.local  A1  0    490  $SERVER
./deploy.sh rpi-a2.local  A2  490  490  $SERVER
./deploy.sh rpi-a3.local  A3  490  0    $SERVER
./deploy.sh rpi-a4.local  A4  0    0    $SERVER
./deploy.sh rpi-a5.local  A5  245  490  $SERVER
./deploy.sh rpi-a6.local  A6  245  0    $SERVER
```

Replace `rpi-a1.local` etc. with the actual hostname or IP of each RPi.

Each RPi will automatically start scanning on boot via systemd.

### 4. Verify Connections

Open the dashboard at `http://localhost:3000`. All 6 anchor cards should show green status dots.

### 5. Collect Training Data (Training Mode)

1. The dashboard starts in **Training** mode
2. Place the iBeacon at the first grid point shown on the canvas (highlighted in yellow)
3. Click **Collect** — the system records RSSI from all 6 anchors for 10 seconds
4. The point turns green when complete, and auto-advances to the next point
5. Move the iBeacon to the next highlighted point and repeat
6. With the default 70cm grid, there are **64 points** (~15 minutes total)

### 6. Real-Time Localization

1. Click the **Localization** toggle in the header
2. Move the iBeacon anywhere in the 490x490 area
3. The predicted position appears as a blue dot on the grid, updating every 2 seconds
4. A trail shows the recent movement path
5. Adjust **K** and **Sigma** parameters from the dashboard to tune accuracy

## How It Works

### Fingerprinting Approach

This system uses the same RSSI fingerprinting methodology as the UoG BLE research dataset:

1. **Training phase** — At each grid point, collect the average RSSI seen by each anchor. This creates a fingerprint: a 6-element vector `[rssi_A1, rssi_A2, ..., rssi_A6]` mapped to coordinates `(x, y)`.

2. **Localization phase** — When the iBeacon moves, all 6 anchors measure its RSSI. The server assembles a live feature vector, normalizes it with StandardScaler, and finds the K nearest training fingerprints using Euclidean distance. The predicted position is the Gaussian-weighted average of those K neighbors' coordinates.

### Weighted K-NN Algorithm

Ported directly from `weighted_knn_uog.py`:

```
1. Compute Euclidean distance between live RSSI vector and all training fingerprints
2. Select K nearest neighbors
3. Apply Gaussian kernel weights: w_i = exp(-d_i^2 / 2*sigma^2)
4. Predicted position = weighted average of neighbor coordinates
```

Default parameters: **K=3, Sigma=1.0** (adjustable from dashboard).

## Configuration

All system parameters are in `server/config.js`:

| Parameter | Default | Description |
|---|---|---|
| `GRID.WIDTH` | 490 | Area width in cm |
| `GRID.HEIGHT` | 490 | Area height in cm |
| `GRID.SPACING` | 70 | Grid point spacing in cm (70cm = 8x8 = 64 points) |
| `AGGREGATION_WINDOW` | 2000 | RSSI averaging window in ms |
| `TRAINING_DURATION` | 10000 | Collection time per grid point in ms |
| `KNN.K` | 3 | Number of nearest neighbors |
| `KNN.SIGMA` | 1.0 | Gaussian kernel bandwidth |
| `NO_SIGNAL_RSSI` | -100 | Default RSSI when an anchor has no reading |
| `PORT` | 3000 | Server port |

### Grid Spacing Options

| Spacing | Grid Size | Total Points | Collection Time |
|---|---|---|---|
| 70 cm | 8 x 8 | 64 | ~15 min |
| 49 cm | 11 x 11 | 121 | ~25 min |

### Anchor .env Configuration

Each RPi anchor has a `.env` file with:

```env
ANCHOR_ID=A1                          # Unique ID (A1-A6)
ANCHOR_POSITION_X=0                   # X position in cm
ANCHOR_POSITION_Y=490                 # Y position in cm
SERVER_URL=http://192.168.1.100:3000  # Mac server address
TARGET_BEACON_UUID=                   # Optional: filter by UUID
TARGET_MAJOR=                         # Optional: filter by Major
TARGET_MINOR=                         # Optional: filter by Minor
SCAN_INTERVAL=1000                    # BLE scan restart interval (ms)
```

Set `TARGET_BEACON_UUID`, `TARGET_MAJOR`, or `TARGET_MINOR` to filter for a specific iBeacon and ignore all others.

## Data Format

### Fingerprint CSV

Stored at `server/data/fingerprints/fingerprints.csv`:

```csv
x,y,rssi_A1,rssi_A2,rssi_A3,rssi_A4,rssi_A5,rssi_A6
0,0,-65.2,-72.1,-88.3,-58.9,-70.4,-85.1
0,70,-63.8,-74.5,-86.1,-60.2,-68.7,-83.4
```

### Raw Readings

Stored at `server/data/raw/{xxxyyy}_raw.csv` in UoG-compatible format:

```csv
objloc,rss,time,anchor
000000,-65,1709123456789,1
000000,-72,1709123456790,2
```

Where `anchor` 1-6 maps to A1-A6.

## Managing Anchors

```bash
# Check anchor status
ssh pi@rpi-a1.local 'sudo systemctl status anchor-scanner'

# View live logs
ssh pi@rpi-a1.local 'sudo journalctl -u anchor-scanner -f'

# Restart anchor
ssh pi@rpi-a1.local 'sudo systemctl restart anchor-scanner'

# Stop anchor
ssh pi@rpi-a1.local 'sudo systemctl stop anchor-scanner'
```

## Troubleshooting

| Issue | Solution |
|---|---|
| Anchor shows disconnected | Check WiFi connectivity. Verify `SERVER_URL` in the RPi's `.env` points to the Mac's IP |
| No RSSI readings | Ensure iBeacon is powered on and broadcasting. Check RPi Bluetooth is enabled (`bluetoothctl power on`) |
| RSSI shows -100 for all anchors | The iBeacon may be out of range or filtered. Clear `TARGET_BEACON_UUID` in `.env` to scan all beacons |
| Position prediction jumps erratically | Collect more training points (use 49cm grid). Increase aggregation window. Increase K value |
| Server won't start | Run `npm install` in `server/`. Check port 3000 is not in use |
| `node-beacon-scanner` fails on RPi | Ensure user is in bluetooth group: `sudo usermod -a -G bluetooth pi`, then reboot |

## Running With Fewer Anchors (3-Anchor Setup)

The system works with as few as **3 anchors**. The KNN algorithm is dimension-agnostic — it computes distance over whatever feature vector length it receives (3 instead of 6). No code changes are needed, only a config edit.

### 3 vs 6 Anchors

| | 6 Anchors | 3 Anchors |
|---|---|---|
| Feature vector | 6-element RSSI | 3-element RSSI |
| Spatial resolution | High | Lower — fewer unique RSSI signatures |
| Dead zones | Minimal | Possible in center / far side |
| Expected accuracy | ~0.3–0.5 m | ~0.7–1.5 m |
| Hardware cost | 6 RPi Zero 2W | 3 RPi Zero 2W |

### Recommended 3-Anchor Placement

Place them as a **triangle** for maximum angular separation. Avoid placing all 3 on the same wall.

```
  A1(0,490) ──────────────────────── A2(490,490)
  │                                            │
  │                                            │
  │               490 x 490 cm                 │
  │                                            │
  │                                            │
  └──────────── A3(245,0) ────────────────────┘
```

### Config Change

Edit `server/config.js` — only the first two fields:

```js
ANCHOR_IDS: ['A1', 'A2', 'A3'],
ANCHOR_POSITIONS: {
  A1: { x: 0,   y: 490 },
  A2: { x: 490, y: 490 },
  A3: { x: 245, y: 0   },
},
```

Everything else (anchor manager, KNN, scaler, dashboard, fingerprint DB) adapts automatically because all modules read from `config.ANCHOR_IDS`. The dashboard will show 3 anchor cards, the canvas draws 3 anchors, fingerprints store 3 RSSI values, and KNN runs over 3-dimensional vectors.

### Deploy Only 3 RPis

```bash
SERVER=http://192.168.x.x:3000

./deploy.sh rpi-a1.local  A1  0    490  $SERVER
./deploy.sh rpi-a2.local  A2  490  490  $SERVER
./deploy.sh rpi-a3.local  A3  245  0    $SERVER
```

### Tips to Compensate for Fewer Anchors

- **Use the denser 49cm grid** (121 training points) instead of 70cm — more training data helps when features are fewer
- **Increase K to 4 or 5** — averaging over more neighbors smooths noise from the smaller feature space
- **Use longer training duration** (15–20 seconds per point) for more stable RSSI averages
- **You can scale up later** — add more RPis at any time, update `config.js`, and re-collect training data

### Fingerprint CSV With 3 Anchors

The CSV automatically adjusts to 3 columns:

```csv
x,y,rssi_A1,rssi_A2,rssi_A3
0,0,-65.2,-72.1,-88.3
0,70,-63.8,-74.5,-86.1
```

> **Note:** Training data collected with 3 anchors is **not compatible** with a 6-anchor setup (different feature dimensions). If you add anchors later, you must re-collect all training data.

## Relation to UoG Dataset

This system replicates the UoG BLE fingerprinting research approach:

| Aspect | UoG Dataset | This System |
|---|---|---|
| Beacons/Anchors | 15 fixed BLE beacons | 6 RPi Zero 2W scanners |
| Target | Phone (scans beacons) | Dedicated iBeacon hardware |
| Direction | Phone scans fixed beacons | Fixed anchors scan mobile beacon |
| Area | 430 x 120 cm corridor | 490 x 490 cm open area |
| Algorithm | Weighted K-NN (Python) | Weighted K-NN (JS port) |
| Data collection | Offline CSV files | Real-time via WiFi |
| Prediction | Offline batch | Live every 2 seconds |

## License

MIT

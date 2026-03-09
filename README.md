# Indoor Positioning System — Real-Time Device-Free BLE Fingerprinting

A distributed BLE indoor positioning system that uses RSSI fingerprinting for device-free localization. 12+ fixed iBeacons broadcast throughout the area while 3-6 Raspberry Pi anchors measure signal strength from every beacon. A person walking through the area attenuates signals via body shadowing, creating unique RSSI patterns at each position. A central Mac server runs Weighted K-NN (ported from the [UoG BLE research](../README.md)) to predict position in real time.

**Device-free** means the person carries nothing — all sensing is done by the fixed infrastructure.

## Architecture

```
  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        12 fixed iBeacons
  │ B1  │ │ B2  │ │ B3  │ │ B4  │        placed throughout area
  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘        constantly broadcasting
     │BLE    │BLE    │BLE    │BLE
     │       │       │       │            Person walks through area
     │    ┌──┴──────┐│       │            Body shadows/attenuates
     ├────│ Person  │├───────┤            specific beacon→anchor links
     │    └─────────┘│       │
     │       │       │       │
  ┌──┴──┐ ┌─┴───┐ ┌┴────┐ ┌┴────┐       3-6 RPi anchors
  │ A1  │ │ A2  │ │ A3  │ │ ... │       scan ALL beacons
  │ RPi │ │ RPi │ │ RPi │ │ RPi │       report RSSI per beacon
  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
     └────────┴───┬───┴───────┘
                  │  WiFi (Socket.IO)
           ┌──────┴───────┐
           │  Mac Server  │   Aggregates anchor x beacon RSSI matrix
           │  KNN Engine  │   Predicts (x,y) position
           └──────┬───────┘
                  │
           ┌──────┴───────┐
           │  Dashboard   │   Real-time position on grid
           │  (Browser)   │   RSSI matrix heatmap
           └──────────────┘
```

## Feature Vector

Each RPi anchor measures RSSI from every iBeacon. The full feature vector is the **anchor x beacon matrix**, flattened:

```
              B1    B2    B3    B4    B5   ...  B12    (12 beacons)
  A1 RPi  [ -65   -72   -88   -70   -81  ...  -74 ]
  A2 RPi  [ -78   -60   -71   -82   -66  ...  -80 ]
  A3 RPi  [ -84   -81   -63   -76   -79  ...  -82 ]
  ...
  A6 RPi  [ -90   -77   -69   -83   -72  ...  -68 ]

  Flattened → 72-element feature vector (6 anchors x 12 beacons)
```

When a person stands at a specific position, their body attenuates certain beacon-to-anchor paths, creating a unique RSSI pattern. With 72 features, the fingerprint is rich enough for sub-meter accuracy.

## Deployment Area

490 x 490 cm open area with anchors at edges + beacons distributed throughout:

```
  A1 ─────────── A5 ─────────── A2      (RPi anchors at edges)
  │  B9    B10    B11    B12     │
  │                              │
  │  B5     B6     B7     B8    A5      490 x 490 cm
  │                              │
  │  B1     B2     B3     B4     │
  A4 ─────────── A6 ─────────── A3

  Anchors: edges/corners          Beacons: spread throughout interior
```

## Hardware Requirements

| Component | Quantity | Purpose |
|---|---|---|
| Raspberry Pi Zero 2W | 3-6 | Anchor scanner nodes (fixed at edges) |
| iBeacon hardware | 12-15 | Fixed reference beacons (spread throughout area) |
| Mac laptop | 1 | Central server + dashboard |
| WiFi network | 1 | All RPis and Mac on same network |

**The person being localized carries nothing.** All iBeacons and RPis are fixed infrastructure.

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

### 3. Place iBeacons

Spread 12 iBeacons throughout the 490x490 cm area. Record each beacon's Minor ID and physical position. Update `server/config.js` with your actual beacon IDs and positions:

```js
BEACON_IDS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
BEACON_POSITIONS: {
  1:  { x: 0,   y: 0   },
  2:  { x: 163, y: 0   },
  // ... update to match your actual placement
},
```

Placement tips:
- Spread beacons evenly across the area (grid pattern works well)
- Avoid clustering — maximize spatial diversity
- Mount at consistent height (~1m above floor)
- Ensure every position in the area is within range of at least 6-8 beacons

### 4. Deploy to All Raspberry Pis

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

Replace `rpi-a1.local` etc. with the actual hostname or IP of each RPi. For a 3-anchor setup, deploy only A1-A3.

Each RPi will automatically start scanning all iBeacons on boot via systemd.

### 5. Verify Connections

Open the dashboard at `http://localhost:3000`:
- All anchor cards should show green status dots
- The **RSSI matrix** should show values for each anchor x beacon pair (not all `--`)
- If a cell shows `--`, that anchor can't see that beacon (check placement/range)

### 6. Collect Training Data (Training Mode)

1. The dashboard starts in **Training** mode
2. Have a person **stand at the first grid point** shown on the canvas (highlighted in yellow)
3. Click **Collect** — the system records the full RSSI matrix for 10 seconds
4. The person's body attenuates specific beacon-to-anchor paths, creating a unique fingerprint
5. The point turns green when complete, and auto-advances to the next point
6. Person walks to the next highlighted point; click **Collect** again
7. With the default 70cm grid, there are **64 points** (~15 minutes total)

Important: the person must stand still at each point during collection. Their body position creates the fingerprint.

### 7. Real-Time Localization

1. Click the **Localization** toggle in the header
2. Person walks freely through the 490x490 area (carrying nothing)
3. The predicted position appears as a blue dot on the grid, updating every 2 seconds
4. A trail shows the recent movement path
5. The RSSI matrix updates in real-time showing signal attenuation patterns
6. Adjust **K** and **Sigma** parameters from the dashboard to tune accuracy

## How It Works

### Device-Free Fingerprinting

This system extends the UoG BLE fingerprinting methodology to device-free localization using radio tomographic imaging principles:

1. **Training phase** — A person stands at each grid point. Each RPi anchor measures RSSI from all 12 iBeacons. The person's body attenuates specific beacon-to-anchor links depending on their position. This creates a fingerprint: a 72-element vector (6 anchors x 12 beacons) mapped to coordinates `(x, y)`.

2. **Localization phase** — As the person moves, the RSSI attenuation pattern changes. The server assembles a live feature vector from all anchor x beacon readings, normalizes with StandardScaler, and runs Weighted K-NN to find the closest matching training fingerprint. The predicted position is the Gaussian-weighted average of the K nearest neighbors' coordinates.

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
| `ANCHOR_IDS` | A1-A6 | RPi scanner node IDs |
| `BEACON_IDS` | 1-12 | iBeacon Minor IDs (update to match your hardware) |
| `BEACON_POSITIONS` | (see config) | Physical position of each iBeacon in cm |
| `GRID.WIDTH` | 490 | Area width in cm |
| `GRID.HEIGHT` | 490 | Area height in cm |
| `GRID.SPACING` | 70 | Grid point spacing in cm (70cm = 8x8 = 64 points) |
| `AGGREGATION_WINDOW` | 2000 | RSSI averaging window in ms |
| `TRAINING_DURATION` | 10000 | Collection time per grid point in ms |
| `KNN.K` | 3 | Number of nearest neighbors |
| `KNN.SIGMA` | 1.0 | Gaussian kernel bandwidth |
| `NO_SIGNAL_RSSI` | -100 | Default RSSI when anchor has no reading for a beacon |
| `PORT` | 3000 | Server port |

### Feature Vector Size

| Anchors | Beacons | Features | Comparison |
|---|---|---|---|
| 3 | 12 | 36 | Exceeds UoG (15 features) |
| 6 | 12 | 72 | Nearly 5x UoG |
| 3 | 15 | 45 | 3x UoG |
| 6 | 15 | 90 | 6x UoG |

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

Stored at `server/data/fingerprints/fingerprints.csv`. Each row = one grid point, columns = anchor x beacon RSSI:

```csv
x,y,A1_B1,A1_B2,...,A1_B12,A2_B1,...,A6_B12
0,0,-65.2,-72.1,...,-74.3,-78.5,...,-68.1
0,70,-63.8,-74.5,...,-83.4,-60.2,...,-82.7
```

72 RSSI columns for a 6-anchor x 12-beacon setup.

### Raw Readings

Stored at `server/data/raw/{xxxyyy}_raw.csv`:

```csv
objloc,rss,time,anchor,beacon
000000,-65,1709123456789,1,3
000000,-72,1709123456790,2,3
000000,-88,1709123456791,1,7
```

Where `anchor` 1-6 maps to A1-A6 and `beacon` is the iBeacon Minor ID.

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

## Running With 3 Anchors

The system works with as few as **3 RPi anchors**. With 12 iBeacons, even 3 anchors give you a 36-element feature vector — more than double the UoG's 15 features.

### 3 vs 6 Anchors (with 12 beacons)

| | 3 Anchors | 6 Anchors |
|---|---|---|
| Feature vector | 36 (3 x 12) | 72 (6 x 12) |
| vs UoG (15 features) | 2.4x richer | 4.8x richer |
| Spatial diversity | Good | Excellent |
| Hardware cost | 3x RPi (~$22) | 6x RPi (~$45) |

### Recommended 3-Anchor Placement

Triangle for maximum angular separation:

```
  A1(0,490) ──────────────────────── A2(490,490)
  │      B9    B10    B11    B12              │
  │                                           │
  │      B5     B6     B7     B8              │
  │                                           │
  │      B1     B2     B3     B4              │
  └──────────── A3(245,0) ───────────────────┘
```

### Config Change

Edit `server/config.js`:

```js
ANCHOR_IDS: ['A1', 'A2', 'A3'],
ANCHOR_POSITIONS: {
  A1: { x: 0,   y: 490 },
  A2: { x: 490, y: 490 },
  A3: { x: 245, y: 0   },
},
```

Everything adapts automatically — dashboard shows 3 anchor cards, fingerprints store 36 features, KNN runs over 36 dimensions.

### Deploy Only 3 RPis

```bash
SERVER=http://192.168.x.x:3000

./deploy.sh rpi-a1.local  A1  0    490  $SERVER
./deploy.sh rpi-a2.local  A2  490  490  $SERVER
./deploy.sh rpi-a3.local  A3  245  0    $SERVER
```

> **Note:** Training data collected with 3 anchors is **not compatible** with a 6-anchor setup (different feature dimensions). If you add anchors later, you must re-collect all training data.

## Relation to UoG Dataset

This system extends the UoG BLE fingerprinting approach to device-free localization:

| Aspect | UoG Dataset | This System |
|---|---|---|
| Infrastructure | 15 fixed BLE beacons | 12 fixed iBeacons + 3-6 RPi scanners |
| Target | Phone carried by person | Nothing — device-free (body shadowing) |
| Features | 15 (1 per beacon) | 36-72 (anchors x beacons) |
| Sensing | Phone scans fixed beacons | Fixed RPis scan fixed beacons |
| Area | 430 x 120 cm corridor | 490 x 490 cm open area |
| Algorithm | Weighted K-NN (Python) | Weighted K-NN (JS port) |
| Data collection | Offline CSV files | Real-time via WiFi |
| Prediction | Offline batch | Live every 2 seconds |

## License

MIT

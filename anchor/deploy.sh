#!/bin/bash
# Deploy anchor client to a Raspberry Pi Zero 2W
#
# Usage: ./deploy.sh <rpi-hostname-or-ip> <anchor-id> <position-x> <position-y> <server-url>
# Example: ./deploy.sh rpi-a1.local A1 0 490 http://192.168.1.100:3000
#
# Prerequisites on RPi:
#   - Raspberry Pi OS (Lite recommended)
#   - Node.js v16+ installed (curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash - && sudo apt install -y nodejs)
#   - Bluetooth enabled (sudo systemctl enable bluetooth)
#   - User 'pi' in bluetooth group (sudo usermod -a -G bluetooth pi)

set -e

PI_HOST="${1:?Usage: ./deploy.sh <host> <anchor-id> <pos-x> <pos-y> <server-url>}"
ANCHOR_ID="${2:?Anchor ID required (e.g., A1)}"
POS_X="${3:?Position X required (cm)}"
POS_Y="${4:?Position Y required (cm)}"
SERVER_URL="${5:?Server URL required (e.g., http://192.168.1.100:3000)}"

REMOTE_DIR="/home/pi/anchor-client"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploying anchor ${ANCHOR_ID} to ${PI_HOST} ==="
echo "  Position: (${POS_X}, ${POS_Y})"
echo "  Server: ${SERVER_URL}"
echo ""

# Create remote directory
echo "[1/5] Creating remote directory..."
ssh "pi@${PI_HOST}" "mkdir -p ${REMOTE_DIR}"

# Copy files
echo "[2/5] Copying files..."
scp "${SCRIPT_DIR}/anchor-client.js" "pi@${PI_HOST}:${REMOTE_DIR}/"
scp "${SCRIPT_DIR}/package.json" "pi@${PI_HOST}:${REMOTE_DIR}/"
scp "${SCRIPT_DIR}/anchor-scanner.service" "pi@${PI_HOST}:${REMOTE_DIR}/"

# Generate .env
echo "[3/5] Generating .env..."
ssh "pi@${PI_HOST}" "cat > ${REMOTE_DIR}/.env << EOF
ANCHOR_ID=${ANCHOR_ID}
ANCHOR_POSITION_X=${POS_X}
ANCHOR_POSITION_Y=${POS_Y}
SERVER_URL=${SERVER_URL}
TARGET_BEACON_UUID=
TARGET_MAJOR=
TARGET_MINOR=
SCAN_INTERVAL=1000
EOF"

# Install dependencies
echo "[4/5] Installing npm dependencies..."
ssh "pi@${PI_HOST}" "cd ${REMOTE_DIR} && npm install --production"

# Install and start systemd service
echo "[5/5] Installing systemd service..."
ssh "pi@${PI_HOST}" "sudo cp ${REMOTE_DIR}/anchor-scanner.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable anchor-scanner && sudo systemctl restart anchor-scanner"

echo ""
echo "=== Deployment complete ==="
echo "  Check status: ssh pi@${PI_HOST} 'sudo systemctl status anchor-scanner'"
echo "  View logs:    ssh pi@${PI_HOST} 'sudo journalctl -u anchor-scanner -f'"

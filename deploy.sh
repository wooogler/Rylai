#!/bin/bash

# RYLAI Production Deployment Script
# This script builds and deploys the RYLAI application using Podman

set -e  # Exit on error

echo "======================================"
echo "RYLAI Production Deployment"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="rylai-app"
CONTAINER_NAME="rylai-app"
VOLUME_NAME="rylai-data"
PORT="3000"

# Step 1: Check if .env file exists
echo -e "${YELLOW}[1/6] Checking environment configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please create .env file with required environment variables."
    exit 1
fi
echo -e "${GREEN}✓ Environment file found${NC}"
echo ""

# Step 2: Stop and remove existing container if running
echo -e "${YELLOW}[2/6] Cleaning up existing containers...${NC}"
if sudo podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container..."
    sudo podman stop ${CONTAINER_NAME} || true
    echo "Removing existing container..."
    sudo podman rm ${CONTAINER_NAME} || true
    echo -e "${GREEN}✓ Cleanup complete${NC}"
else
    echo "No existing container found"
fi
echo ""

# Step 3: Build Docker image
echo -e "${YELLOW}[3/6] Building Docker image...${NC}"
echo "This may take 5-10 minutes..."
sudo podman build -t ${IMAGE_NAME}:latest . || {
    echo -e "${RED}Error: Docker build failed!${NC}"
    exit 1
}
echo -e "${GREEN}✓ Image built successfully${NC}"
echo ""

# Step 4: Create volume if it doesn't exist
echo -e "${YELLOW}[4/6] Setting up data volume...${NC}"
if ! sudo podman volume ls --format "{{.Name}}" | grep -q "^${VOLUME_NAME}$"; then
    sudo podman volume create ${VOLUME_NAME}
    echo -e "${GREEN}✓ Volume created${NC}"
else
    echo "Volume already exists"
fi
echo ""

# Step 5: Run container
echo -e "${YELLOW}[5/6] Starting application container...${NC}"
sudo podman run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p 127.0.0.1:${PORT}:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=/app/data/rylai.db \
  --env-file .env \
  -v ${VOLUME_NAME}:/app/data \
  ${IMAGE_NAME}:latest || {
    echo -e "${RED}Error: Failed to start container!${NC}"
    exit 1
}
echo -e "${GREEN}✓ Container started${NC}"
echo ""

# Step 6: Wait and verify
echo -e "${YELLOW}[6/6] Verifying deployment...${NC}"
echo "Waiting for application to start..."
sleep 5

# Check if container is running
if sudo podman ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${GREEN}✓ Container is running${NC}"

    # Test health endpoint
    echo "Testing health endpoint..."
    if curl -f http://localhost:${PORT}/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Health check passed${NC}"
    else
        echo -e "${YELLOW}⚠ Health check endpoint not responding yet (may take a few more seconds)${NC}"
    fi
else
    echo -e "${RED}✗ Container failed to start${NC}"
    echo "Checking logs..."
    sudo podman logs ${CONTAINER_NAME}
    exit 1
fi
echo ""

# Success summary
echo "======================================"
echo -e "${GREEN}Deployment Successful!${NC}"
echo "======================================"
echo ""
echo "Application URL: http://localhost:${PORT}"
echo "Health Check:    http://localhost:${PORT}/api/health"
echo ""
echo "Useful commands:"
echo "  View logs:       sudo podman logs -f ${CONTAINER_NAME}"
echo "  Stop app:        sudo podman stop ${CONTAINER_NAME}"
echo "  Restart app:     sudo podman restart ${CONTAINER_NAME}"
echo "  Remove app:      sudo podman rm -f ${CONTAINER_NAME}"
echo "  Backup DB:       sudo podman cp ${CONTAINER_NAME}:/app/data/rylai.db ./backup-\$(date +%Y%m%d).db"
echo ""
echo "To view application logs now, run:"
echo "  sudo podman logs -f ${CONTAINER_NAME}"
echo ""

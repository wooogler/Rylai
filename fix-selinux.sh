#!/bin/bash

echo "Fixing SELinux permissions for Nginx..."

# Allow Nginx to make network connections
sudo setsebool -P httpd_can_network_connect 1

echo "✓ SELinux permission granted"
echo ""
echo "Testing connection..."
sleep 2
curl -s http://localhost/api/health | head -20

echo ""
echo "If you see the health check response above, the fix worked!"

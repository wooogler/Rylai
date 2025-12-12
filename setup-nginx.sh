#!/bin/bash

echo "Setting up Nginx configuration for RYLAI..."

# Copy HTTP-only config to conf.d
sudo cp nginx-http.conf /etc/nginx/conf.d/rylai.conf

# Create ACME challenge directory for future SSL
sudo mkdir -p /var/www/certbot

# Test nginx config
echo "Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "Configuration valid. Reloading Nginx..."
    sudo systemctl reload nginx
    echo ""
    echo "✓ Nginx configuration completed!"
    echo ""
    echo "Application is now accessible at:"
    echo "  http://128.173.237.99"
    echo "  http://localhost"
    echo ""
    echo "Test with: curl http://128.173.237.99/api/health"
else
    echo "✗ Nginx configuration test failed!"
    exit 1
fi

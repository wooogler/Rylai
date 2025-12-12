#!/bin/bash

echo "=== Fixing certbot setup ==="

# Step 1: Create directory with proper permissions
echo "Creating /var/www/certbot directory..."
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
sudo chmod -R 755 /var/www/certbot
sudo chown -R nginx:nginx /var/www/certbot

# Step 2: Set SELinux context
echo "Setting SELinux context..."
sudo chcon -R -t httpd_sys_content_t /var/www/certbot
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/certbot(/.*)?" 2>/dev/null || true
sudo restorecon -Rv /var/www/certbot

# Step 3: Create test file
echo "Creating test file..."
echo "certbot-test" | sudo tee /var/www/certbot/.well-known/acme-challenge/test > /dev/null
sudo chmod 644 /var/www/certbot/.well-known/acme-challenge/test

# Step 4: Reload Nginx
echo "Reloading Nginx..."
sudo systemctl reload nginx

# Step 5: Test
echo ""
echo "Testing access..."
curl http://rylai.cs.vt.edu/.well-known/acme-challenge/test

echo ""
echo ""
echo "If you see 'certbot-test' above, you can now run:"
echo "  ./setup-ssl.sh"

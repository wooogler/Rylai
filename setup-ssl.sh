#!/bin/bash

echo "=== Setting up SSL certificate for rylai.cs.vt.edu ==="

# Step 1: Create ACME challenge directory
echo "Creating ACME challenge directory..."
sudo mkdir -p /var/www/certbot

# Step 2: Obtain SSL certificate
echo "Obtaining SSL certificate from Let's Encrypt..."
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d rylai.cs.vt.edu \
  --email sangwonlee@vt.edu \
  --agree-tos \
  --non-interactive

if [ $? -eq 0 ]; then
    echo "✓ SSL certificate obtained successfully!"
    
    # Step 3: Update Nginx configuration to use HTTPS
    echo "Updating Nginx configuration for HTTPS..."
    sudo cp nginx.conf /etc/nginx/conf.d/rylai.conf
    
    # Step 4: Test Nginx configuration
    echo "Testing Nginx configuration..."
    sudo nginx -t
    
    if [ $? -eq 0 ]; then
        # Step 5: Reload Nginx
        echo "Reloading Nginx..."
        sudo systemctl reload nginx
        
        echo ""
        echo "✓ HTTPS setup complete!"
        echo ""
        echo "Your application is now accessible at:"
        echo "  https://rylai.cs.vt.edu"
        echo ""
        echo "HTTP will automatically redirect to HTTPS"
    else
        echo "✗ Nginx configuration test failed!"
        exit 1
    fi
else
    echo "✗ Failed to obtain SSL certificate!"
    echo "Check the error messages above."
    exit 1
fi

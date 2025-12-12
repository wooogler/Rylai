# RYLAI Production Deployment Guide

This guide covers deploying RYLAI to production with Podman and Nginx on Rocky Linux.

## Prerequisites

- Rocky Linux 10.1
- Podman 5.6.0+
- Nginx
- Node.js 20+ (for local builds)
- Domain: rylai.cs.vt.edu pointing to your server

## Step 1: Install Required Packages

```bash
# Install Nginx
sudo dnf install -y nginx

# Install Certbot for SSL certificates
sudo dnf install -y certbot python3-certbot-nginx

# Enable and start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Step 2: Configure Firewall

```bash
# Allow HTTP and HTTPS traffic
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## Step 3: Deploy Application with Podman

```bash
# Navigate to project directory
cd /home/sangwonlee/Rylai

# Make deploy script executable
chmod +x deploy.sh

# Run deployment script
./deploy.sh
```

The deployment script will:
1. Check for .env file
2. Clean up existing containers
3. Build the Docker image (5-10 minutes)
4. Create data volume for SQLite database
5. Start the container on port 3000
6. Verify deployment with health check

## Step 4: Obtain SSL Certificate

```bash
# Create directory for ACME challenges
sudo mkdir -p /var/www/certbot

# Install temporary Nginx config (HTTP only) for certificate verification
sudo cp nginx.conf /etc/nginx/sites-available/rylai
sudo ln -s /etc/nginx/sites-available/rylai /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d rylai.cs.vt.edu \
  --email your-email@vt.edu \
  --agree-tos \
  --no-eff-email
```

## Step 5: Install Production Nginx Configuration

```bash
# The nginx.conf file is already in the project directory
# It includes full SSL configuration

# Copy to sites-available (if not already done)
sudo cp nginx.conf /etc/nginx/sites-available/rylai

# Create symlink to enable site
sudo ln -sf /etc/nginx/sites-available/rylai /etc/nginx/sites-enabled/

# Remove default site if exists
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## Step 6: Set Up Auto-Renewal for SSL Certificates

```bash
# Test renewal process
sudo certbot renew --dry-run

# Certbot automatically creates a systemd timer for renewal
# Verify it's enabled
sudo systemctl list-timers | grep certbot
```

## Verification

After deployment, verify everything is working:

```bash
# 1. Check container status
sudo podman ps

# 2. Check container logs
sudo podman logs -f rylai-app

# 3. Test health endpoint locally
curl http://localhost:3000/api/health

# 4. Test via domain (HTTP - should redirect to HTTPS)
curl -I http://rylai.cs.vt.edu

# 5. Test via domain (HTTPS)
curl -I https://rylai.cs.vt.edu

# 6. Check Nginx logs
sudo tail -f /var/log/nginx/rylai-access.log
sudo tail -f /var/log/nginx/rylai-error.log
```

## Useful Commands

### Container Management

```bash
# View logs
sudo podman logs -f rylai-app

# Stop application
sudo podman stop rylai-app

# Restart application
sudo podman restart rylai-app

# Remove container (keeps data volume)
sudo podman rm -f rylai-app

# View data volume
sudo podman volume inspect rylai-data

# Backup database
sudo podman cp rylai-app:/app/data/rylai.db ./backup-$(date +%Y%m%d).db
```

### Nginx Management

```bash
# Test configuration
sudo nginx -t

# Reload configuration (no downtime)
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# View Nginx status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/rylai-error.log
```

### Deployment Updates

When you have code updates:

```bash
# 1. Pull latest code
git pull

# 2. Rebuild and redeploy
./deploy.sh

# 3. Verify deployment
curl https://rylai.cs.vt.edu/api/health
```

## Troubleshooting

### Container won't start

```bash
# Check logs for errors
sudo podman logs rylai-app

# Check if port 3000 is already in use
sudo ss -tlnp | grep 3000

# Check if .env file exists
ls -la /home/sangwonlee/Rylai/.env
```

### Nginx returns 502 Bad Gateway

```bash
# Verify container is running
sudo podman ps | grep rylai-app

# Check if application is listening on port 3000
curl http://localhost:3000/api/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/rylai-error.log
```

### SSL certificate issues

```bash
# Check certificate files exist
sudo ls -la /etc/letsencrypt/live/rylai.cs.vt.edu/

# Verify domain DNS is correct
dig rylai.cs.vt.edu

# Re-obtain certificate if needed
sudo certbot certonly --webroot -w /var/www/certbot -d rylai.cs.vt.edu
```

## Architecture Overview

```
Internet
   ↓
Nginx (Port 80/443) - SSL termination
   ↓
Reverse Proxy
   ↓
Podman Container (Port 3000)
   ↓
Next.js Application
   ↓
SQLite Database (Volume: rylai-data)
```

## Security Considerations

1. **SSL/TLS**: HTTPS enforced via Nginx with Let's Encrypt certificates
2. **Firewall**: Only ports 80 and 443 exposed to internet
3. **Container**: Application runs in isolated Podman container
4. **Database**: SQLite file stored in persistent volume with WAL mode
5. **API Keys**: Stored in .env file, not committed to git
6. **Headers**: Security headers configured in Nginx (HSTS, X-Frame-Options, etc.)

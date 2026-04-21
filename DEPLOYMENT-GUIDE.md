# VT CS Server Deployment Guide

This guide documents how to securely deploy web applications on Virginia Tech CS Department servers, specifically based on the RYLAI project deployment on Rocky Linux 10.1.

> **Created after security incident**: This guide incorporates lessons learned from Docker port exposure vulnerabilities (Dec 2024) and Next.js RCE vulnerability (CVE in Next.js 15.5.4).

---

## Table of Contents

- [Server Specifications](#server-specifications)
- [Security Best Practices](#security-best-practices)
- [Podman Container Setup](#podman-container-setup)
- [Nginx Reverse Proxy Configuration](#nginx-reverse-proxy-configuration)
- [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)
- [Deployment Checklist](#deployment-checklist)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Incident Response](#incident-response)

---

## Server Specifications

### Hardware & OS

```
OS: Rocky Linux 10.1 (Red Quartz)
Kernel: Linux 6.12.0
CPU: 4 cores
RAM: 31 GB
Disk: 100 GB (VDA2)
Swap: 8 GB
Architecture: x86_64
Support End: 2035-05-31
```

### Key Software Versions

```bash
Podman: 5.x (rootless-capable, Docker-compatible)
Nginx: Latest stable from Rocky Linux repos
Node.js: 20 LTS (Alpine-based containers)
Certbot: For Let's Encrypt SSL certificates
```

---

## Security Best Practices

### 🚨 Critical Security Rules

Based on VT CS security incidents (December 2024):

#### 1. **NEVER Expose Container Ports to 0.0.0.0**

**❌ WRONG (Vulnerable):**
```yaml
# docker-compose.yml
ports:
  - "3000:3000"  # Exposed to 0.0.0.0 - DANGEROUS!
```

**✅ CORRECT (Secure):**
```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:3000:3000"  # Localhost only
```

**For Podman:**
```bash
# WRONG
sudo podman run -p 3000:3000 myapp

# CORRECT
sudo podman run -p 127.0.0.1:3000:3000 myapp
```

#### 2. **Keep Dependencies Updated**

- Run `npm audit` regularly
- Subscribe to security advisories for your frameworks
- Example incident: Next.js 15.5.4 had RCE vulnerability → Fixed in 15.5.9

```bash
# Before deployment
npm audit
npm audit fix

# Check for critical vulnerabilities
npm audit --audit-level=high
```

#### 3. **Never Hardcode Secrets in Code**

**❌ WRONG:**
```typescript
const API_KEY = "sk-1234567890abcdef";  // NEVER do this
```

**✅ CORRECT:**
```typescript
const API_KEY = process.env.OPENAI_API_KEY;
```

Use `.env` files (never commit to Git):
```bash
# .env
OPENAI_API_KEY=sk-xxxxx
DATABASE_PASSWORD=xxxxx
```

Add to `.gitignore`:
```
.env
.env.local
.env.production
*.db
data/
```

#### 4. **Database Security**

- **Never expose database ports externally**
- Use localhost-only connections
- For SQLite: Keep database files inside containers or secure volumes
- For PostgreSQL/MySQL: Bind to `127.0.0.1` only

#### 5. **Remove Sensitive Information from UI**

- Don't display passwords on login screens
- Don't expose API keys in client-side code
- Don't show detailed error messages to users

**Example Fix:**
```tsx
// Before (Bad)
<p>Use password "admin123" to login</p>

// After (Good)
<p>Contact your administrator for login credentials</p>
```

---

## Podman Container Setup

### Why Podman?

- **Rootless containers**: Better security than Docker
- **Docker-compatible**: Drop-in replacement
- **No daemon**: More lightweight
- **Preferred by VT CS IT**: Recommended for department servers

### Installation (Rocky Linux)

```bash
# Install Podman
sudo dnf install -y podman podman-compose

# Verify installation
podman --version
```

### Dockerfile Best Practices

Multi-stage build example (from RYLAI project):

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install && npm run build

# Stage 3: Runner (Production)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user (SECURITY)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Run as non-root user
USER nextjs

# Expose port (internal only)
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
```

### Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

IMAGE_NAME="myapp"
CONTAINER_NAME="myapp"
VOLUME_NAME="myapp-data"
PORT="3000"  # Internal port

# 1. Check environment
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

# 2. Stop existing container
if sudo podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    sudo podman stop ${CONTAINER_NAME} || true
    sudo podman rm ${CONTAINER_NAME} || true
fi

# 3. Build image
sudo podman build -t ${IMAGE_NAME}:latest .

# 4. Create volume
if ! sudo podman volume ls --format "{{.Name}}" | grep -q "^${VOLUME_NAME}$"; then
    sudo podman volume create ${VOLUME_NAME}
fi

# 5. Run container (BIND TO LOCALHOST ONLY!)
sudo podman run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p 127.0.0.1:${PORT}:3000 \
  -e NODE_ENV=production \
  --env-file .env \
  -v ${VOLUME_NAME}:/app/data \
  ${IMAGE_NAME}:latest

# 6. Verify
sleep 5
if sudo podman ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "✓ Deployment successful!"
    echo "App running on: http://localhost:${PORT}"
else
    echo "✗ Deployment failed!"
    sudo podman logs ${CONTAINER_NAME}
    exit 1
fi
```

Make executable:
```bash
chmod +x deploy.sh
```

---

## Nginx Reverse Proxy Configuration

### Why Use Nginx?

- **SSL/TLS termination**: Handle HTTPS
- **Security layer**: Hide internal ports, add headers
- **Load balancing**: Scale horizontally if needed
- **Static file caching**: Improve performance

### Installation

```bash
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Configuration File

Create `/etc/nginx/conf.d/myapp.conf`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name myapp.cs.vt.edu;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name myapp.cs.vt.edu;

    # SSL Certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/myapp.cs.vt.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myapp.cs.vt.edu/privkey.pem;

    # SSL Configuration (Modern, Secure)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/myapp-access.log;
    error_log /var/log/nginx/myapp-error.log;

    # Client Settings
    client_max_body_size 10M;

    # Proxy to Podman Container (localhost:3000)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static file caching (if using Next.js/_next/static)
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, max-age=3600, immutable";
    }

    # Cache static assets
    location ~* \.(ico|css|js|gif|jpeg|jpg|png|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

### Test and Reload Nginx

```bash
# Test configuration
sudo nginx -t

# Reload if test passes
sudo systemctl reload nginx
```

---

## SSL/TLS with Let's Encrypt

### Install Certbot

```bash
sudo dnf install -y certbot python3-certbot-nginx
```

### Obtain Certificate

```bash
# Create webroot directory for ACME challenge
sudo mkdir -p /var/www/certbot

# Request certificate (interactive)
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d myapp.cs.vt.edu \
  --email your-email@vt.edu \
  --agree-tos \
  --no-eff-email
```

### Auto-renewal

Certbot installs a systemd timer automatically. Verify:

```bash
# Check timer status
sudo systemctl status certbot-renew.timer

# Test renewal (dry run)
sudo certbot renew --dry-run
```

### Manual Renewal Script

Create `/root/renew-ssl.sh`:

```bash
#!/bin/bash
certbot renew --quiet
systemctl reload nginx
```

Add to crontab:
```bash
sudo crontab -e
# Add line:
0 3 * * * /root/renew-ssl.sh
```

---

## Deployment Checklist

Use this checklist before deploying any project:

### Pre-Deployment

- [ ] **Security scan**: Run `npm audit` (or equivalent)
- [ ] **Dependencies updated**: All packages at latest stable versions
- [ ] **Secrets removed**: No hardcoded credentials in code
- [ ] **Environment variables**: `.env` file created (not committed to Git)
- [ ] **Port configuration**: Verify `127.0.0.1:PORT` binding (not `0.0.0.0`)
- [ ] **Dockerfile review**: Multi-stage build, non-root user, health checks
- [ ] **Git ignored**: `.env`, `*.db`, sensitive files in `.gitignore`

### Deployment

- [ ] **Build container**: `sudo podman build -t myapp .`
- [ ] **Test locally**: Verify app works on `localhost:PORT`
- [ ] **Deploy with script**: `./deploy.sh`
- [ ] **Check logs**: `sudo podman logs -f myapp`
- [ ] **Verify health**: `curl http://localhost:PORT/api/health`

### Nginx & SSL

- [ ] **Nginx config**: Create `/etc/nginx/conf.d/myapp.conf`
- [ ] **Test config**: `sudo nginx -t`
- [ ] **Reload Nginx**: `sudo systemctl reload nginx`
- [ ] **Request SSL**: `sudo certbot certonly --webroot ...`
- [ ] **Update Nginx**: Add SSL certificate paths
- [ ] **Test HTTPS**: Visit `https://myapp.cs.vt.edu`

### Post-Deployment

- [ ] **Monitor logs**: Check for errors in first 24 hours
- [ ] **Performance test**: Load test if expecting high traffic
- [ ] **Backup setup**: Database backup scripts configured
- [ ] **Documentation**: Update project README with deployment info
- [ ] **Security scan**: Run vulnerability scanner on live site

---

## Monitoring and Maintenance

### Log Management

```bash
# View container logs
sudo podman logs -f myapp

# Last 100 lines
sudo podman logs --tail 100 myapp

# With timestamps
sudo podman logs -t myapp

# Nginx access logs
sudo tail -f /var/log/nginx/myapp-access.log

# Nginx error logs
sudo tail -f /var/log/nginx/myapp-error.log
```

### Resource Monitoring

```bash
# Container resource usage
sudo podman stats myapp

# System resources
top
htop

# Disk usage
df -h
du -sh /var/lib/containers/storage/volumes/

# Check for port bindings (verify localhost only!)
sudo netstat -tlnp | grep 3000
# Should show: 127.0.0.1:3000, NOT 0.0.0.0:3000
```

### Database Backups

For SQLite (like RYLAI):

```bash
# Backup database from container
sudo podman cp myapp:/app/data/myapp.db ./backup-$(date +%Y%m%d-%H%M%S).db

# Automated backup script
cat > /root/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups"
mkdir -p $BACKUP_DIR
sudo podman cp myapp:/app/data/myapp.db $BACKUP_DIR/myapp-$(date +%Y%m%d-%H%M%S).db
# Keep only last 30 days
find $BACKUP_DIR -name "myapp-*.db" -mtime +30 -delete
EOF

chmod +x /root/backup-db.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
# Add: 0 2 * * * /root/backup-db.sh
```

### Health Checks

Implement a `/api/health` endpoint in your app:

```typescript
// app/api/health/route.ts (Next.js example)
export async function GET() {
  try {
    // Check database connection
    const dbCheck = await db.execute('SELECT 1');

    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    return Response.json(
      { status: 'unhealthy', error: error.message },
      { status: 503 }
    );
  }
}
```

Monitor it:
```bash
# Add to crontab (every 5 minutes)
*/5 * * * * curl -f http://localhost:3000/api/health || echo "Health check failed at $(date)" >> /var/log/health-check.log
```

---

## Incident Response

### Signs of Compromise

Based on actual incidents at VT CS (Dec 2024):

1. **High CPU usage** (crypto miners)
2. **Unusual network connections** (check `netstat`)
3. **Unknown processes** (check `ps aux`)
4. **Unexpected container logs** (RCE attempts)
5. **New files in unusual locations**

### Immediate Actions if Compromised

```bash
# 1. IMMEDIATELY stop container
sudo podman stop myapp
sudo podman rm myapp

# 2. Check for cryptocurrency miners
ps aux | grep -E "(xmrig|minerd|cpuminer|cryptonight|monero)"
top -b -n 1 | head -20

# 3. Check network connections
sudo netstat -tupn | grep ESTABLISHED

# 4. Check for malicious cron jobs
crontab -l
sudo crontab -l

# 5. Check for suspicious systemd services
systemctl list-units --type=service --state=running

# 6. Find recently modified files
find ~ -type f -mtime -7 -ls

# 7. Delete compromised image
sudo podman rmi myapp:latest

# 8. Report to VT Tech Staff
# Email: techstaff@cs.vt.edu
# Include: server hostname, incident details, logs

# 9. Clean rebuild from trusted source
git pull  # From clean repository
./deploy.sh  # Rebuild from scratch
```

### Prevention After Incident

1. **Update all dependencies**: `npm audit fix --force`
2. **Change all passwords/secrets**: Rotate API keys, database passwords
3. **Review recent commits**: Check for malicious code injection
4. **Audit user accounts**: Remove unauthorized SSH keys
5. **Enable fail2ban**: Block brute force attempts
6. **Set up monitoring**: Configure alerting for unusual activity

### Contact Information

- **VT CS Tech Staff**: techstaff@cs.vt.edu
- **VT IT Security**: security@vt.edu
- **Emergency**: Call VT IT Support Center (540-231-HELP)

---

## Useful Commands Reference

### Podman

```bash
# List running containers
sudo podman ps

# List all containers (including stopped)
sudo podman ps -a

# View logs
sudo podman logs -f myapp

# Execute command in container
sudo podman exec -it myapp /bin/sh

# Restart container
sudo podman restart myapp

# Stop and remove container
sudo podman stop myapp && sudo podman rm myapp

# Remove image
sudo podman rmi myapp:latest

# List volumes
sudo podman volume ls

# Inspect volume
sudo podman volume inspect myapp-data

# Prune unused resources
sudo podman system prune -a
```

### Nginx

```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# View status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/error.log
```

### Systemd

```bash
# Enable service on boot
sudo systemctl enable nginx

# Start service
sudo systemctl start nginx

# Stop service
sudo systemctl stop nginx

# View service logs
sudo journalctl -u nginx -f
```

---

## Additional Resources

- **VT CS Docker Security Wiki**: https://wiki.cs.vt.edu/index.php/HowTo:Docker_172_Fix
- **Podman Documentation**: https://docs.podman.io/
- **Nginx Documentation**: https://nginx.org/en/docs/
- **Let's Encrypt**: https://letsencrypt.org/docs/
- **OWASP Security Guidelines**: https://owasp.org/www-project-top-ten/

---

## Version History

- **v1.0** (2024-12-12): Initial version after security incident
  - Added port binding security rules
  - Added incident response procedures
  - Based on RYLAI project deployment

---

## License

This document is provided as-is for educational purposes within Virginia Tech CS Department. Use at your own risk.

---

**Last Updated**: December 12, 2024
**Maintainer**: sangwonlee@vt.edu
**Server**: rylai.cs.vt.edu (Rocky Linux 10.1)

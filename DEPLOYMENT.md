# Glitool — Deployment Strategy

## Infrastructure Decision

**Date approved:** 2026-05-21

```
Backend   →  DigitalOcean Droplet     $6 / month (recommended)
            OR Hostinger KVM 1 VPS   $9.99 first month / $19.49 renewal
Website   →  Vercel                  Free
Domain    →  glit.in (Hostinger)     $2.99 / 3 years ($1/year)

Total:  $6/month + $1/year  (DigitalOcean path)
```

---

## Hosting Options — Choose One

| | DigitalOcean Basic | Hostinger KVM 1 |
|--|-------------------|-----------------|
| Monthly cost | **$6 flat** | $9.99 promo / $19.49 renewal |
| RAM | 1 GB | 4 GB |
| Storage | 25 GB SSD | 50 GB NVMe |
| Free credit | **$200 for 60 days** | None |
| Commitment | Month-to-month | Month-to-month |
| India region | Bangalore | Mumbai |
| Verdict | **Recommended** | Overkill for current scale |

Glitool backend uses ~200MB RAM — 1GB is more than enough.

---

## Why This Setup

| Choice | Reason |
|--------|--------|
| VPS over shared hosting | Shared Node.js is sandboxed — breaks LLM streaming |
| DigitalOcean over Hostinger | Flat $6/month, no surprise renewal price, $200 free credit |
| Vercel over VPS for website | Purpose-built for Next.js, zero config, free |
| glit.in over glitool.com | glitool.com taken, glit.in available at $1/year |

---

## Server Specs

### DigitalOcean Basic Droplet (Recommended)
```
CPU:      1 vCPU
RAM:      1 GB
Storage:  25 GB SSD
OS:       Ubuntu 22.04 LTS
Region:   Bangalore
Price:    $6 / month flat
```

### Hostinger KVM 1 (Alternative)
```
CPU:      1 vCPU (AMD EPYC)
RAM:      4 GB
Storage:  50 GB NVMe SSD
Bandwidth: 4 TB / month
OS:       Ubuntu 22.04 LTS
Price:    $9.99/month (promo) → renews at $19.49/month
```

**Glitool backend uses approximately:**
```
RAM:       ~200 MB
CPU:       Low (I/O bound, not compute)
Storage:   ~500 MB (app + logs)
Bandwidth: ~2 GB / month (100 users)
```

---

## Domain Structure

```
glit.in              →  Vercel  (main website)
www.glit.in          →  Vercel  (redirect to glit.in)
api.glit.in          →  Hostinger KVM 1 (backend)
```

---

## Architecture Overview

```
User's Machine
     │
     │ glitool CLI
     │
     ▼
api.glit.in  (Hostinger KVM 1)
     │
     ├── Express server (port 3000)
     ├── Nginx (reverse proxy, SSL)
     ├── PM2 (process manager)
     │
     ├── /auth/*          GitHub OAuth
     ├── /v1/*            Together.ai proxy
     ├── /billing/*       Lemon Squeezy checkout
     └── /webhooks/*      Payment webhooks
     │
     ├── MongoDB Atlas    (external, already set up)
     └── Together.ai      (external LLM provider)

glit.in  (Vercel)
     │
     ├── /               Landing page
     ├── /activate        Device code auth
     └── /upgrade         Pro subscription page
```

---

## Pre-Deploy Checklist (do before touching server)

```
□ Switch proxy from OpenAI → Together.ai in server/src/routes/proxy.ts
□ Update factory.ts default URL to https://api.glit.in
□ Update CORS in server/src/index.ts to allow glit.in
□ Update CLIENT_URL in server/.env to https://glit.in
□ Get Together.ai API key
□ Push all code to GitHub
□ Build CLI with production URL
```

---

## Step-by-Step Deployment

---

### Phase 1 — Buy Domain + Server

#### Option A — DigitalOcean (Recommended)

1. Go to digitalocean.com → sign up with Google
2. New accounts get **$200 free credit for 60 days**
3. Click **Create → Droplets**
4. Choose:
   - Region: **Bangalore**
   - OS: **Ubuntu 22.04 LTS**
   - Plan: Basic → Regular → **$6/month** (1 vCPU, 1GB RAM, 25GB SSD)
   - Authentication: Password (set a strong root password)
5. Click **Create Droplet**
6. Note your **Droplet IP address**
7. Buy **glit.in domain** on Hostinger — $2.99 for 3 years

#### Option B — Hostinger KVM 1

1. Go to hostinger.com
2. Buy **KVM 1 VPS** — $9.99/month (note: renews at $19.49/month)
3. Buy **glit.in domain** — $2.99 for 3 years
4. Choose Ubuntu 22.04 LTS as OS
5. Note down your VPS IP address

> All phases below work identically for both options.

---

### Phase 2 — Initial Server Setup

SSH into your server:
```bash
ssh root@YOUR_VPS_IP
```

Update system:
```bash
apt update && apt upgrade -y
```

Create a non-root user:
```bash
adduser glitool
usermod -aG sudo glitool
su - glitool
```

---

### Phase 3 — Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version    # v20.x
npm --version     # 10.x
```

---

### Phase 4 — Install PM2 + Nginx

```bash
# PM2 — keeps server alive, restarts on crash
sudo npm install -g pm2

# Nginx — reverse proxy + SSL termination
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

### Phase 5 — Clone and Build App

```bash
cd /var/www
sudo git clone https://github.com/YOUR_USERNAME/Glitool.git
sudo chown -R glitool:glitool /var/www/Glitool
cd /var/www/Glitool/server
npm install
npm run build
```

---

### Phase 6 — Environment Variables

```bash
nano /var/www/Glitool/server/.env
```

Paste:
```
MONGO_URI=mongodb+srv://glitool_admin:YOUR_PASSWORD@your-cluster.mongodb.net/glitool?appName=Cluster0
TOGETHER_API_KEY=your_together_api_key_here
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
CLIENT_URL=https://glit.in
PORT=3000
```

Save with Ctrl+X → Y → Enter.

---

### Phase 7 — Start with PM2

```bash
cd /var/www/Glitool/server
pm2 start dist/index.js --name glitool-server
pm2 save
pm2 startup    # copy and run the command it gives you
```

Verify it's running:
```bash
pm2 status
pm2 logs glitool-server
```

---

### Phase 8 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/glitool
```

Paste:
```nginx
server {
    listen 80;
    server_name api.glit.in;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Critical for LLM streaming — do not remove
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        chunked_transfer_encoding on;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/glitool /etc/nginx/sites-enabled/
sudo nginx -t          # test config
sudo systemctl restart nginx
```

---

### Phase 9 — SSL Certificate (Free)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.glit.in
```

Certbot auto-renews every 90 days. Done.

Test HTTPS:
```bash
curl https://api.glit.in/health
# should return: {"ok":true,"time":"..."}
```

---

### Phase 10 — DNS Setup (Hostinger)

In Hostinger DNS panel for glit.in, add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_VPS_IP | 300 |
| A | www | YOUR_VPS_IP | 300 |
| A | api | YOUR_VPS_IP | 300 |
| CNAME | www | glit.in | 300 |

DNS takes 5–30 minutes to propagate.

---

### Phase 11 — Deploy Website to Vercel

1. Go to vercel.com → New Project
2. Import GitHub repo → set Root Directory to `client`
3. Add environment variable:
   ```
   NEXT_PUBLIC_BACKEND_URL=https://api.glit.in
   ```
4. Deploy
5. Add custom domain `glit.in` in Vercel dashboard
6. Vercel gives you CNAME records → add to Hostinger DNS

---

### Phase 12 — Update GitHub OAuth App

Go to github.com/settings/developers → Glitool OAuth App:

```
Homepage URL:   https://glit.in
Callback URL:   https://api.glit.in/auth/github/callback
```

---

### Phase 13 — Rebuild CLI

```bash
cd /home/influxiq/Desktop/PersonalProject/Glitool/CLI
npm run build && npm install -g .
```

---

## Verify Everything Works

Run these checks in order:

```bash
# 1. Backend health
curl https://api.glit.in/health
# Expected: {"ok":true,"time":"..."}

# 2. Auth device endpoint
curl -X POST https://api.glit.in/auth/device
# Expected: {"device_code":"...","user_code":"ABC-123",...}

# 3. Website loads
open https://glit.in

# 4. Activate page loads
open https://glit.in/activate

# 5. CLI connects to production
glitool
# StatusBar should show: 5 free left · gpt-4o-mini
```

---

## Deploying Updates (after first deploy)

Every time you push new code:

```bash
# On your local machine
git push origin main

# SSH into server
ssh glitool@YOUR_VPS_IP
cd /var/www/Glitool/server
git pull
npm install
npm run build
pm2 restart glitool-server
```

Or set up auto-deploy with a GitHub webhook (optional, do later).

Vercel auto-deploys on every push to main — no manual step needed.

---

## Monitoring

```bash
# Check server is running
pm2 status

# Watch live logs
pm2 logs glitool-server --lines 50

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check disk space
df -h

# Check RAM usage
free -m
```

---

## Backup Strategy

MongoDB Atlas has automatic backups (already set up).

For server files:
```bash
# Add to crontab — daily backup of .env and config
crontab -e

# Add this line:
0 2 * * * cp /var/www/Glitool/server/.env /var/backups/glitool-env-$(date +%Y%m%d)
```

---

## Cost Summary

| Item | Cost |
|------|------|
| DigitalOcean Basic Droplet | $6.00 / month |
| glit.in domain | $2.99 / 3 years ($1/year) |
| Vercel (website) | Free |
| MongoDB Atlas | Free (M0 tier) |
| Together.ai LLM | Pay per use (~$0.055/free user, ~$0.18/Pro user) |
| SSL Certificate | Free (Let's Encrypt) |
| **Total fixed cost** | **~$6.08 / month** |

Break-even: **1 Pro user** ($12/month) covers all infrastructure costs.

---

## Open Decisions

| Question | Decision | Status |
|----------|----------|--------|
| VPS provider | DigitalOcean Basic ($6/month flat) | ✅ Approved |
| Website hosting | Vercel | ✅ Approved |
| Domain | glit.in | ✅ Approved |
| OS | Ubuntu 22.04 LTS | ✅ Approved |
| Process manager | PM2 | ✅ Approved |
| Reverse proxy | Nginx | ✅ Approved |
| SSL | Let's Encrypt (Certbot) | ✅ Approved |
| Auto-deploy | GitHub webhook | ⏳ Later |
| CDN | Cloudflare | ⏳ Later |
| Monitoring | UptimeRobot (free) | ⏳ Later |

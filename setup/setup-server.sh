#!/bin/bash
set -euo pipefail

APP_DIR=/var/www/displaynetworks
TARGET_CLEANUP_DIR=""
SUDOERS_FILE=""
ERR_LOG="/tmp/dn_error.log"

# Global exit trap for guaranteed resource cleanup and error handling
cleanup() {
    local exit_code=$?
    if [[ -n "$SUDOERS_FILE" && -f "$SUDOERS_FILE" ]]; then
        rm -f "$SUDOERS_FILE"
    fi
    if [[ -n "$TARGET_CLEANUP_DIR" && -d "$TARGET_CLEANUP_DIR" ]]; then
        rm -rf "$TARGET_CLEANUP_DIR"
    fi
    if [[ $exit_code -ne 0 ]]; then
        exec 1>&3 2>&4 2>/dev/null || true
        printf "\n\033[31mInstallation failed on line %d (Exit Code %d): %s\033[0m\n" "${1:-0}" "$exit_code" "${2:-unknown}"
        if [[ -f "$ERR_LOG" && -s "$ERR_LOG" ]]; then
            printf "\033[33m--- Recent Stderr Details ---\033[0m\n"
            tail -n 20 "$ERR_LOG"
        fi
    fi
    rm -f "$ERR_LOG"
}

trap 'cleanup ${LINENO:-0} "$BASH_COMMAND"' EXIT

# Resilient wrapper for apt package installation to handle CDN/network drops
apt_install() {
    local retries=3
    local count=0
    local delay=3

    until DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-missing "$@"; do
        count=$((count + 1))
        if (( count >= retries )); then
            echo "Error: apt-get install failed after $retries attempts for packages: $*" >&2
            return 1
        fi
        echo "Warning: apt-get install failed. Retrying in $delay seconds ($count/$retries)..." >&2
        sleep "$delay"
        DEBIAN_FRONTEND=noninteractive apt-get update -y || true
    done
}

ask_var() {
    local var_name=$1
    local prompt_text=$2
    local default_value=$3
    
    if [[ -n "${!var_name:-}" ]]; then
        return 0
    fi

    local input=""
    while [[ -z "$input" ]]; do
        if [[ -n "$default_value" ]]; then
            read -r -p "$prompt_text [$default_value]: " input <&3
            input="${input:-$default_value}"
        else
            read -r -p "$prompt_text (Required): " input <&3
        fi

        if [[ -z "$input" ]]; then
            echo "Error: This field cannot be empty." >&3
        fi
    done

    export "$var_name"="$input"
}

urlencode() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

if [ "$(id -u)" -ne "0" ]; then
    echo "This script must be run as root"
    exit 1
fi

RECOVER=false
RESTORE=false
TARGET_CLEANUP_DIR=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        recover)
            RECOVER=true
            shift
            ;;
        restore)
            RESTORE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ "$RECOVER" = true ] && [ "$RESTORE" = true ]; then
    echo "Error: You cannot specify both 'recover' and 'restore'" >&2
    echo "Use 'recover' for install with environment and restore database from latest backup" >&2
    echo "Use 'restore' for install with restore database from latest backup" >&2
    exit 1
fi

if [[ -f "$APP_DIR/.env-prod" ]]; then
    echo "Error: .env-prod already exists in $APP_DIR."
    echo "This script is designed for a fresh installation and should only be run once."
    exit 1
fi

check_domain_ip() {
    local domain=$1
    if [[ -z "$domain" ]]; then
        echo "Error: Domain cannot be empty for IP verification." >&2
        exit 1
    fi

    local server_ip
    server_ip=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 https://icanhazip.com || curl -s --max-time 5 https://ifconfig.me)

    if [[ -z "$server_ip" ]]; then
        echo "Error: Could not determine server public IP. Ensure the server has internet access." >&2
        exit 1
    fi

    # Query Cloudflare DNS-over-HTTPS directly bypassing /etc/hosts without requiring dig or nslookup
    local domain_ip=""
    if command -v python3 &>/dev/null; then
        domain_ip=$(python3 -c "
import urllib.request, json
req = urllib.request.Request('https://cloudflare-dns.com/dns-query?name=$domain&type=A', headers={'Accept': 'application/dns-json'})
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode())
        answers = [a['data'] for a in data.get('Answer', []) if a.get('type') == 1]
        if answers:
            print(answers[0])
except Exception:
    pass
" 2>/dev/null)
    fi

    # Fallback using raw curl if python3 is unavailable
    if [[ -z "$domain_ip" ]] && command -v curl &>/dev/null; then
        domain_ip=$(curl -s --max-time 5 -H "Accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=${domain}&type=A" | grep -oE '"data":"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' | cut -d'"' -f4 | head -n1)
    fi

    if [[ -z "$domain_ip" ]]; then
        echo "Error: Domain '$domain' does not resolve to any public IP address. Check your DNS settings." >&2
        exit 1
    fi

    if [[ "$domain_ip" != "$server_ip" ]]; then
        echo "Error: Domain '$domain' resolves externally to $domain_ip, but this server's public IP is $server_ip." >&2
        echo "Update your DNS A record to point directly to this server before running the installation." >&2
        exit 1
    fi
}

if [ "$RECOVER" = true ]; then
    ask_var "BACKUP_TYPE" "rclone type" "ftp"
    ask_var "BACKUP_HOST" "Backup Host" ""
    ask_var "BACKUP_USER" "Backup User" ""
    ask_var "BACKUP_PASSWORD" "Backup Password" ""

    apt-get update -y
    apt_install gnupg curl zip rclone

    TARGET_CLEANUP_DIR="/tmp/install_restore_stage_$(date +%s)"
    mkdir -p "$TARGET_CLEANUP_DIR" || exit 1
    chmod 700 "$TARGET_CLEANUP_DIR"

    OBSCURED_PASS=$(rclone obscure "$BACKUP_PASSWORD" 2>/dev/null) || {
        echo "error: failed to process backup password." >&2
        exit 1
    }

    export RCLONE_CONFIG_MYREMOTE_TYPE="$BACKUP_TYPE"
    export RCLONE_CONFIG_MYREMOTE_HOST="$BACKUP_HOST"
    export RCLONE_CONFIG_MYREMOTE_USER="$BACKUP_USER"
    export RCLONE_CONFIG_MYREMOTE_PASS="$OBSCURED_PASS"

    RAW_BACKUPS=$(rclone --config /dev/null lsf "myremote:" --include "backup_*.zip" --files-only 2>/dev/null) || {
        echo "error: failed to reach remote backup storage." >&2
        exit 1
    }

    LATEST_BACKUP=$(printf '%s\n' "$RAW_BACKUPS" | sort -r | head -n 1)

    if [ -z "$LATEST_BACKUP" ]; then
        echo "error: no backups found on remote." >&2
        exit 1
    fi

    rclone --config /dev/null copy "myremote:$LATEST_BACKUP" "$TARGET_CLEANUP_DIR" -q || exit 1
    unzip -oq "$TARGET_CLEANUP_DIR/$LATEST_BACKUP" -d "$TARGET_CLEANUP_DIR" || exit 1

    if [ -f "$TARGET_CLEANUP_DIR/app.env" ]; then
        set -a
        source "$TARGET_CLEANUP_DIR/app.env"
        set +a
    else
        echo "error: app.env not found in backup archive." >&2
        exit 1
    fi
else
    ask_var "DOMAIN" "Enter Domain" ""
    ask_var "TOKEN_SECRET" "Enter Token Secret" "$(openssl rand -hex 32)"
    ask_var "REFRESH_TOKEN_SECRET" "Enter Refesh Token Secret" "$(openssl rand -hex 32)"
    ask_var "APP_ADMIN_LOGIN_EMAIL" "Admin Login Email" ""
    ask_var "APP_ADMIN_LOGIN_PASSWORD" "Admin Login Password" ""
    ask_var "APP_USER" "App Username" "dnu"
    ask_var "APP_PASSWORD" "App User Password" ""
    ask_var "MONGODB_SIZE" "MongoDB Disk Allocation" "2G"
    ask_var "MONGODB_ADMIN_USER" "Mongo Admin User" "madmin"
    ask_var "MONGODB_ADMIN_PASSWORD" "Mongo Admin Password" ""
    ask_var "MONGODB_DNUSER" "Mongo App User" "dnuser"
    ask_var "MONGODB_DNUSER_PASSWORD" "Mongo App Password" ""
    ask_var "MONGODB_BACKUP_USER" "Mongo Backup User" "mbackup"
    ask_var "MONGODB_BACKUP_PASSWORD" "Mongo Backup Password" ""
    ask_var "SEND_EMAIL_HOST" "Send Email Host" ""
    ask_var "SEND_EMAIL_PORT" "Send Email Port" "465"
    ask_var "SEND_EMAIL_NAME" "Send Email Name" ""
    ask_var "SEND_EMAIL_ADDRESS" "Send Email Address" ""
    ask_var "SEND_EMAIL_PASSWORD" "Send Email Password" ""
    ask_var "BACKUP_TYPE" "rclone type" "ftp"
    ask_var "BACKUP_HOST" "Backup Host" ""
    ask_var "BACKUP_USER" "Backup User" ""
    ask_var "BACKUP_PASSWORD" "Backup Password" ""
    ask_var "BACKUP_FREQUENCY" "Backup Frequency" "0 3 * * *"
    ask_var "BACKUP_RETENTION" "Backup Retention" "10d"
fi

PORT=3000

TOTAL_STEPS=17
CURRENT_STEP=0

# Preserve original stdout and stderr descriptors before silent redirection
exec 3>&1 4>&2

show_progress() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    local percent=$(( CURRENT_STEP * 100 / TOTAL_STEPS ))
    if (( percent > 99 )); then
        percent=99
    fi
    local filled=$((percent * 40 / 100))
    local empty=$((40 - filled))
    printf "\r\033[K\033[32m[%.*s%.*s]\033[0m %3d%%" \
      "$filled" "========================================" \
      "$empty" "                                        " \
      "$percent" >&3
}

# Redirect standard output and capture stderr to error log
exec 1>/dev/null 2>"$ERR_LOG"

show_progress
check_domain_ip "$DOMAIN"

show_progress
mkdir -p "$APP_DIR"
apt-get update -y

show_progress
apt_install gnupg curl python3 zip rclone

show_progress
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" > /etc/apt/sources.list.d/mongodb-org-8.0.list

show_progress
apt update
apt_install mongodb-org mongodb-database-tools
systemctl start mongod
systemctl enable mongod

apt_install xfsprogs
fallocate -l "$MONGODB_SIZE" /mnt/mongodb.xfs
mkfs.xfs /mnt/mongodb.xfs
mkdir -p /mnt/mongodb
mount -o loop /mnt/mongodb.xfs /mnt/mongodb
systemctl stop mongod

rm -rf /var/lib/mongodb
mkdir -p /mnt/mongodb/data
ln -s /mnt/mongodb/data /var/lib/mongodb
chown -R mongodb:mongodb /mnt/mongodb/data

FSTAB_ENTRY="/mnt/mongodb.xfs /mnt/mongodb xfs loop 0 0"
echo "$FSTAB_ENTRY" >> /etc/fstab
systemctl start mongod

show_progress
sleep 5

if systemctl is-active --quiet mongod; then
  echo "MongoDB is running."
else
  echo "MongoDB is not running."
fi

show_progress
mongosh --quiet <<EOF
use admin;
db.createUser({
user: "$MONGODB_ADMIN_USER",
pwd: "$MONGODB_ADMIN_PASSWORD",
roles: [{ role: "root", db: "admin" }]
});

db.createUser({
user: "$MONGODB_BACKUP_USER",
pwd: "$MONGODB_BACKUP_PASSWORD",
roles: [{ role: "backup", db: "admin" }]
});

db.createUser({
user: "$MONGODB_DNUSER",
pwd: "$MONGODB_DNUSER_PASSWORD",
roles: [{ role: "readWrite", db: "displaynetworks" }]
});
EOF

MONGODB_CONF="/etc/mongod.conf"
sed -i '/security:/d' "$MONGODB_CONF" 
sed -i '$a\security:\n  authorization: enabled' "$MONGODB_CONF"

systemctl restart mongod

show_progress
mkdir -p /var/www/html
chown -R www-data:www-data /var/www/html
chmod -R 755 /var/www/html

apt_install build-essential libssl-dev nginx certbot python3-certbot-nginx
show_progress

NGINX_CONFIG="/etc/nginx/sites-available/$DOMAIN"

cat <<EOF > "$NGINX_CONFIG"
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
}
EOF

ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

systemctl reload nginx

rm -rf /etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory/*
certbot register --agree-tos --non-interactive -m "$APP_ADMIN_LOGIN_EMAIL" || true
sleep 3

show_progress
certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos -m "$APP_ADMIN_LOGIN_EMAIL"

cat <<EOF > "$NGINX_CONFIG"
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    root $APP_DIR/dist/public/browser;
    index index.html;

    location ~ ^/(?![_])([a-zA-Z0-9\-]+)$ {
        add_header Last-Modified \$date_gmt;
        add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
        if_modified_since off;
        expires off;
        etag off;
        rewrite ^/([a-zA-Z0-9\-]+)$ /_view/index.html?name=\$1 break;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /_api {
        add_header Last-Modified \$date_gmt;
        add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
        if_modified_since off;
        expires off;
        etag off;
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /_ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }

    location /_view/ {
        alias $APP_DIR/dist/public/browser/_view/;
        add_header Last-Modified \$date_gmt;
        add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
        if_modified_since off;
        expires off;
        etag off;
        index index.html;
        try_files \$uri \$uri/ =404;
    }

    location = /_view {
        return 301 /_view/;
    }
}
EOF

systemctl reload nginx

show_progress
apt_install cron
systemctl enable cron --now 

apt_install fail2ban

cat <<EOF > /etc/fail2ban/jail.local
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600
[nginx-botsearch]
enabled = true
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 5
bantime = 7200
EOF

systemctl restart fail2ban

apt_install logrotate

cat <<EOF > /etc/logrotate.d/nginx
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 \$(cat /var/run/nginx.pid)
        fi
    endscript
}
EOF

show_progress
MONGODB_DNUSER_PASSWORD_ENC=$(urlencode "$MONGODB_DNUSER_PASSWORD")
MONGODB_BACKUP_PASSWORD_ENC=$(urlencode "$MONGODB_BACKUP_PASSWORD")
MONGODB_ADMIN_PASSWORD_ENC=$(urlencode "$MONGODB_ADMIN_PASSWORD")

cat <<EOF > "$APP_DIR/.env-prod"
PORT="$PORT"
DOMAIN=$DOMAIN
TOKEN_SECRET="$TOKEN_SECRET"
REFRESH_TOKEN_SECRET="$REFRESH_TOKEN_SECRET"
APP_ADMIN_LOGIN_EMAIL="$APP_ADMIN_LOGIN_EMAIL"
APP_ADMIN_LOGIN_PASSWORD="$APP_ADMIN_LOGIN_PASSWORD"
APP_USER="$APP_USER"
APP_PASSWORD="$APP_PASSWORD"
MONGODB_SIZE="$MONGODB_SIZE"
MONGODB_ADMIN_USER="$MONGODB_ADMIN_USER"
MONGODB_ADMIN_PASSWORD="$MONGODB_ADMIN_PASSWORD"
MONGODB_DNUSER="$MONGODB_DNUSER"
MONGODB_DNUSER_PASSWORD="$MONGODB_DNUSER_PASSWORD"
MONGODB_BACKUP_USER="$MONGODB_BACKUP_USER"
MONGODB_BACKUP_PASSWORD="$MONGODB_BACKUP_PASSWORD"
MONGODB_URI="mongodb://$MONGODB_DNUSER:$MONGODB_DNUSER_PASSWORD_ENC@localhost:27017/displaynetworks?authSource=admin"
MONGODB_BACKUP_URI="mongodb://$MONGODB_BACKUP_USER:$MONGODB_BACKUP_PASSWORD_ENC@localhost:27017/?authSource=admin"
MONGODB_ADMIN_URI="mongodb://$MONGODB_ADMIN_USER:$MONGODB_ADMIN_PASSWORD_ENC@localhost:27017/?authSource=admin"
SEND_EMAIL_HOST="$SEND_EMAIL_HOST"
SEND_EMAIL_PORT="$SEND_EMAIL_PORT"
SEND_EMAIL_NAME="$SEND_EMAIL_NAME"
SEND_EMAIL_ADDRESS="$SEND_EMAIL_ADDRESS"
SEND_EMAIL_PASSWORD="$SEND_EMAIL_PASSWORD"
BACKUP_TYPE="$BACKUP_TYPE"
BACKUP_HOST="$BACKUP_HOST"
BACKUP_USER="$BACKUP_USER"
BACKUP_PASSWORD="$BACKUP_PASSWORD"
BACKUP_FREQUENCY="$BACKUP_FREQUENCY"
BACKUP_RETENTION="$BACKUP_RETENTION"
EOF
chmod 600 "$APP_DIR/.env-prod"

show_progress
useradd -m -s /bin/bash "$APP_USER" || true
echo "$APP_USER:$APP_PASSWORD" | chpasswd

apt_install sudo
mkdir -p /etc/sudoers.d

SUDOERS_FILE="/etc/sudoers.d/$APP_USER"
cat <<EOF > "$SUDOERS_FILE"
$APP_USER ALL=(ALL) NOPASSWD: ALL
EOF

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

if [ "$RECOVER" = true ]; then
  chown -R "$APP_USER":"$APP_USER" "$TARGET_CLEANUP_DIR"
fi

show_progress
sudo -i -u "$APP_USER" APP_DIR="$APP_DIR" PORT="$PORT" APP_ADMIN_LOGIN_EMAIL="$APP_ADMIN_LOGIN_EMAIL" APP_ADMIN_LOGIN_PASSWORD="$APP_ADMIN_LOGIN_PASSWORD" BACKUP_FREQUENCY="$BACKUP_FREQUENCY" APP_USER="$APP_USER" bash << EOF
set -e

cd "$APP_DIR"

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/HEAD/install.sh | bash

export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
[ -s "\$NVM_DIR/bash_completion" ] && . "\$NVM_DIR/bash_completion"

LATEST_ZIP_URL=\$(curl -s https://api.github.com/repos/webitupdotbiz/displaynetworks/releases/latest | grep "browser_download_url.*displaynetworks.zip" | cut -d '"' -f 4)

wget -O app.zip "\$LATEST_ZIP_URL"
unzip -o app.zip
rm -f app.zip

nvm install
nvm use

npm ci --omit=dev

NODE_ENV=production node sys/create-admin.js --email "$APP_ADMIN_LOGIN_EMAIL" --password "$APP_ADMIN_LOGIN_PASSWORD" --role admin

cat <<EOC > pm2.config.cjs
module.exports = {
  apps: [
    {
      name: "displaynetworks",
      script: "dist/server/app.js",
      cwd: "$APP_DIR",
      env: {
        NODE_ENV: "production",
        PORT: $PORT,
      }
    }
  ]
};
EOC

npm install -g pm2

pm2 start pm2.config.cjs
pm2 save

sudo env PATH="\$PATH:\$NVM_BIN" "\$NVM_BIN/pm2" startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

NEW_JOB="$BACKUP_FREQUENCY /bin/bash $APP_DIR/sys/backup.sh"
(crontab -l 2>/dev/null | grep -v "sys/backup.sh" || true; echo "\$NEW_JOB") | crontab -

EOF

rm -f "$SUDOERS_FILE"
SUDOERS_FILE=""

show_progress
chmod -R o+r "$APP_DIR/dist/public/browser"
chgrp -R www-data "$APP_DIR/dist/public/browser"

ln -sf $APP_DIR/sys/backup.sh /usr/local/bin/dnbackup
ln -sf $APP_DIR/sys/restore.sh /usr/local/bin/dnrestore
ln -sf $APP_DIR/sys/update.sh /usr/local/bin/dnupdate

show_progress
apt_install unattended-upgrades apt-listchanges apt-config-auto-update
dpkg-reconfigure --frontend noninteractive unattended-upgrades

DISTRO_CODENAME=$(source /etc/os-release && echo "$VERSION_CODENAME")
cat <<EOF > /etc/apt/apt.conf.d/50unattended-upgrades
Unattended-Upgrade::Origins-Pattern {
    "origin=Debian,codename=$DISTRO_CODENAME,label=Debian";
    "o=Debian,n=$DISTRO_CODENAME,l=Debian-Security";
};

Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

cat <<EOF > /etc/apt/apt.conf.d/20auto-upgrades
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

show_progress
RESTORE_ERROR=""
if [ "$RESTORE" = true ] || [ "$RECOVER" = true ]; then
    RESTORE_SCRIPT="$APP_DIR/sys/restore.sh"
    RESTORE_ERROR=""

    if [ -f "$RESTORE_SCRIPT" ]; then
        if [ "$RECOVER" = true ]; then
            "$RESTORE_SCRIPT" -file "$TARGET_CLEANUP_DIR/database.gz" || RESTORE_ERROR="Warning: Data restoration script encountered an error."
        else
            "$RESTORE_SCRIPT" -latest || RESTORE_ERROR="Warning: Data restoration script encountered an error."
        fi
    else
        RESTORE_ERROR="Error: Restore script not found at $RESTORE_SCRIPT"
    fi
fi

rm -f "$ERR_LOG"
printf "\r\033[K\033[32m[========================================]\033[0m 100%%\n\n" >&3

# Restore standard outputs for final display
exec 1>&3 2>&4

[[ -n "$RESTORE_ERROR" ]] && echo "$RESTORE_ERROR" >&2

echo "[----------------------------------------]"
echo "    Display Networks Server is Ready"
echo "[----------------------------------------]"
echo ""
echo "    Log in at https://$DOMAIN"
echo ""
echo "[----------------------------------------]"

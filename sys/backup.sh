#!/bin/bash

SCRIPT_OWNER=$(stat -c '%U' "$0")
if [ "$EUID" -eq 0 ]; then
    exec sudo -u "$SCRIPT_OWNER" "/var/www/displaynetworks/sys/backup.sh" "$@"
fi

APP_DIR="/var/www/displaynetworks"
LOG_FILE="$APP_DIR/dn.log"
ENV_FILE="$APP_DIR/.env-prod"

mkdir -p "$APP_DIR"

exec > >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') Config file $ENV_FILE not found."
    exec 1>&- 2>&-
    wait 
    exit 1
fi

if [[ -z "$BACKUP_TYPE" || -z "$BACKUP_HOST" || -z "$BACKUP_USER" || -z "$BACKUP_PASSWORD" || -z "$MONGODB_BACKUP_URI" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Backup environment variables are not defined"
    exec 1>&- 2>&-
    wait 
    exit 1
fi

notify_failure() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') Backup failed. Sending notification..."
    NODE_BIN=$(which node || echo "/usr/bin/node")
    $NODE_BIN /var/www/displaynetworks/sys/notify.js "$APP_ADMIN_LOGIN_EMAIL" "Backup Failed" "Display Networks server backup failed at $(date)"
    exec 1>&- 2>&-
    wait
}

set -e
trap 'notify_failure' ERR

export RCLONE_CONFIG_MYREMOTE_TYPE="$BACKUP_TYPE"
export RCLONE_CONFIG_MYREMOTE_HOST="$BACKUP_HOST"
export RCLONE_CONFIG_MYREMOTE_USER="$BACKUP_USER"
export RCLONE_CONFIG_MYREMOTE_PASS=$(rclone obscure "$BACKUP_PASSWORD")

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
TMP_DIR="/tmp/backup_stage_$TIMESTAMP"
FINAL_ZIP="/tmp/backup_$TIMESTAMP.zip"

mkdir -p "$TMP_DIR"
chmod 700 "$TMP_DIR"

# Dump application database
mongodump --uri="$MONGODB_BACKUP_URI" --db=displaynetworks --archive="$TMP_DIR/database.gz" --gzip --quiet

# Dump authentication users and custom roles for disaster recovery.
mongodump --uri="$MONGODB_BACKUP_URI" --db=admin --dumpDbUsersAndRoles --archive="$TMP_DIR/users.gz" --gzip --quiet

cp "$ENV_FILE" "$TMP_DIR/app.env"
zip -rj "$FINAL_ZIP" "$TMP_DIR" > /dev/null

rclone copy "$FINAL_ZIP" myremote:/ -q
rclone delete myremote:/ --min-age 10d -q

rm -rf "$TMP_DIR" "$FINAL_ZIP"
echo "$(date '+%Y-%m-%d %H:%M:%S') [Success] Backup created and uploaded: $(basename "$FINAL_ZIP")"

# close standard output and standard error
exec 1>&-
exec 2>&-

wait

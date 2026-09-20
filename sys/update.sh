#!/bin/bash

APP_DIR="/var/www/displaynetworks"

# Enforce script owner context
SCRIPT_OWNER=$(stat -c '%U' "$0")
if [ "$EUID" -eq 0 ]; then
    # Keep using -i to drop down from root safely
    exec sudo -i -u "$SCRIPT_OWNER" "$APP_DIR/sys/update.sh" "$@"
fi

LOG_FILE="$APP_DIR/dn.log"
ENV_FILE="$APP_DIR/.env-prod"

# Ensure directory exists
mkdir -p "$APP_DIR"

# Global logging setup
exec > >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

# Dynamically populated tracking array
TRACKED_VARS=()

# Load existing environment variables safely
if [ -f "$ENV_FILE" ]; then
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        
        export "$key"="$value"
        TRACKED_VARS+=("$key")
    done < "$ENV_FILE"
fi

# Save original values for comparison
for var in "${TRACKED_VARS[@]}"; do
    declare "OLD_$var=${!var}"
done

# Interactive query function
ask_var() {
    local var_name=$1
    local prompt_text=$2
    local fallback=$3
    local current="${!var_name:-$fallback}"
    local input=""
    
    read -p "$prompt_text [$current]: " input < /dev/tty > /dev/tty 2>&1
    export "$var_name"="${input:-$current}"
}

# Print UI instructions to screen only
{
    echo "--- Display Networks: Change Application Parameters ---"
    echo "Press [ENTER] to keep the current value shown in brackets."
    echo ""
} > /dev/tty

# User Prompts 
ask_var "TOKEN_SECRET" "Token Secret" "$(openssl rand -hex 32)"
ask_var "REFRESH_TOKEN_SECRET" "Enter Refesh Token Secret" "$(openssl rand -hex 32)"
ask_var "SEND_EMAIL_HOST" "Send Email Host" ""
ask_var "SEND_EMAIL_PORT" "Send Email Port" "465"
ask_var "SEND_EMAIL_NAME" "Send Email Name" ""
ask_var "SEND_EMAIL_ADDRESS" "Send Email Address" ""
ask_var "SEND_EMAIL_PASSWORD" "Send Email Password" ""
ask_var "BACKUP_TYPE" "rclone type" "ftp"
ask_var "BACKUP_HOST" "Backup Host" ""
ask_var "BACKUP_USER" "Backup User" ""
ask_var "BACKUP_PASSWORD" "Backup Password" ""

# Identify changed parameters
CHANGED_PARAMS=()
for var in "${TRACKED_VARS[@]}"; do
    old_val_name="OLD_$var"
    if [ "${!var}" != "${!old_val_name}" ]; then
        CHANGED_PARAMS+=("$var")
    fi
done

# Dynamic File Output Writer 
true > "$ENV_FILE" 
for var in "${TRACKED_VARS[@]}"; do
    echo "$var=\"${!var}\"" >> "$ENV_FILE"
done

chmod 600 "$ENV_FILE"

# Process reload and conditional logging
if [ ${#CHANGED_PARAMS[@]} -ne 0 ]; then
    echo "Applying changes..." > /dev/tty
    
    # Explicitly discover and load NVM environment into this script context
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
        # Match the Node environment your app dependencies expect
        cd "$APP_DIR" && nvm use >/dev/null 2>&1 || true
    fi

    # Try finding pm2 now that NVM has been forced into context
    PM2_CMD=$(command -v pm2 || which pm2)
    
    if [ -n "$PM2_CMD" ]; then
        $PM2_CMD reload all --update-env > /dev/tty 2>&1
    else
        echo "Error: pm2 command could not be located even after loading NVM environment." > /dev/tty
        echo "$(date '+%Y-%m-%d %H:%M:%S') [Error] PM2 execution skipped. Command missing from path." >&2
    fi

    IFS=", " ; CHANGED_STRING="${CHANGED_PARAMS[*]}" ; unset IFS
    echo "$(date '+%Y-%m-%d %H:%M:%S') [Success] params [$CHANGED_STRING] were changed"
    echo "$(date '+%Y-%m-%d %H:%M:%S') Application parameters updated"
else
    {
        echo ""
        echo "Nothing changed so no update was performed"
    } > /dev/tty
fi

# Close logging streams safely
exec 1>&-
exec 2>&-
wait
#!/bin/bash

# define application directory and environment file
APP_DIR="/var/www/displaynetworks"
ENV_FILE="$APP_DIR/.env-prod"

# dynamically find the app user based on ownership of the app directory
APP_USER=$(stat -c '%U' "$APP_DIR")

# if run as root, automatically re-run as the app user
if [ "$EUID" -eq 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') switching execution context to user: $APP_USER"
    exec sudo -u "$APP_USER" "$0" "$@"
fi

# source existing env
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') error: config file $ENV_FILE not found."
    exit 1
fi

# parse command line arguments
LATEST_FLAG=false
FILE_PATH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -latest)
            LATEST_FLAG=true
            shift
            ;;
        -file)
            if [[ -n "$2" && "$2" != -* ]]; then
                FILE_PATH="$2"
                shift 2
            else
                echo "error: -file requires a file path argument."
                exit 1
            fi
            ;;
        *)
            echo "error: unknown argument $1"
            echo "usage: $0 [-latest] [-file /path/to/database.gz]"
            exit 1
            ;;
    esac
done

# check for mutually exclusive flags
if [ "$LATEST_FLAG" = true ] && [ -n "$FILE_PATH" ]; then
    echo "error: cannot specify both -latest and -file flags together."
    exit 1
fi

# verify local file exists immediately if specified
if [ -n "$FILE_PATH" ] && [ ! -f "$FILE_PATH" ]; then
    echo "error: specified file '$FILE_PATH' does not exist."
    exit 1
fi

# setup logging
LOG_FILE="$APP_DIR/dn.log"
touch "$LOG_FILE"

# send all stdout and stderr to screen and log file
exec > >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

# validate required variables
REQUIRED_VARS=("BACKUP_TYPE" "BACKUP_HOST" "BACKUP_USER" "BACKUP_PASSWORD" "MONGODB_ADMIN_URI")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') error: missing $var in $ENV_FILE."
        exec 1>&- 2>&-
        wait
        exit 1
    fi
done

# unified path and staging resolution
TARGET_CLEANUP_DIR=""
FINAL_RESTORE_TARGET=""

if [ -n "$FILE_PATH" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') using installer-provided file: $FILE_PATH"
    
    # get the absolute folder path containing the -file target
    TARGET_CLEANUP_DIR=$(dirname "$(realpath "$FILE_PATH")")
    FINAL_RESTORE_TARGET="$FILE_PATH"
else
    # fallback to standard remote staging folder if no local file is given
    TARGET_CLEANUP_DIR="/tmp/restore_stage_$(date +%s)"
    mkdir -p "$TARGET_CLEANUP_DIR"
    chmod 700 "$TARGET_CLEANUP_DIR"
    
    FINAL_RESTORE_TARGET="$TARGET_CLEANUP_DIR/database.gz"
fi

# universal cleanup trap
cleanup() {
    if [ -d "$TARGET_CLEANUP_DIR" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') cleaning up staging directory: $TARGET_CLEANUP_DIR"
        rm -rf "$TARGET_CLEANUP_DIR"
    fi
}
trap cleanup EXIT

# remote backup logic
if [ -z "$FILE_PATH" ]; then

    # interactive menu renders exclusively to the screen
    choose_from_menu() {
        local prompt="$1"; shift
        local initial_cursor="$1"; [[ "$initial_cursor" =~ ^[0-9]+$ ]] && shift || initial_cursor=0
        local choices=("$@")
        local cursor=$initial_cursor
        
        [ $cursor -ge ${#choices[@]} ] && cursor=$(( ${#choices[@]} - 1 ))
        [ $cursor -lt 0 ] && cursor=0

        while true; do
            {
                clear
                echo "$prompt"
                echo "------------------------------------------"
                for i in "${!choices[@]}"; do
                    [ "$i" -eq "$cursor" ] && echo " > [ ${choices[$i]} ]" || echo "   ${choices[$i]}"
                done
                echo "------------------------------------------"
                echo "(up down arrows to move, enter to select, ctrl c to exit)"
            } > /dev/tty

            read -rsn3 key < /dev/tty
            
            case "$key" in
                $'\x1b[A') ((cursor--)); [ $cursor -lt 0 ] && cursor=$(( ${#choices[@]} - 1 )) ;;
                $'\x1b[B') ((cursor++)); [ $cursor -ge ${#choices[@]} ] && cursor=0 ;;
                "") echo "$cursor"; return ;; 
            esac
        done
    }

    # download and test archive
    check_backup() {
        local backup_file="$1"
        echo "$(date '+%Y-%m-%d %H:%M:%S') downloading and testing $backup_file..."
        rm -f "$TARGET_CLEANUP_DIR"/*.zip
        
        rclone --config /dev/null copy "myremote:$backup_file" "$TARGET_CLEANUP_DIR" -q
        if unzip -t "$TARGET_CLEANUP_DIR/$backup_file" > /dev/null; then
            return 0 
        else
            echo "$(date '+%Y-%m-%d %H:%M:%S') error: $backup_file failed integrity check"
            return 1 
        fi
    }

    export RCLONE_CONFIG_MYREMOTE_TYPE="$BACKUP_TYPE"
    export RCLONE_CONFIG_MYREMOTE_HOST="$BACKUP_HOST"
    export RCLONE_CONFIG_MYREMOTE_USER="$BACKUP_USER"
    export RCLONE_CONFIG_MYREMOTE_PASS=$(rclone obscure "$BACKUP_PASSWORD")

    # fetch backups
    echo "$(date '+%Y-%m-%d %H:%M:%S') fetching available backups..."
    mapfile -t BACKUPS < <(rclone --config /dev/null lsf "myremote:" --include "backup_*.zip" --files-only | sort -r | head -n 10)

    if [ ${#BACKUPS[@]} -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') error: no backups found on remote."
        exec 1>&- 2>&-
        wait
        exit 1
    fi

    if [ "$LATEST_FLAG" = true ]; then
        START_INDEX=0
    else
        START_INDEX=$(choose_from_menu "select a backup to restore:" 0 "${BACKUPS[@]}")
    fi

    # restore loop
    SELECTED_BACKUP=""
    i=$START_INDEX

    while [ $i -lt ${#BACKUPS[@]} ]; do
        CURRENT_TRY=${BACKUPS[$i]}
        
        if check_backup "$CURRENT_TRY"; then
            SELECTED_BACKUP="$CURRENT_TRY"
            break
        fi
        
        echo "$(date '+%Y-%m-%d %H:%M:%S') error: $CURRENT_TRY failed."

        # prompt goes directly to screen to bypass log file
        echo -n "would you like to show the list again to select another backup? (y/n): " > /dev/tty
        read -r TRY_AGAIN < /dev/tty
        if [[ "$TRY_AGAIN" == "y" || "$TRY_AGAIN" == "Y" ]]; then
            NEXT_CURSOR=$((i + 1))
            [ $NEXT_CURSOR -ge ${#BACKUPS[@]} ] && NEXT_CURSOR=$i
            i=$(choose_from_menu "select a backup to restore:" "$NEXT_CURSOR" "${BACKUPS[@]}")
            continue
        else
            exec 1>&- 2>&-
            wait
            exit 1
        fi
    done

    # extract remote backup
    echo "$(date '+%Y-%m-%d %H:%M:%S') proceeding with extraction of $SELECTED_BACKUP..."
    unzip -j "$TARGET_CLEANUP_DIR/$SELECTED_BACKUP" -d "$TARGET_CLEANUP_DIR" > /dev/null
fi

# execution database restore
if [ -f "$FINAL_RESTORE_TARGET" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') restoring database from $FINAL_RESTORE_TARGET..."
    mongorestore --uri="$MONGODB_ADMIN_URI" \
                 --archive="$FINAL_RESTORE_TARGET" \
                 --nsInclude="displaynetworks.*" \
                 --gzip --drop --quiet
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') error: database archive not found at $FINAL_RESTORE_TARGET"
    exec 1>&- 2>&-
    wait
    exit 1
fi

# execution system users restore
USERS_RESTORE_TARGET="$TARGET_CLEANUP_DIR/users.gz"
if [ -f "$USERS_RESTORE_TARGET" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') restoring authentication users from $USERS_RESTORE_TARGET..."
    mongorestore --uri="$MONGODB_ADMIN_URI" \
                 --archive="$USERS_RESTORE_TARGET" \
                 --restoreDbUsersAndRoles \
                 --gzip --quiet
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') warning: users archive not found at $USERS_RESTORE_TARGET. skipping user restore."
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [Success] restore complete."

# close logging streams cleanly
exec 1>&-
exec 2>&-
wait

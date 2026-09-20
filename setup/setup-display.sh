#!/bin/bash
set -euo pipefail

TOTAL_STEPS=9
CURRENT_STEP=0
ERR_LOG="/tmp/dn_kiosk_install_err.log"

ask_var() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="${3:-}"
    
    if [[ -n "${!var_name:-}" ]]; then
        return 0
    fi

    local input=""
    while [[ -z "$input" ]]; do
        if [[ -n "$default_value" ]]; then
            read -r -p "$prompt_text [$default_value]: " input
            input="${input:-$default_value}"
        else
            read -r -p "$prompt_text (Required): " input
        fi

        if [[ -z "$input" ]]; then
            echo "Error: This field cannot be empty." >&2
        fi
    done

    export "$var_name"="$input"
}

# Retry helper for APT operations
apt_install() {
    local retries=3
    local count=0
    local delay=5

    until apt-get install "${APT_FLAGS[@]}" "$@"; do
        count=$((count + 1))
        if (( count >= retries )); then
            echo "Failed to install packages after $retries attempts: $*" >&2
            return 1
        fi
        echo "APT install failed. Retrying in ${delay}s ($count/$retries)..." >&2
        sleep "$delay"
        apt-get update || true
    done
}

# Duplicate stdout and stderr descriptors before redirecting
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

trap 'BROWSER_URL
  exit_code=$?
  exec 1>&3 2>&4
  printf "\n\n\033[31mError on line %d (Exit Code %d): %s\033[0m\n" "$LINENO" "$exit_code" "$BASH_COMMAND"
  if [[ -s "$ERR_LOG" ]]; then
    printf "\033[33m--- Error Details ---\033[0m\n"
    cat "$ERR_LOG"
  fi
  rm -f "$ERR_LOG"
' ERR

if [ "$(id -u)" -ne "0" ]; then
    echo "This script must be run as root" >&2
    exit 1
fi

ask_var "APP_USER" "Enter application username" ""
ask_var "BROWSER_URL" "Enter Kiosk target URL" "https://displaynet.works"
ask_var "ROTATION" "Enter display rotation (normal, left, right, inverted)" "normal"

echo "" >&3
exec 1>/dev/null 2>"$ERR_LOG"

show_progress
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
fi

DNWHOME="/usr/share/displaynetworks"
DIRECTORY="/tmp/displaynetworks-install"
ARCHITECTURE="$(dpkg --print-architecture)"

mkdir -p "$DIRECTORY"
cd "$DIRECTORY"

show_progress
if [[ -f /etc/apt/sources.list.d/debian.sources ]]; then
    sed -i 's/Components: main.*/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources
fi
if [[ -f /etc/apt/sources.list ]]; then
    sed -i 's/\bmain\b/main contrib non-free non-free-firmware/g' /etc/apt/sources.list
fi

APT_FLAGS=(
    -y
    -o Acquire::Retries=3
    -o Dpkg::Options::="--force-confdef"
    -o Dpkg::Options::="--force-confold"
)

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt_install pciutils

show_progress
PKGS=(
    xorg
    lightdm
    ca-certificates
    apt-listchanges
    unclutter
    firmware-linux-free
    firmware-misc-nonfree
)

if [[ "$ARCHITECTURE" == "armhf" ]]; then
    PKGS+=(chromium-browser)
else
    PKGS+=(chromium)
fi

PCI_DEVICES="$(lspci -nn || true)"

if echo "$PCI_DEVICES" | grep -Eiq 'AMD|ATI|Radeon'; then
    PKGS+=(
        firmware-amd-graphics
        xserver-xorg-video-ati
        xserver-xorg-video-radeon
        xserver-xorg-video-amdgpu
        libgl1-mesa-dri
    )
fi

if echo "$PCI_DEVICES" | grep -Eiq 'Intel'; then
    PKGS+=(
        firmware-intel-misc
        intel-media-va-driver
        xserver-xorg-video-intel
        libgl1-mesa-dri
    )
fi

if echo "$PCI_DEVICES" | grep -Eiq 'NVIDIA|Nouveau'; then
    PKGS+=(
        xserver-xorg-video-nouveau
    )
fi

show_progress
apt_install "${PKGS[@]}"

if [[ "$ARCHITECTURE" != "armhf" ]]; then
    ln -sf /usr/bin/chromium /usr/bin/chromium-browser
fi

update-initramfs -u
systemctl set-default graphical.target

show_progress
apt_install unattended-upgrades apt-listchanges apt-config-auto-update
dpkg-reconfigure --frontend noninteractive unattended-upgrades

show_progress
mkdir -p /etc/lightdm/lightdm.conf.d
cat << EOF > /etc/lightdm/lightdm.conf.d/50-kiosk.conf
[Seat:*]
autologin-user=$APP_USER
xserver-command=X -s 0 -dpms -nocursor
user-session=displaynetworks-kiosk
EOF

ETC_NETWORK_INTERFACES="/etc/network/interfaces"
if [[ -f "$ETC_NETWORK_INTERFACES" ]]; then
    sed -i 's/allow-hotplug/auto/g' "$ETC_NETWORK_INTERFACES"
fi

show_progress
cat << 'EOF' > /usr/share/xsessions/displaynetworks-kiosk.desktop
[Desktop Entry]
Name=Display Networks Kiosk
Comment=Direct Chromium Kiosk without Window Manager
Exec=/usr/local/bin/displaynetworks-kiosk.sh
Type=Application
EOF

cat << EOF > /usr/local/bin/displaynetworks-kiosk.sh
#!/bin/bash
set -euo pipefail

CONFIGFILE="/usr/share/displaynetworks/config.properties"

if [[ "\$(id -u)" -eq 0 ]]; then
    echo "Error: This script cannot be run as root." >&2
    exit 1
fi

until xset q &>/dev/null; do
    sleep 0.5
done

xset s off
xset s noblank
xset -dpms

if [[ -f "\$CONFIGFILE" ]]; then
    # shellcheck source=/dev/null
    . "\$CONFIGFILE"
    if [[ "\${rotate:-}" =~ ^(left|right|inverted)$ ]]; then
        xrandr -o "\$rotate"
    fi
fi

unclutter -idle 0.1 -root &

rm -rf "/home/$APP_USER/.config/chromium/Default/Cache"

while true; do

    until (echo > /dev/tcp/1.1.1.1/53) &>/dev/null; do
        sleep 1
    done

    CANVAS_RES=\$(xrandr | grep -w connected | grep -oE '[0-9]+x[0-9]+' | head -n1 || echo "1920x1080")
    CANVAS_W=\${CANVAS_RES%x*}
    CANVAS_H=\${CANVAS_RES#*x}

    /usr/bin/chromium-browser \\
        --kiosk \\
        --disable-session-crashed-bubble \\
        --incognito \\
        --overscroll-history-navigation=0 \\
        --disable-pinch \\
        --no-first-run \\
        --disable-translate \\
        --disable-infobars \\
        --disable-suggestions-service \\
        --disable-save-password-bubble \\
        --autoplay-policy=no-user-gesture-required \\
        --simulate-outdated-no-au='Tue, 31 Dec 2099 23:59:59 GMT' \\
        --noerrdialogs \\
        --window-position=0,0 \\
        --window-size="\${CANVAS_W},\${CANVAS_H}" \\
        --app="\${url:-$BROWSER_URL}"
        
    sleep 1
done
EOF

chmod +x /usr/local/bin/displaynetworks-kiosk.sh

show_progress

mkdir -p "$DNWHOME"
rm -f "$DNWHOME/config.properties"

echo "url=$BROWSER_URL" | sed 's/:/\\:/g' >> "$DNWHOME/config.properties"

if [[ "$ROTATION" =~ ^(left|right|inverted)$ ]]; then
    echo "rotate=$ROTATION" >> "$DNWHOME/config.properties"
fi

show_progress
cd /tmp
rm -rf "$DIRECTORY"
rm -f "$ERR_LOG"

printf "\n\r\033[K\033[32m[========================================]\033[0m 100%%\n\n" >&3

exec 1>&3 2>&4

echo "Configuration completed. Rebooting system..."
reboot

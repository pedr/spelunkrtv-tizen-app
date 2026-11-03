#!/usr/bin/env bash
# Close the app on the TV, start it in debug mode, and print the inspector port.
set -euo pipefail
TV=${TV_IP:?set TV_IP to the LAN IP of the TV}
APP=${APP:-SpelunkrTV.Spelunkr}
cd "$(dirname "$0")"
curl -sS -m 8 -X DELETE "http://$TV:8001/api/v2/applications/$APP" >/dev/null || true
sleep 3
python3 -I -u sdbc.py "$TV" shell "0 debug $APP" | grep -a -oE "port: [0-9]+" | grep -a -oE "[0-9]+"

#!/usr/bin/env bash
# Brings back whatever part of the Ensemble Node website is down. Cron runs the copy in
# ~/ensemble-node-host/bin every 15 minutes (offset from Ensemble's watchdog) and once after boot:
#   1. The tunnel: `docker compose up -d` starts its container when it stopped.
#   2. The website and the autodeploy timer: started when they are not active.
#   3. Loopback /health: when it does not answer for a minute, the website restarts.
#   4. NODE_WEB_PUBLIC_URL/health: when loopback answers, the internet is reachable and the public
#      URL still fails, the tunnel container restarts.
# It waits for a running deploy to finish first. Log: ~/ensemble-node-host/logs/watchdog.log.
set -uo pipefail

DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$DIR/lib.sh"

refuse_root
host_path
user_bus
mkdir -p "$NODE_HOST_DIR/logs"
LOG="$NODE_HOST_DIR/logs/watchdog.log"
log() { printf '%s %s\n' "$(date -Is)" "$*" >>"$LOG"; }

exec 9>"$LOCK_FILE"
if ! flock -w 900 9; then
  log "a deploy held the lock for 15 minutes; skipped this check"
  exit 0
fi
if ! load_host_env >>"$LOG" 2>&1; then
  log "could not load $HOST_ENV_FILE"
  exit 1
fi
[ "${1:-}" = "--boot" ] && log "boot check"
if [ -z "$(current_release)" ]; then
  log "nothing is deployed yet ($CURRENT is missing); run setup.sh"
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  log "docker is not reachable; the tunnel cannot be checked (sudo systemctl start docker)"
elif ! host_compose up -d >>"$LOG" 2>&1; then
  log "docker compose up failed"
fi

for unit in "$WEB_UNIT" "$TIMER_UNIT"; do
  if ! systemctl --user is-active --quiet "$unit"; then
    log "$unit was $(systemctl --user is-active "$unit" 2>/dev/null); starting it"
    systemctl --user start "$unit" >>"$LOG" 2>&1 || log "could not start $unit"
  fi
done

answers() { curl -fsS -o /dev/null --max-time 5 "$(local_url)/health" 2>/dev/null; }
up=false
for _ in $(seq 1 12); do
  if answers; then up=true; break; fi
  sleep 5
done
if ! $up; then
  log "/health did not answer for a minute; restarting the website"
  systemctl --user restart "$WEB_UNIT" >>"$LOG" 2>&1
  if wait_for_commit "$(deployed_commit)" 120 >>"$LOG" 2>&1; then
    log "answering after the restart"
    up=true
  else
    log "still not answering after the restart: journalctl --user -u $WEB_UNIT"
  fi
fi

public="${NODE_WEB_PUBLIC_URL%/}/health"
if $up && ! curl -fsS -o /dev/null --max-time 15 "$public" 2>/dev/null; then
  if curl -fsS -o /dev/null --max-time 10 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null; then
    log "$public failed while loopback answers; restarting the tunnel"
    docker restart "$TUNNEL_CONTAINER" >>"$LOG" 2>&1 || log "could not restart the tunnel"
  else
    log "the internet is not reachable from this machine"
  fi
fi

if [ "$(wc -l <"$LOG")" -gt 5000 ]; then
  tail -n 2000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exit 0

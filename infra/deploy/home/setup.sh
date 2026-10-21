#!/usr/bin/env bash
# First install of the Ensemble Node website on the home server that runs Ensemble's API, as that
# machine's own user (no root):
#   ~/ensemble-node-host/repo   clone of ENSEMBLE_NODE_DEPLOY_BRANCH; cloned when missing
#   the website                 `next start` on 127.0.0.1:NODE_WEB_PORT, a systemd user unit
#   the tunnel                  a Docker container (compose.yml) for NODE_WEB_PUBLIC_URL's host
#   autodeploy                  a user timer, every minute (autodeploy.sh)
#   watchdog.sh                 cron, every 15 minutes and once after boot
# The machine needs no open port, router rule or fixed IP: the tunnel dials out.
#
# Before running:
#   1. Docker usable without sudo, and `loginctl show-user "$USER" -p Linger` says yes
#      (sudo loginctl enable-linger "$USER"). A machine that runs Ensemble's API has both.
#   2. ~/ensemble-node-host/node-web.env, mode 0600, from node-web.env.example in this folder.
#   3. The website's own Cloudflare tunnel. Ensemble's setup.sh rewrites the API tunnel's config
#      (every host to the API's port), so the two never share one:
#        cloudflared tunnel create ensemble-node
#        cp ~/.cloudflared/<tunnel id>.json ~/ensemble-node-host/cloudflared/
#        cloudflared tunnel route dns ensemble-node <the website's host>
#      and ENSEMBLE_NODE_TUNNEL_ID=<tunnel id> in the env file.
#
#   bash infra/deploy/home/setup.sh     (safe to run again)
set -euo pipefail

main() {
  local dir
  dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  # shellcheck source=lib.sh
  . "$dir/lib.sh"
  refuse_root
  host_path
  user_bus

  local tool
  for tool in docker git curl python3 flock crontab systemctl tar sha256sum; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "$tool is not installed or not on PATH." >&2
      exit 1
    fi
  done
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not usable by $(id -un). Add the user to the docker group and log in again." >&2
    exit 1
  fi
  if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != "yes" ]; then
    echo "Lingering is off, so the user units would not start at boot: sudo loginctl enable-linger $(id -un)" >&2
    exit 1
  fi

  mkdir -p "$NODE_HOST_DIR"/{releases,state,logs,cloudflared,bin}
  chmod 0700 "$NODE_HOST_DIR" "$NODE_HOST_DIR/cloudflared"
  if [ ! -f "$HOST_ENV_FILE" ]; then
    echo "Create $HOST_ENV_FILE from infra/deploy/home/node-web.env.example first." >&2
    exit 1
  fi
  chmod 0600 "$HOST_ENV_FILE"
  load_host_env
  if [ ! -f "$NODE_HOST_DIR/cloudflared/$ENSEMBLE_NODE_TUNNEL_ID.json" ]; then
    echo "Copy the tunnel's $ENSEMBLE_NODE_TUNNEL_ID.json into $NODE_HOST_DIR/cloudflared/." >&2
    exit 1
  fi
  chmod 0600 "$NODE_HOST_DIR/cloudflared/$ENSEMBLE_NODE_TUNNEL_ID.json"

  local branch
  branch="$(deploy_branch)"
  if [ ! -d "$REPO/.git" ]; then
    git clone --quiet --branch "$branch" "${ENSEMBLE_NODE_REPO_URL:-https://github.com/ensemblework/ensemble-node.git}" "$REPO"
  fi

  bash "$REPO/infra/deploy/home/update.sh"
  install_crontab
  echo "Installed. Cron runs $NODE_HOST_DIR/bin/watchdog.sh every 15 minutes and after boot."
  echo "Check: curl -s ${NODE_WEB_PUBLIC_URL%/}/health"
}

main "$@"
exit

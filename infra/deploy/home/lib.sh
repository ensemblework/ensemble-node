# Shared by the scripts in this folder: the Ensemble Node website on the home server that also runs
# Ensemble's API (ensemblework/ensemble, infra/deploy/home). Run as that machine's own user: no
# root, nothing under /opt or /etc, and nothing shared with ~/ensemble-host except Docker.
# Everything lives in ~/ensemble-node-host:
#   repo/                  clone of this repository; fetched every minute, fast-forwarded per deploy
#   releases/<commit>-<key>/  one build per commit and build settings (git archive, install, build)
#   current                symlink to the release being served; update.sh switches it atomically
#   node-web.env           settings, mode 0600, from node-web.env.example (no secrets in it today)
#   node/                  Node 22 and pnpm for the website, apart from Ensemble's and any dev Node
#   cloudflared/           config.yml (written by update.sh) and the tunnel's <id>.json credentials
#   bin/                   the served release's scripts and compose.yml, which the timer and cron run
#   state/                 autodeploy.failed
#   logs/                  watchdog.log
# These functions never print env values.
# shellcheck shell=bash

NODE_HOST_DIR="${ENSEMBLE_NODE_HOST_DIR:-$HOME/ensemble-node-host}"
REPO="$NODE_HOST_DIR/repo"
RELEASES="$NODE_HOST_DIR/releases"
CURRENT="$NODE_HOST_DIR/current"
HOST_ENV_FILE="${ENSEMBLE_NODE_ENV_FILE:-$NODE_HOST_DIR/node-web.env}"
WEB_UNIT=ensemble-node-web.service
TIMER_UNIT=ensemble-node-autodeploy.timer
# shellcheck disable=SC2034 # used by update.sh and watchdog.sh
TUNNEL_CONTAINER=ensemble-node-cloudflared
# cloudflared's metrics and /ready. The Docker image would otherwise listen on every interface.
TUNNEL_METRICS=127.0.0.1:20251
NODE_MAJOR=22
# The served release and the newest others, for a quick manual switch back.
KEEP_RELEASES=3

refuse_root() {
  if [ "$(id -u)" -eq 0 ]; then
    echo "Run this as the user that owns ~/ensemble-node-host, not as root." >&2
    exit 1
  fi
}

host_path() {
  export PATH="$NODE_HOST_DIR/node/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
}

# systemctl --user from cron, timers and shells outside a login session.
user_bus() {
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
  # Held by autodeploy.sh, update.sh and watchdog.sh. Ensemble's API scripts hold their own lock.
  export LOCK_FILE="$XDG_RUNTIME_DIR/ensemble-node-deploy.lock"
}

# KEY=VALUE lines, # comments, optional quotes. Same rules as Ensemble's infra/deploy/lib.sh.
load_env_file() {
  local file="$1"
  local line trimmed key value
  if [ ! -f "$file" ]; then
    echo "Env file not found: $file" >&2
    echo "Copy infra/deploy/home/node-web.env.example there (mode 0600) and fill it in." >&2
    return 1
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    trimmed="${line#"${line%%[![:space:]]*}"}"
    case "$trimmed" in
      '' | \#*) continue ;;
    esac
    trimmed="${trimmed#export }"
    key="${trimmed%%=*}"
    if [ "$key" = "$trimmed" ]; then
      echo "Ignoring an env line that is not KEY=VALUE. The line was not printed." >&2
      continue
    fi
    case "$key" in
      [A-Za-z_][A-Za-z0-9_]*) ;;
      *)
        echo "Ignoring an env name that is not an identifier. The line was not printed." >&2
        continue
        ;;
    esac
    value="${trimmed#*=}"
    if [ "${value#\"}" != "$value" ] && [ "${value%\"}" != "$value" ]; then
      value="${value#\"}"
      value="${value%\"}"
    elif [ "${value#\'}" != "$value" ] && [ "${value%\'}" != "$value" ]; then
      value="${value#\'}"
      value="${value%\'}"
    fi
    printf -v "$key" '%s' "$value"
    # The name is the file's key, not the literal "key".
    export "${key?}"
  done <"$file"
}

# Loads and checks the env file, and exports what compose.yml reads.
load_host_env() {
  load_env_file "$HOST_ENV_FILE" || return 1
  local name
  for name in NODE_WEB_PUBLIC_URL NODE_WEB_PORT NEXT_PUBLIC_ENSEMBLE_API NEXT_PUBLIC_ENSEMBLE_APP ENSEMBLE_NODE_TUNNEL_ID; do
    if [ -z "${!name:-}" ]; then
      echo "$name is empty in $HOST_ENV_FILE." >&2
      return 1
    fi
  done
  case "$NODE_WEB_PORT" in
    *[!0-9]*)
      echo "NODE_WEB_PORT in $HOST_ENV_FILE is not a port number." >&2
      return 1
      ;;
  esac
  for name in NODE_WEB_PUBLIC_URL NEXT_PUBLIC_ENSEMBLE_API NEXT_PUBLIC_ENSEMBLE_APP; do
    case "${!name}" in
      https://*) ;;
      *)
        echo "$name in $HOST_ENV_FILE must start with https:// on the home server." >&2
        return 1
        ;;
    esac
  done
  ENSEMBLE_NODE_HOST_DIR="$NODE_HOST_DIR"
  ENSEMBLE_NODE_UID="$(id -u)"
  ENSEMBLE_NODE_GID="$(id -g)"
  export ENSEMBLE_NODE_HOST_DIR ENSEMBLE_NODE_UID ENSEMBLE_NODE_GID
}

# The branch this server follows. deploy.yml moves `production` only after CI passed on main.
deploy_branch() {
  local branch="${ENSEMBLE_NODE_DEPLOY_BRANCH:-production}"
  case "$branch" in
    '' | -* | *..* | *[!A-Za-z0-9._/-]*)
      echo "ENSEMBLE_NODE_DEPLOY_BRANCH is not a plain branch name." >&2
      return 1
      ;;
  esac
  printf '%s\n' "$branch"
}

repo_git() {
  git -C "$REPO" "$@"
}

public_host() {
  python3 -c 'import os, urllib.parse; print(urllib.parse.urlparse(os.environ["NODE_WEB_PUBLIC_URL"]).hostname or "")'
}

local_url() {
  printf 'http://127.0.0.1:%s\n' "$NODE_WEB_PORT"
}

# The NEXT_PUBLIC_* values are baked into the browser bundle, so a release is one commit built with
# one set of them: after they change, update.sh builds a new release instead of reusing the old one.
build_key() {
  printf '%s\n' "$NEXT_PUBLIC_ENSEMBLE_API" "$NEXT_PUBLIC_ENSEMBLE_APP" | sha256sum | cut -c1-8
}

# The release being served ("<commit>-<build key>"), or nothing before the first deploy.
current_release() {
  local target
  target="$(readlink "$CURRENT" 2>/dev/null)" || return 0
  basename "$target"
}

deployed_commit() {
  local release
  release="$(current_release)"
  printf '%s\n' "${release%%-*}"
}

# The commit loopback /health reports, or nothing when the website does not answer.
served_commit() {
  curl -fsS --max-time 5 "$(local_url)/health" 2>/dev/null |
    python3 -c 'import json, sys; print(json.load(sys.stdin).get("commit") or "")' 2>/dev/null || true
}

# Waits until loopback /health reports the commit, then checks that the main pages answer 200.
wait_for_commit() {
  local want="$1" tries="${2:-90}" i path
  for ((i = 0; i < tries; i++)); do
    if [ "$(served_commit)" = "$want" ]; then
      for path in / /login /chat /manifest.webmanifest; do
        if ! curl -fsS -o /dev/null --max-time 15 "$(local_url)$path"; then
          echo "$path did not answer 200." >&2
          return 1
        fi
      done
      return 0
    fi
    sleep 1
  done
  echo "/health did not report $want within $tries seconds." >&2
  return 1
}

# Node 22 from nodejs.org, checked against its SHASUMS256.txt, then the pnpm in $1/package.json.
ensure_node() {
  local have="" arch tmp base name
  if [ -x "$NODE_HOST_DIR/node/bin/node" ]; then
    have="$("$NODE_HOST_DIR/node/bin/node" -p 'process.versions.node.split(".")[0]')"
  fi
  if [ "$have" != "$NODE_MAJOR" ]; then
    case "$(uname -m)" in
      x86_64) arch=x64 ;;
      aarch64 | arm64) arch=arm64 ;;
      *)
        echo "No Node build for $(uname -m)." >&2
        return 1
        ;;
    esac
    tmp="$(mktemp -d)"
    base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
    curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
    name="$(grep -oE "node-v${NODE_MAJOR}\.[0-9]+\.[0-9]+-linux-${arch}\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)"
    curl -fsSL "$base/$name" -o "$tmp/$name"
    (cd "$tmp" && grep "  $name\$" SHASUMS256.txt | sha256sum -c --quiet -)
    rm -rf "$NODE_HOST_DIR/node.new"
    mkdir -p "$NODE_HOST_DIR/node.new"
    tar -xJf "$tmp/$name" -C "$NODE_HOST_DIR/node.new" --strip-components=1
    rm -rf "$NODE_HOST_DIR/node" "$tmp"
    mv "$NODE_HOST_DIR/node.new" "$NODE_HOST_DIR/node"
    echo "Installed $("$NODE_HOST_DIR/node/bin/node" -v) in $NODE_HOST_DIR/node."
  fi
  local want
  want="$("$NODE_HOST_DIR/node/bin/node" -p 'require(process.argv[1]).packageManager.split("@")[1]' "$1/package.json")"
  if [ "$("$NODE_HOST_DIR/node/bin/pnpm" -v 2>/dev/null || true)" != "$want" ]; then
    "$NODE_HOST_DIR/node/bin/npm" install -g --silent --prefix "$NODE_HOST_DIR/node" "pnpm@$want"
  fi
}

# The units, and the scripts the timer and cron run, from one release. A switch back to an earlier
# release installs that release's copies, so a unit file always matches the build it starts.
install_runtime_files() {
  local from="$1/infra/deploy/home" unit_dir="$HOME/.config/systemd/user"
  mkdir -p "$unit_dir" "$NODE_HOST_DIR/bin"
  install -m 0644 "$from"/systemd/*.service "$from"/systemd/*.timer "$unit_dir/"
  install -m 0644 "$from/lib.sh" "$from/compose.yml" "$NODE_HOST_DIR/bin/"
  install -m 0755 "$from/update.sh" "$from/autodeploy.sh" "$from/watchdog.sh" "$NODE_HOST_DIR/bin/"
  systemctl --user daemon-reload
  systemctl --user enable --quiet "$WEB_UNIT"
  systemctl --user enable --now --quiet "$TIMER_UNIT"
}

host_compose() {
  docker compose -f "$NODE_HOST_DIR/bin/compose.yml" "$@"
}

# One ingress rule: NODE_WEB_PUBLIC_URL's host to the website's loopback port. Returns 0 when the
# file changed (a running tunnel reads it only when it starts), 1 when it was already current.
write_tunnel_config() {
  local config="$NODE_HOST_DIR/cloudflared/config.yml" host
  host="$(public_host)"
  if [ -z "$host" ]; then
    echo "NODE_WEB_PUBLIC_URL has no host." >&2
    exit 1
  fi
  {
    printf 'tunnel: %s\n' "$ENSEMBLE_NODE_TUNNEL_ID"
    printf 'credentials-file: /etc/cloudflared/%s.json\n' "$ENSEMBLE_NODE_TUNNEL_ID"
    printf 'metrics: %s\n' "$TUNNEL_METRICS"
    printf 'ingress:\n'
    printf '  - hostname: %s\n    service: http://127.0.0.1:%s\n' "$host" "$NODE_WEB_PORT"
    printf '  - service: http_status:404\n'
  } >"$config.tmp"
  chmod 0600 "$config.tmp"
  if cmp -s "$config.tmp" "$config"; then
    rm -f "$config.tmp"
    return 1
  fi
  mv "$config.tmp" "$config"
  return 0
}

# Every 15 minutes, offset from Ensemble's own watchdog, and once after boot. Replaces only the
# lines tagged "# ensemble-node" (Ensemble's are tagged "# ensemble-home").
install_crontab() {
  local watchdog="$NODE_HOST_DIR/bin/watchdog.sh" current
  current="$(crontab -l 2>/dev/null | grep -v '# ensemble-node$' || true)"
  {
    if [ -n "$current" ]; then printf '%s\n' "$current"; fi
    printf '7-59/15 * * * * /bin/bash %s >/dev/null 2>&1 # ensemble-node\n' "$watchdog"
    printf '@reboot sleep 90 && /bin/bash %s --boot >/dev/null 2>&1 # ensemble-node\n' "$watchdog"
  } | crontab -
}

# Keeps the served release and the newest others, KEEP_RELEASES in all.
prune_releases() {
  local serving name kept=1
  serving="$(current_release)"
  while IFS= read -r name; do
    if [ -z "$name" ] || [ "$name" = "$serving" ]; then
      continue
    fi
    if [ "$kept" -lt "$KEEP_RELEASES" ]; then
      kept=$((kept + 1))
    else
      rm -rf "${RELEASES:?}/$name"
    fi
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2-)
}

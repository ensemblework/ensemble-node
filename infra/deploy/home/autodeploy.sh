#!/usr/bin/env bash
# Pull-based deploy for the Ensemble Node website. ensemble-node-autodeploy.timer (a user unit) runs
# the copy in ~/ensemble-node-host/bin every minute: when origin/$ENSEMBLE_NODE_DEPLOY_BRANCH is at a
# commit other than the one being served, it runs update.sh for that commit. Nothing connects in.
# Off unless ENSEMBLE_NODE_AUTODEPLOY=on in ~/ensemble-node-host/node-web.env.
#
# A commit whose deploy fails is recorded in ~/ensemble-node-host/state/autodeploy.failed and is not
# retried every minute. Push a fix (a new commit), or run update.sh by hand.
set -euo pipefail

main() {
  local dir
  dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  # shellcheck source=lib.sh
  . "$dir/lib.sh"
  refuse_root
  host_path
  user_bus
  load_env_file "$HOST_ENV_FILE"
  if [ "${ENSEMBLE_NODE_AUTODEPLOY:-off}" != "on" ]; then
    exit 0
  fi
  local branch failed target serving
  branch="$(deploy_branch)"
  failed="$NODE_HOST_DIR/state/autodeploy.failed"

  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    exit 0
  fi
  repo_git fetch --quiet origin "$branch"
  target="$(repo_git rev-parse "origin/$branch")"
  serving="$(deployed_commit)"
  if [ "$serving" = "$target" ]; then
    exit 0
  fi
  if [ -f "$failed" ] && [ "$(cat "$failed")" = "$target" ]; then
    exit 0
  fi

  echo "Deploying $target from origin/$branch (serving ${serving:-nothing})."
  if ENSEMBLE_NODE_DEPLOY_LOCKED=1 bash "$dir/update.sh" "$target"; then
    rm -f "$failed"
    echo "Deployed $target."
  else
    mkdir -p "$(dirname "$failed")"
    printf '%s\n' "$target" >"$failed"
    echo "Deploy of $target failed. It will not be retried until a new commit arrives." >&2
    exit 1
  fi
}

main "$@"
exit

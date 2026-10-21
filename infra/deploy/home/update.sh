#!/usr/bin/env bash
# Deploys the Ensemble Node website on the home server. Builds a commit of
# origin/$ENSEMBLE_NODE_DEPLOY_BRANCH into its own release directory while the current release keeps
# serving, points ~/ensemble-node-host/current at it, restarts the website (about two seconds) and
# waits until /health reports the commit and the main pages answer. When the new release does not
# come up, the release that was serving comes back. Run as the machine's user, never root.
#
#   bash ~/ensemble-node-host/bin/update.sh            the branch's newest commit
#   bash ~/ensemble-node-host/bin/update.sh <commit>   an earlier commit of the branch. Set
#                                                      ENSEMBLE_NODE_AUTODEPLOY=off first, or the
#                                                      timer moves on to the newest within a minute.
#
# ensemble-node-autodeploy.timer runs it through autodeploy.sh. Bash reads every function below
# before main starts, so a deploy that replaces this file cannot change it mid-run.
set -euo pipefail

main() {
  local dir
  dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  # shellcheck source=lib.sh
  . "$dir/lib.sh"
  refuse_root
  host_path
  user_bus
  if [ ! -d "$REPO/.git" ]; then
    echo "$REPO is not a git checkout. Run setup.sh first." >&2
    exit 1
  fi
  load_host_env
  local branch target release previous since
  branch="$(deploy_branch)"
  if [ -z "${ENSEMBLE_NODE_DEPLOY_LOCKED:-}" ]; then
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
      echo "Another deploy is running." >&2
      exit 1
    fi
  fi

  repo_git fetch --quiet origin "$branch"
  if [ "$(repo_git rev-parse --abbrev-ref HEAD)" != "$branch" ]; then
    repo_git checkout --quiet "$branch"
  fi
  repo_git merge --quiet --ff-only "origin/$branch"
  if ! target="$(repo_git rev-parse --verify --quiet "${1:-HEAD}^{commit}")"; then
    echo "Unknown commit: $1" >&2
    exit 1
  fi
  if ! repo_git merge-base --is-ancestor "$target" "origin/$branch"; then
    echo "$target is not on origin/$branch. Only commits the branch has had are deployed." >&2
    exit 1
  fi

  ensure_node "$REPO"
  release="$target-$(build_key)"
  build_release "$target" "$release"

  previous="$(current_release)"
  install_runtime_files "$RELEASES/$release"
  since="$(date '+%Y-%m-%d %H:%M:%S')"
  if [ "$previous" = "$release" ] && [ "$(served_commit)" = "$target" ]; then
    echo "Already serving $release; not restarting."
  elif ! serve_release "$release"; then
    journalctl --user -u "$WEB_UNIT" --since "$since" --no-pager >&2 || true
    if [ -n "$previous" ] && [ "$previous" != "$release" ] && [ -f "$RELEASES/$previous/.release-env" ]; then
      echo "Going back to $previous." >&2
      install_runtime_files "$RELEASES/$previous"
      serve_release "$previous" || echo "$previous did not come back either: journalctl --user -u $WEB_UNIT" >&2
    fi
    exit 1
  fi

  if write_tunnel_config; then
    # A running tunnel reads config.yml only when it starts. No container yet: compose makes one.
    docker restart "$TUNNEL_CONTAINER" >/dev/null 2>&1 || true
  fi
  host_compose up -d --remove-orphans
  prune_releases
  echo "Serving $target at ${NODE_WEB_PUBLIC_URL%/} (release $release)."
}

# git archive of the commit, pnpm install, next build. The marker file .release-env is written last,
# so a release without it is a build that did not finish and is built again from scratch.
build_release() {
  local commit="$1" release="$2" dir="$RELEASES/$2"
  if [ -f "$dir/.release-env" ]; then
    echo "Release $release is already built."
    return 0
  fi
  echo "Building $commit into $dir."
  rm -rf "$dir"
  mkdir -p "$dir"
  repo_git archive --format=tar "$commit" | tar -x -C "$dir"
  (
    cd "$dir"
    # NODE_ENV=production would make pnpm skip the build's devDependencies (TypeScript, Tailwind).
    env -u NODE_ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 nice -n 10 pnpm install --frozen-lockfile --reporter=silent
    env -u NODE_ENV NEXT_TELEMETRY_DISABLED=1 nice -n 10 pnpm run build
  )
  # The unit reads this through `current`, so /health always reports the release actually served.
  printf 'ENSEMBLE_NODE_COMMIT=%s\nENSEMBLE_NODE_RELEASE=%s\n' "$commit" "$release" >"$dir/.release-env"
}

# Points `current` at a release (a rename, so never half-switched), restarts, and waits for it.
serve_release() {
  local release="$1"
  ln -sfn "releases/$release" "$CURRENT.next" || return 1
  mv -T "$CURRENT.next" "$CURRENT" || return 1
  systemctl --user restart "$WEB_UNIT" || return 1
  wait_for_commit "${release%%-*}"
}

main "$@"
exit

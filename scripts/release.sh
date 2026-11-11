#!/usr/bin/env bash
# Publishes a GitHub release for the newest tag on main: builds the mod at that tag and attaches the zip.
#
#   scripts/release.sh            build and publish
#   scripts/release.sh --dry-run  build the zip and show what would be published, change nothing
#
# Tags are plain versions (1.0.0; a leading v is accepted) and must match "version" in manifest.json at that tag.
# The build runs in a temporary worktree of the tag, so later commits on main don't leak into the release.
# It needs the game installed (the build references its DLLs) and, to publish, the GitHub CLI (gh) logged in.
set -euo pipefail

DRY_RUN=false
[[ ${1:-} == --dry-run ]] && DRY_RUN=true

die() { echo "release: $*" >&2; exit 1; }
say() { echo "==> $*"; }

root=$(git rev-parse --show-toplevel)
cd "$root"
mod=$(sed -nE 's/^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' manifest.json)

# The highest version tag on main (merged into it), and the one before it for the notes.
mapfile -t tags < <(git tag --merged main --sort=-v:refname)
((${#tags[@]})) || die "no tag on main yet. Tag a commit first: git tag 1.0.0"
tag=${tags[0]}
previous=${tags[1]:-}
version=${tag#v}
[[ $version =~ ^[0-9]+\.[0-9]+(\.[0-9]+[a-z]?)?$ ]] || die "tag '$tag' is not a version like 1.0.0"

# The manifest at the tag must carry the same version, or the game and the portal would show another number.
manifest_version=$(git show "$tag:manifest.json" | sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')
[[ $manifest_version == "$version" ]] ||
  die "tag $tag but manifest.json at that tag says $manifest_version. Bump the manifest, commit, and tag that commit."

if ! $DRY_RUN; then
  command -v gh >/dev/null || die "the GitHub CLI is missing: sudo pacman -S github-cli && gh auth login"
  gh auth status >/dev/null 2>&1 || die "gh is not logged in: gh auth login"
  if gh release view "$tag" >/dev/null 2>&1; then die "release $tag already exists on GitHub"; fi
fi

# Build at the tag in a throwaway worktree.
work=$(mktemp -d "${TMPDIR:-/tmp}/$mod-release.XXXXXX")
cleanup() { git worktree remove --force "$work" >/dev/null 2>&1 || rm -rf "$work"; }
trap cleanup EXIT
say "Building $mod $version from $tag ($(git rev-parse --short "$tag^{commit}"))"
git worktree add --quiet --detach "$work" "$tag"
make -C "$work" dist >/dev/null
zip_name="${mod}_${version}.zip"
mkdir -p dist
cp "$work/dist/$zip_name" "dist/$zip_name"
zip="$root/dist/$zip_name"
say "Built dist/$zip_name"
unzip -l "$zip" | sed -n '4,$p' | sed '$d' | sed '$d' | sed 's/^/    /'

# Notes: the commits since the previous tag on main (all of them for the first release).
range=${previous:+$previous..}$tag
notes=$(
  echo "Control Room $version for Captain of Industry."
  echo
  echo "Install: unzip into the game's Mods folder, enable **Control Room**, load a save, run \`web_api_start\` in the"
  echo "game console, then open http://127.0.0.1:3073/control-room."
  echo
  if [[ -n $previous ]]; then echo "## Changes since $previous"; else echo "## Changes"; fi
  echo
  git log --no-merges --format='- %s' "$range"
)

if $DRY_RUN; then
  say "Dry run. Would push tag $tag if missing on origin and create release '$tag' with dist/$zip_name and these notes:"
  echo "$notes" | sed 's/^/    /'
  exit 0
fi

if ! git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  say "Pushing tag $tag"
  git push origin "refs/tags/$tag"
fi
say "Creating release $tag"
gh release create "$tag" "$zip" --verify-tag --title "Control Room $version" --notes "$notes"
say "Done: $(gh release view "$tag" --json url --jq .url)"

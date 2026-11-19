#!/usr/bin/env bash
# Prints the version for a release from main.
#
# Usage: pick-release-version.sh <tag-prefix> <source-version>
#   pick-release-version.sh desktop-v 0.2.0
#
# The version is the patch bump of the highest `<tag-prefix>X.Y.Z` tag on
# origin, and never lower than <source-version> (the version in the source
# file). With no such tag, it is <source-version>. Tags are read from origin,
# so a queued run sees the tag that the run before it created. Every release
# has a tag, and a tag without a release also counts, so a version is never
# used twice. Nothing is written: the caller puts the version into the build.
set -euo pipefail

prefix="$1"
source_version="$2"
semver='^[0-9]+\.[0-9]+\.[0-9]+$'

if ! [[ "$source_version" =~ $semver ]]; then
  echo "::error::Source version '$source_version' is not X.Y.Z." >&2
  exit 1
fi

# A failed ls-remote stops the script here. An empty list is fine.
refs="$(git ls-remote --tags --refs origin "${prefix}*")"
highest="$(printf '%s\n' "$refs" | sed "s|.*refs/tags/${prefix}||" | { grep -E "$semver" || true; } | sort -V | tail -n 1)"

if [ -z "$highest" ]; then
  next="$source_version"
  echo "No ${prefix}X.Y.Z tag on origin. Using the source version $next." >&2
else
  IFS=. read -r major minor patch <<<"$highest"
  bumped="$major.$minor.$((patch + 1))"
  next="$(printf '%s\n%s\n' "$bumped" "$source_version" | sort -V | tail -n 1)"
  echo "Highest tag: ${prefix}${highest}. Source version: $source_version. Next: $next." >&2
fi

echo "$next"

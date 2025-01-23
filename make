#!/bin/sh

deps="-p gnumake -p zig -p esbuild -p nodejs_22 -p corepack_22 -p wget -p cacert -p xxd -p jq -p unzip -p clang -p libllvm -p graphene-hardened-malloc"

set -eu
self="$(realpath "$(command -v "$0")")"
cd "$(dirname "$self")"
mkdir -p build
nix_state="$( (printf "%s\n" "$self" "$NIX_PATH" | tee /dev/stderr | tr ':' '\n' | sed -E 's/^.+=//' | xargs ls -l) 2>&1)"
if [ ! -e build/.env.cache ]; then
    # shellcheck disable=SC2086
    nix-shell $deps --pure --run 'env -0 >build/.env.cache'
    printf 'nix_state=%s\0' "$nix_state" >>build/.env.cache
else
    shell_path="$(grep -Pzao '(?<=out=)[^\0]+' build/.env.cache -m 1 | tr -d '\0')"
    cached_nix_state="$(grep -Pzao '(?<=nix_state=)[^\0]+' build/.env.cache -m 1 | tr -d '\0')"
    if [ "$nix_state" != "$cached_nix_state" ] || ! grep -Pzao '/nix/store/[^/\0\s]+' build/.env.cache | grep -zv "$shell_path" | xargs -0 ls >/dev/null; then
        rm build/.env.cache
        exec "$self" "$@"
    fi
fi
(
    grep -z = build/.env.cache
    printf '%s\0' "make" "$@"
) | xargs -0 env -i

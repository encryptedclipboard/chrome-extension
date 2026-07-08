#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Build script for extension. It:
# - removes existing build/ directory contents
# - runs build for Chrome
# - creates build/chrome directory
# - copies built artifacts

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"

echo "Cleaning build directory: $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/chrome"


# Also clean any dist directories to ensure no stale outputs
rm -rf "$ROOT_DIR/dist"

run_build_for_browser() {
    local browser="$1"
    echo ""
    echo "========================================="
    echo "Building for $browser"
    echo "========================================="

    export TARGET_BROWSER="$browser"

    local pkg_dir
    for pkg_dir in "src/background" "src/sidebar" "src/clipboard-palette"; do
        echo "--- Building $pkg_dir for $browser ---"
        pushd "$ROOT_DIR/$pkg_dir" >/dev/null
        
        local build_script="build"
        if [ "${NODE_ENV:-production}" = "development" ]; then
            build_script="build:dev"
        fi

        if command -v npm >/dev/null 2>&1; then
            npm run "$build_script"
            elif command -v pnpm >/dev/null 2>&1; then
            pnpm run "$build_script"
            elif command -v bun >/dev/null 2>&1; then
            bun run "$build_script"
        else
            echo "No known JS runner (bun/pnpm/npm) found. Please install one and re-run." >&2
            exit 1
        fi
        popd >/dev/null
    done

    echo "Copying build artifacts for $browser..."

    # Copy assets directory
    if [ -d "$ROOT_DIR/src/assets" ]; then
        cp -R "$ROOT_DIR/src/assets" "$BUILD_DIR/$browser/"
    else
        echo "Warning: assets directory not found at $ROOT_DIR/src/assets" >&2
    fi

    # Copy onboarding static files (if present)
    if [ -d "$ROOT_DIR/src/onboarding" ]; then
        cp -R "$ROOT_DIR/src/onboarding" "$BUILD_DIR/$browser/"
    fi

    # Copy offscreen static files (if present)
    if [ -d "$ROOT_DIR/src/offscreen" ]; then
        mkdir -p "$BUILD_DIR/$browser/offscreen"
        cp "$ROOT_DIR/src/offscreen/offscreen.html" "$BUILD_DIR/$browser/offscreen/"
    fi

    # Copy browser-specific manifest
    local manifest_file="$ROOT_DIR/src/manifest.json"
    if [ -f "$manifest_file" ]; then
        cp "$manifest_file" "$BUILD_DIR/$browser/manifest.json"
    else
        echo "Error: Browser-specific manifest not found: $manifest_file" >&2
        exit 1
    fi

    echo "Build complete for $browser: $BUILD_DIR/$browser"
}

# Build for Chrome
run_build_for_browser "chrome"



echo "========================================="
echo "All builds complete!"
echo "========================================="
echo "Chrome build:   $BUILD_DIR/chrome"


bun run scripts/pack-build.ts
bun run scripts/pack-source.ts
node scripts/verify-utf8.js

# Encrypted Clipboard Manager (ECM)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hplfhaecbalimhnmlacdbmecldhpjgli)](https://chromewebstore.google.com/detail/hplfhaecbalimhnmlacdbmecldhpjgli?utm_source=item-share-cb)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue)](./LICENSE)

[![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/EncryptedClip)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/encryptedclipboard/chrome-extension)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/company/encryptedclipboard)

**Website:** [encryptedclipboard.app](https://encryptedclipboard.app)

**End-to-end encrypted clipboard manager for Chrome. Sync everything you copy across your devices - without anyone else reading it.**

![Encrypted Clipboard Manager screenshot](https://lh3.googleusercontent.com/pmYYycfJaeVM4Gfr7dIrjVCZcK4kZiArgQPz5tpiF9qA_murnKUBfZzC4WlGERNMLvPWYCrPiwU5C3PCbxDJge_O9jw=s1280-w1280-h800)

---

## What Is ECM?

A Chrome extension that captures everything you copy, syncs it with end-to-end encryption across your devices, and makes it searchable and accessible wherever you are. Your clipboard data never leaves your device in plaintext - not even our server can read it.

---

## Why I Built This

I needed a seamless way to copy something on my desktop and paste it on my laptop, or the opposite. Also wanted to do that from my phone, but Android and iOS no longer allow apps to read the clipboard in the background for seamless syncing, so I skipped the mobile app idea.

Existing Chrome extensions exist, but none check all the boxes: open source (or source-available) _and_ end-to-end encrypted _and_ image support _and_ good performance without memory issues.

I didn't build a native app because distributing native apps is far harder than a Chrome extension. Everyone uses Chrome or a Chromium-based browser - install once on any OS and it just works.

---

## Why Source-Available?

The extension was originally closed-source. Not because I was hiding something - no data collection, no telemetry, no analytics - but because I spent months of effort building this and wanted to prevent someone from simply repackaging it and making a business out of my work.

But I realized that creates a trust issue. I personally wouldn't use a tool that doesn't show exactly what it collects and what it doesn't. So I'm making the source available so that:

- **Security researchers** can verify the encryption is real
- **Users** can confirm no data is being collected
- **Companies** can audit it before allowing internal use
- **Trust** replaces uncertainty

Everything is end-to-end encrypted. No AI is used for data categorization or anything else - all content detection is local pattern matching. This is one of the safest tools you can run on your daily devices.

---

## Features

- **End-to-end encrypted sync** across all your devices
- **Auto-captures** everything you copy
- **Smart content detection:** URLs, emails, IPs, OTP codes, SSH keys, API tokens, credit cards, passwords - all detected locally using pure regular expressions, no AI, no third-party services
- **Automatic blurring** of confidential content (click to reveal)
- **Image support** with thumbnail previews
- **Favorites, tags, and rich search** with type filters
- **Quick palette:** press Alt+V (customizable keyboard shortcut) to search and paste instantly
- **Offline access** to all locally stored clipboard history
- **Total privacy:** zero telemetry, zero analytics, no data collection

---

## Tech Stack

| Layer                  | Technology                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension framework    | Chrome Manifest V3                                                                                                                          |
| UI (sidebar + palette) | Svelte 5, TypeScript, SCSS                                                                                                                  |
| Background service     | TypeScript, Webpack                                                                                                                         |
| Build tooling          | Vite (UI), Webpack (background)                                                                                                             |
| Local storage          | IndexedDB via idb                                                                                                                           |
| Cryptography           | Web Workers via [@encryptedclipboard/crypto](https://github.com/encryptedclipboard/crypto) (open-source, Web Crypto API, zero dependencies) |

> **Encryption:** All cryptography uses the browser's native [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) through our open-source library - [github.com/encryptedclipboard/crypto](https://github.com/encryptedclipboard/crypto). The library has zero dependencies, is fully auditable, and runs in Web Workers to keep the main thread free.

---

## Build from Source

### Prerequisites

**Install Bun:**

_Linux / macOS:_

```bash
curl -fsSL https://bun.sh/install | bash
```

_Windows (PowerShell):_

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Alternatively, see [bun.sh/docs/installation](https://bun.sh/docs/installation) for package managers or other methods.

### Build Steps

```bash
# Clone the repository
git clone https://github.com/encryptedclipboard/chrome-extension.git
cd extension

# Create environment file
cp .env.example .env

# Install all dependencies (root + sub-packages)
bun run install:dep

# Development build (preserves console.log statements for debugging)
bun run build:dev

# Production build (minified, console.logs automatically stripped by build system)
bun run build
```

### Output

```
build/
├── chrome/                             # Unpacked Chrome extension
│   ├── manifest.json
│   ├── background.js                   # Service worker (Webpack bundle)
│   ├── crypto.worker.js                # Web Worker (crypto operations)
│   ├── vendors-*.js                    # Vendor chunk (turndown)
│   ├── content/                        # Content scripts injected into web pages
│   ├── offscreen/                      # Offscreen document (thumbnails)
│   ├── onboarding/                     # Welcome / onboarding page
│   ├── sidebar/                        # Sidebar UI (Vite + Svelte 5 SPA)
│   ├── clipboard-palette/              # Quick palette overlay (Vite + Svelte 5, IIFE)
│   └── assets/                         # Icons, images, screenshots
├── encryptedclipboard-vX.Y.Z.zip       # Packed for Chrome Web Store
└── encryptedclipboard-source-vX.Y.Z.zip # Source archive
```

### Source Code Structure

```
extension/
├── .editorconfig
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc
├── .stylelintrc.json
├── LICENSE
├── README.md
├── eslint.config.mjs
├── package.json
├── tsconfig.json
├── scripts/                        # Build, release, and utility scripts
│   ├── build.sh
│   ├── install-dep.sh
│   ├── sync-version.ts             # Syncs version from .env to source files
│   ├── bump-version.ts             # Bumps version, builds, commits, tags
│   ├── release.ts                  # Releases current/bumped version to GitHub
│   ├── rollback.ts                 # Rolls back commits (--safe creates backup)
│   ├── version.ts                  # Prints current version
│   ├── pack-build.ts               # Zips the build output
│   ├── pack-source.ts              # Zips the source tree
│   └── verify-utf8.js              # Validates build files are clean UTF-8
├── src/
│   ├── config/index.ts             # App configuration and version
│   ├── manifest.json               # Extension manifest template
│   ├── assets/                     # Static assets (icons, images, screenshots)
│   ├── shared/                     # Shared across all packages
│   │   ├── enums/                  # Type-safe enums
│   │   ├── types/                  # TypeScript interfaces
│   │   ├── services/               # Storage, DB, auth, sync services
│   │   └── utils/                  # Crypto, formatting, detection utilities
│   ├── background/                 # Service worker (Webpack)
│   │   ├── src/
│   │   │   ├── clipboard-background.ts
│   │   │   ├── index.ts
│   │   │   ├── handlers/           # Message handlers
│   │   │   ├── services/           # Sync, push, cleanup, thumbnail services
│   │   │   └── utils/              # Badge, context menu, window utilities
│   │   └── webpack.config.js
│   ├── sidebar/                    # Sidebar UI (Vite + Svelte 5)
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── main.ts
│   │   │   ├── components/         # Svelte components
│   │   │   ├── styles/             # SCSS stylesheets
│   │   │   ├── stores/             # Svelte runes state stores
│   │   │   ├── types/              # Sidebar-specific types
│   │   │   └── utils/              # Detector, error handler utilities
│   │   └── vite.config.ts
│   ├── clipboard-palette/          # Quick palette overlay (Vite + Svelte 5)
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── main.ts
│   │   │   ├── Spinner.svelte
│   │   │   ├── styles/
│   │   │   └── services/
│   │   └── vite.config.ts
│   ├── content/                    # Content scripts injected into web pages
│   │   ├── element-picker.ts
│   │   ├── clipboard-listener.ts
│   │   ├── auth-sync.ts
│   │   ├── snippets.ts
│   │   ├── snippets-inject.ts
│   │   └── ...site-specific scripts (GitHub, Twitter, LinkedIn, etc.)
│   ├── offscreen/                  # Offscreen document (thumbnails, crypto)
│   └── onboarding/                 # Welcome / onboarding page
└── build/                          # Build output (gitignored)
    └── chrome/                     # Unpacked Chrome extension
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select `build/chrome/`

### Versioning & Release

The version is managed in `.env` (`EXTENSION_VERSION=X.Y.Z`) and synced to 4 files at build time:
`src/config/index.ts`, `src/manifest.json`, `src/onboarding/index.html`, `package.json`.

| Command | What it does |
|---------|-------------|
| `bun run version` | Prints current version (e.g. `ECM-v5.4.0`) |
| `bun run version:patch` | Bumps patch (5.4.0 -> 5.4.1), builds, commits, tags locally |
| `bun run version:minor` | Bumps minor (5.4.0 -> 5.5.0), builds, commits, tags locally |
| `bun run version:major` | Bumps major (5.4.0 -> 6.0.0), builds, commits, tags locally |
| `bun run release` | Builds current version, commits if changed, tags, pushes to `origin` |
| `bun run release -- minor` | Bumps + builds + commits + tags + pushes to `origin` |
| `bun run rollback -- 3` | Hard resets 3 commits (destructive) |
| `bun run rollback -- 3 --safe` | Creates `backup/rollback-*` branch, then hard resets |

The `release` command always uses the `origin` remote. Configure it once:

```bash
git remote add origin https://github.com/encryptedclipboard/chrome-extension.git
```

Then release:

```bash
# Release the current version as-is (builds, commits, tags, pushes)
bun run release

# Or bump and release in one step
bun run release -- minor
```

GitHub Actions (`release.yml`) picks up the `v*` tag, builds the extension, and creates a GitHub Release with both the packed `.zip` and source `.zip`.

---

## License

**PolyForm Noncommercial 1.0.0**

| Permission | Detail                         |
| ---------- | ------------------------------ |
| ✅         | Free for personal use          |
| ✅         | Free for internal company use  |
| ✅         | Modify, build, and run locally |
| ❌         | No selling or rebranding       |
| ❌         | No commercial redistribution   |

This is **not** an OSI-approved open source license. It is a **source-available** license. The code is fully visible and auditable, but commercial exploitation is restricted. See the [LICENSE](./LICENSE) file for full terms.

---

## Contributing

This project is source-available, not open source. You're welcome to submit issues and suggestions, but commercial contributions or forks are not permitted under the license terms.

---

## Disclaimer

This project is not affiliated with, endorsed by, or associated with Google or Chrome.

---

**Author:** [Nowshad Hossain Rahat](https://github.com/nowshad-hossain-rahat) · [@nhrdev](https://x.com/nhrdev) · [LinkedIn](https://linkedin.com/in/nhrdev)

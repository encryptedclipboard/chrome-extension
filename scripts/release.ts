import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const bumpType = process.argv[2];
const validTypes = ["patch", "minor", "major"];
const isBump = validTypes.includes(bumpType);

if (process.argv[2] && !isBump) {
  console.error("Usage: bun run release [-- <patch|minor|major>]");
  console.error("  bun run release              release current .env version");
  console.error("  bun run release -- patch     bump patch + release");
  console.error("  bun run release -- minor     bump minor + release");
  console.error("  bun run release -- major     bump major + release");
  process.exit(1);
}

if (isBump) {
  execSync(`bun scripts/bump-version.ts ${bumpType}`, { stdio: "inherit" });
} else {
  console.log("Releasing current version...");
  execSync("bun run build", { stdio: "inherit" });

  const stagedFiles =
    "src/config/index.ts src/manifest.json src/onboarding/index.html package.json";
  execSync(`git add ${stagedFiles}`, { stdio: "inherit" });

  try {
    execSync("git diff --cached --quiet", { stdio: "ignore" });
    console.log("No files changed, skipping commit.");
  } catch {
    execSync(`git commit -m "release: ${process.env.npm_package_version}"`, {
      stdio: "inherit",
    });
  }
}

// Read version
const envPath = join(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const match = envContent.match(/EXTENSION_VERSION=(.*)/);
const version = match?.[1]?.trim();

if (!version) {
  console.error("Could not read version from .env");
  process.exit(1);
}

// Create tag if it doesn't exist
const existingTag = execSync(`git tag -l v${version}`, {
  encoding: "utf-8",
}).trim();

if (!existingTag) {
  execSync(`git tag v${version}`, { stdio: "inherit" });
}

// Push commit and tag
console.log(`\nPushing commit and tag v${version}...`);

try {
  execSync("git push origin main", { stdio: "inherit" });
} catch {
  console.warn("Push main failed (may already be up to date)");
}

try {
  execSync(`git push origin v${version}`, { stdio: "inherit" });
} catch {
  console.warn("Push tag failed (may already exist remotely)");
}

console.log(
  `\nDone: v${version} pushed. GitHub Actions will build and create the release.`,
);

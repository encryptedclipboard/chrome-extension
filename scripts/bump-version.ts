import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const bumpType = process.argv[2];
const validTypes = ["patch", "minor", "major"];

if (!validTypes.includes(bumpType)) {
  console.error("Usage: bun scripts/bump-version.ts [patch|minor|major]");
  process.exit(1);
}

const envPath = join(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const versionMatch = envContent.match(/EXTENSION_VERSION=(.*)/);
const currentVersion = versionMatch?.[1]?.trim();

if (!currentVersion) {
  console.error("Could not read EXTENSION_VERSION from .env");
  process.exit(1);
}

const [maj, min, pat] = currentVersion.split(".").map(Number);
let newVersion: string;

if (bumpType === "major") {
  newVersion = `${maj + 1}.0.0`;
} else if (bumpType === "minor") {
  newVersion = `${maj}.${min + 1}.0`;
} else {
  newVersion = `${maj}.${min}.${pat + 1}`;
}

console.log(`Version: ${currentVersion} -> ${newVersion}`);

writeFileSync(envPath, `EXTENSION_VERSION=${newVersion}\n`);

execSync("bun run build", { stdio: "inherit" });

const stagedFiles =
  "src/config/index.ts src/manifest.json src/onboarding/index.html package.json";

execSync(`git add ${stagedFiles}`, { stdio: "inherit" });

// Skip commit if nothing changed (files already at this version)
let hasChanges = true;
try {
  execSync("git diff --cached --quiet", { stdio: "ignore" });
  hasChanges = false;
} catch {
  hasChanges = true;
}

if (hasChanges) {
  execSync(`git commit -m "v${newVersion}"`, { stdio: "inherit" });
  console.log(`\u2713 Committed v${newVersion}`);
} else {
  console.log("No files changed, skipping commit.");
}

// Skip tag if it already exists
const existingTag = execSync(`git tag -l v${newVersion}`, {
  encoding: "utf-8",
}).trim();

if (existingTag) {
  console.log(`Tag v${newVersion} already exists, skipping.`);
} else {
  execSync(`git tag v${newVersion}`, { stdio: "inherit" });
  console.log(`\u2713 Tagged v${newVersion}`);
}

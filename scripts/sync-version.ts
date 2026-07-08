import { join } from "path";
import { readFileSync, writeFileSync } from "fs";

// Read .env manually since we don't want to add dotenv dependency just for this
const envPath = join(process.cwd(), ".env");
let version = "1.0.0"; // Default

try {
  const envContent = readFileSync(envPath, "utf-8");
  const versionMatch = envContent.match(/EXTENSION_VERSION=(.*)/);
  if (versionMatch && versionMatch[1]) {
    version = versionMatch[1].trim();
  }
} catch (e) {
  console.warn("Could not read .env file, using default version 1.0.0");
}

// 1. Update src/config/index.ts
const configPath = join(process.cwd(), "src/config/index.ts");
try {
  let configContent = readFileSync(configPath, "utf-8");

  // Replace export const VERSION = "..." with new version
  configContent = configContent.replace(
    /export const VERSION = ".*";/,
    `export const VERSION = "${version}";`,
  );

  writeFileSync(configPath, configContent);
} catch (e) {
  process.exit(1);
}

// 2. Update src/manifest.json
const manifestPath = join(process.cwd(), "src/manifest.json");
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.version = version;
  // Chrome requires version_name usually, but version is enough
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
} catch (e) {
  process.exit(1);
}

// 3. Update src/onboarding/index.html (version badge)
const onboardingPath = join(process.cwd(), "src/onboarding/index.html");
try {
  let onboardingContent = readFileSync(onboardingPath, "utf-8");

  // Replace version badge like v5.3.1 or v1.0.0 with new version
  onboardingContent = onboardingContent.replace(
    /v\d+\.\d+\.\d+/g,
    `v${version}`,
  );

  writeFileSync(onboardingPath, onboardingContent);
} catch (e) {
  // Non-fatal - onboarding page is optional
  console.warn("Could not update onboarding/index.html version badge");
}

// 4. Update root package.json
const packagePath = join(process.cwd(), "package.json");
try {
  const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
  pkg.version = version;
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
} catch (e) {
  console.warn("Could not update root package.json version");
}

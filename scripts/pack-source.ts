import { join } from "path";
import { readFileSync, createWriteStream, existsSync, mkdirSync } from "fs";
import archiver from "archiver";

// Read version
const envPath = join(process.cwd(), ".env");
let version = "1.0.0";

try {
  const envContent = readFileSync(envPath, "utf-8");
  const versionMatch = envContent.match(/EXTENSION_VERSION=(.*)/);
  if (versionMatch && versionMatch[1]) {
    version = versionMatch[1].trim();
  }
} catch (e) {
  console.warn("Could not read .env file, using default version 1.0.0");
}

const rootDir = process.cwd();
const buildDir = join(rootDir, "build");

// Ensure build dir exists
if (!existsSync(buildDir)) {
  mkdirSync(buildDir);
}

async function zipSource(outPath: string) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = createWriteStream(outPath);

  return new Promise<void>((resolve, reject) => {
    archive
      .glob("**/*", {
        cwd: rootDir,
        ignore: [
          "**/node_modules/**",
          "**/build/**",
          "**/dist/**",
          ".git/**",
          ".env",
          ".DS_Store",
          "Archive.zip",
          "**/*.lock",
        ],
      })
      .on("error", (err) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

async function run() {
  console.info("Packing source code...");
  const outFile = join(buildDir, `encryptedclipboard-source-v${version}.zip`);

  try {
    await zipSource(outFile);
    console.info(`Created ${outFile}`);
  } catch (e) {
    console.error(`Failed to zip source code`, e);
  }
}

run();

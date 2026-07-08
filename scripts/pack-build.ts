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

const buildDir = join(process.cwd(), "build");

async function zipDirectory(sourceDir: string, outPath: string) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = createWriteStream(outPath);

  return new Promise<void>((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on("error", (err) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

async function run() {
  console.info("Packing builds...");
  const browsers = ["chrome"];

  for (const browser of browsers) {
    const sourceDir = join(buildDir, browser);
    const outFile = join(buildDir, `encryptedclipboard-v${version}.zip`);

    if (!existsSync(sourceDir)) {
      console.warn(
        `Skipping ${browser} pack: Directory not found at ${sourceDir}`,
      );
      continue;
    }

    try {
      console.info(`Zipping ${browser}...`);
      await zipDirectory(sourceDir, outFile);
      console.info(`Created ${outFile}`);
    } catch (e) {
      console.error(`Failed to zip ${browser}`, e);
    }
  }
}

run();

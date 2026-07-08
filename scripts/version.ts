import { readFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env");
let version = "0.0.0";

try {
  const envContent = readFileSync(envPath, "utf-8");
  const match = envContent.match(/EXTENSION_VERSION=(.*)/);
  if (match?.[1]) version = match[1].trim();
} catch {}

console.log(`ECM-v${version}`);

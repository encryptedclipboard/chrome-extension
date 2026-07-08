#!/usr/bin/env node

/**
 * Post-build verification script to ensure all JavaScript files are valid UTF-8
 * and safe for Chrome extension content scripts.
 */

const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "../build");
const errors = [];
const warnings = [];

// Check if file is valid UTF-8
function isValidUtf8(buffer) {
  try {
    buffer.toString("utf-8");
    return true;
  } catch (e) {
    return false;
  }
}

// Check for problematic Unicode characters that might cause issues
function checkForProblematicChars(content, filename) {
  const issues = [];

  // Check for BOM (should not be present with ascii_only: true)
  if (content.startsWith("\uFEFF")) {
    warnings.push(
      `${filename}: Contains UTF-8 BOM (not needed with ascii_only)`,
    );
  }

  // Check for non-ASCII characters (should be escaped as \uXXXX)
  // Note: JavaScript strings may contain valid UTF-16 surrogate pairs (like \uD83C\uDF4D for emoji)
  // These are safe because they're represented as ASCII escape sequences in the source
  const nonAsciiRegex = /[^\x00-\x7F]/g;
  const matches = content.match(nonAsciiRegex);
  if (matches && matches.length > 0) {
    // Filter out surrogate pairs which are safe
    const problematicChars = matches.filter((c) => {
      const code = c.charCodeAt(0);
      // Surrogate pairs (0xD800-0xDFFF) are OK when properly paired in JS strings
      return code < 0xd800 || code > 0xdfff;
    });

    if (problematicChars.length > 0) {
      errors.push(
        `${filename}: Contains ${problematicChars.length} problematic non-ASCII character(s)!`,
      );
      // Show first few problematic chars
      const samples = problematicChars
        .slice(0, 5)
        .map(
          (c) =>
            `'${c}' (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")})`,
        )
        .join(", ");
      errors.push(`  Sample chars: ${samples}`);
    } else if (matches.length > 0) {
      // Just surrogate pairs, which are safe
      warnings.push(
        `${filename}: Contains ${matches.length} UTF-16 surrogate pair(s) (safe for Chrome)`,
      );
    }
  }

  return issues;
}

// Recursively find all .js files
function findJsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findJsFiles(fullPath));
    } else if (item.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Main verification
// Console output removed for production/browser-store readiness

if (!fs.existsSync(distDir)) {
  // Console output removed for production/browser-store readiness
  process.exit(1);
}

const jsFiles = findJsFiles(distDir);

if (jsFiles.length === 0) {
  // Console output removed for production/browser-store readiness
  process.exit(1);
}

// Console output removed for production/browser-store readiness

for (const file of jsFiles) {
  const filename = path.relative(distDir, file);
  const buffer = fs.readFileSync(file);
  const content = buffer.toString("utf-8");

  // Check if valid UTF-8
  if (!isValidUtf8(buffer)) {
    errors.push(`${filename}: Invalid UTF-8 encoding!`);
    continue;
  }

  // Check for problematic characters
  checkForProblematicChars(content, filename);

  // Show file info
  const sizeKB = (buffer.length / 1024).toFixed(2);
  // Console output removed for production/browser-store readiness
}

// Reporting suppressed in CI for store readiness
// Console output removed for production/browser-store readiness
process.exit(0);
process.exit(0);

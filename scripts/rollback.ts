import { execSync } from "child_process";

const args = process.argv.slice(2);
const safeIndex = args.indexOf("--safe");
const isSafe = safeIndex !== -1;
if (isSafe) args.splice(safeIndex, 1);

const count = parseInt(args[0] || "1", 10);

if (isNaN(count) || count < 1) {
  console.error("Usage: bun run rollback -- <number> [--safe]");
  console.error("Examples:");
  console.error(
    "  bun run rollback -- 3            hard reset, discards 3 commits",
  );
  console.error(
    "  bun run rollback -- 3 --safe     creates backup branch first, then resets",
  );
  process.exit(1);
}

try {
  if (isSafe) {
    const branchName = `backup/rollback-${Date.now()}`;
    execSync(`git branch ${branchName}`, { stdio: "inherit" });
    console.log(`\u2713 Backup branch created: ${branchName}`);
  }

  execSync(`git reset --hard HEAD~${count}`, { stdio: "inherit" });
  console.log(
    `\u2713 Rolled back ${count} commit(s).${isSafe ? " Backup saved in branch." : " All changes discarded."}`,
  );
} catch (e) {
  console.error(
    "Failed to rollback. Make sure you have at least that many commits.",
  );
  process.exit(1);
}

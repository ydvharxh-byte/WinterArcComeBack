import path from "path";
import fs from "fs";
import os from "os";

export function resolveDataDir(): string {
  // 1. Explicit override via environment variable
  if (process.env.STUDY_OS_DATA_DIR) {
    const customDir = path.resolve(process.env.STUDY_OS_DATA_DIR);
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    return customDir;
  }

  // 2. Vercel serverless environment (/tmp is the only writable directory)
  if (process.env.VERCEL) {
    const vercelDir = path.join("/tmp", ".data", "study-os");
    if (!fs.existsSync(vercelDir)) {
      fs.mkdirSync(vercelDir, { recursive: true });
    }
    return vercelDir;
  }

  // 3. Platform & OneDrive detection
  // On Windows or when the project resides in a OneDrive-synced folder (such as Desktop or Documents),
  // PGlite's WASM engine fails to create or unlink lock files (postmaster.pid) because OneDrive's
  // cloud filter driver locks them and marks them as reparse points.
  // This causes: "FATAL: could not create lock file postmaster.pid: Permission denied".
  // Moving the local persistent DB to %LOCALAPPDATA%/study-os/data (or ~/.study-os/data) guarantees
  // reliable local persistence that survives restarts and site reloads.
  const isWindows = process.platform === "win32";
  const isOneDrive = /onedrive/i.test(process.cwd());

  let targetDir: string;
  if (isWindows || isOneDrive) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    targetDir = path.join(localAppData, "study-os", "data");
  } else {
    targetDir = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "study-os");
  }

  // Automatic Migration from legacy in-project .data/study-os
  const legacyDir = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "study-os");
  if (
    legacyDir !== targetDir &&
    fs.existsSync(legacyDir) &&
    (!fs.existsSync(targetDir) || fs.readdirSync(targetDir).length === 0)
  ) {
    try {
      console.log(`[Study OS] Migrating database from ${legacyDir} to ${targetDir}...`);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.cpSync(legacyDir, targetDir, { recursive: true });
      // Remove any stale lock file in copied data
      const stalePid = path.join(targetDir, "postmaster.pid");
      if (fs.existsSync(stalePid)) {
        try {
          fs.unlinkSync(stalePid);
        } catch {}
      }
      console.log("[Study OS] Database migration completed successfully.");
    } catch (migErr) {
      console.error("[Study OS] Failed to copy legacy database:", migErr);
    }
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Clean stale lock file if left over from a previous crash/ungraceful termination
  const pidFile = path.join(targetDir, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {}
  }

  return targetDir;
}

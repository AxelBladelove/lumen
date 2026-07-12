import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const extensionId = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
const targetDir = join(homedir(), ".vscode", "extensions", extensionId);
const exeSuffix = process.platform === "win32" ? ".exe" : "";

// This script exists because the extension is developed in this workspace but
// VS Code's normal (non-debug) window loads it from a separate, static copy
// under ~/.vscode/extensions. Building here does not update that copy by
// itself. Run this after `bun run build` (or `bun run build:local`) so the
// regular VS Code window picks up local changes too.

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requirePath(relative, kind) {
  const fullPath = join(repoRoot, relative);
  if (!existsSync(fullPath)) {
    fail(`Missing ${kind}: ${relative}. Run "bun run build" first.`);
  }
  return fullPath;
}

function requireDirectory(relative) {
  const fullPath = requirePath(relative, "directory");
  if (!statSync(fullPath).isDirectory()) {
    fail(`Expected directory: ${relative}`);
  }
  return fullPath;
}

function requireFile(relative) {
  const fullPath = requirePath(relative, "file");
  if (!statSync(fullPath).isFile()) {
    fail(`Expected file: ${relative}`);
  }
  return fullPath;
}

if (!existsSync(targetDir)) {
  fail(
    `Lumen is not installed yet at ${targetDir}.\n` +
      "Install the packaged .vsix once with `code --install-extension <path-to-vsix>`, " +
      "then re-run this script after every local build to sync changes."
  );
}

const requiredBinaries = ["lumen-engine", "lumen-console-runner"].map(
  (name) => `bin/${name}${exeSuffix}`
);

requireDirectory("frontend/dist");
requireDirectory("extension/out");
requireDirectory("assets");
requireDirectory("content/packages");
for (const binary of requiredBinaries) {
  requireFile(binary);
}

const packageFiles = readdirSync(join(repoRoot, "content", "packages"))
  .filter((name) => name.endsWith(".esex"))
  .sort();
if (packageFiles.length === 0) {
  fail('Missing packages: content/packages/*.esex. Run "bun run build" first.');
}
for (const packageFile of packageFiles) {
  requireFile(join("content", "packages", packageFile));
}

const copies = [
  ["extension/out", "extension/out"],
  ["frontend/dist", "frontend/dist"],
  ["assets", "assets"],
  ["content/packages", "content/packages"]
];

function copyDirectory(from, to) {
  const src = join(repoRoot, from);
  const dest = join(targetDir, to);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

function cleanupStaleBinaries(binDir, binaryName) {
  if (!existsSync(binDir)) {
    return;
  }
  for (const stale of readdirSync(binDir)) {
    if (stale.startsWith(`${binaryName}.old-`)) {
      try {
        rmSync(join(binDir, stale), { force: true });
      } catch {
        // Still held by a running process; another sync can clean it later.
      }
    }
  }
}

function copyBinary(relative) {
  const src = join(repoRoot, relative);
  const dest = join(targetDir, relative);
  const binDir = dirname(dest);
  const binaryName = basename(relative);
  mkdirSync(binDir, { recursive: true });
  cleanupStaleBinaries(binDir, binaryName);

  try {
    cpSync(src, dest);
  } catch (error) {
    if (["EIO", "EBUSY", "EPERM", "EACCES"].includes(error.code) && existsSync(dest)) {
      renameSync(dest, join(binDir, `${binaryName}.old-${Date.now()}`));
      cpSync(src, dest);
      console.warn(`${binaryName} was running; moved the locked binary aside and copied the new one.`);
      return;
    }
    throw error;
  }
}

for (const [from, to] of copies) {
  copyDirectory(from, to);
}
for (const binary of requiredBinaries) {
  copyBinary(binary);
}

cpSync(join(repoRoot, "package.json"), join(targetDir, "package.json"));
cpSync(join(repoRoot, "README.md"), join(targetDir, "readme.md"));

console.log(`Synced local build into ${targetDir}`);
console.log('Reload the VS Code window ("Developer: Reload Window") to pick up the change.');

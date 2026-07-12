import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(repoRoot, "bin");
const packagesDir = join(repoRoot, "content", "packages");
const activitiesDir = join(repoRoot, "content", "activities");
const releaseDir = join(repoRoot, "engine", "target", "release");
const exeSuffix = process.platform === "win32" ? ".exe" : "";
const engineBinary = join(releaseDir, `lumen-engine${exeSuffix}`);
const releaseBinaries = ["lumen-engine", "lumen-console-runner"].map(
  (name) => `${name}${exeSuffix}`
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`Missing ${label}: ${path}`);
  }
}

function requireDir(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    fail(`Missing ${label}: ${path}`);
  }
}

requireDir(activitiesDir, "activities directory");
requireFile(engineBinary, "lumen-engine release binary");
for (const binaryName of releaseBinaries) {
  requireFile(join(releaseDir, binaryName), `release binary ${binaryName}`);
}

rmSync(binDir, { recursive: true, force: true });
mkdirSync(binDir, { recursive: true });
for (const binaryName of releaseBinaries) {
  cpSync(join(releaseDir, binaryName), join(binDir, binaryName));
}

rmSync(packagesDir, { recursive: true, force: true });
mkdirSync(packagesDir, { recursive: true });

const activityDirs = readdirSync(activitiesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (activityDirs.length === 0) {
  fail(`No activity directories found under ${activitiesDir}`);
}

for (const dirName of activityDirs) {
  const activityDir = join(activitiesDir, dirName);
  const manifestPath = join(activityDir, "manifest.json");
  requireFile(manifestPath, `manifest for ${dirName}`);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`Invalid manifest JSON for ${dirName}: ${error.message}`);
  }

  if (!manifest.id || !manifest.version) {
    fail(`Manifest ${manifestPath} must include id and version`);
  }
  if (manifest.id !== dirName) {
    fail(`Manifest id ${manifest.id} does not match directory ${dirName}`);
  }

  const outputPath = join(packagesDir, `${manifest.id}-${manifest.version}.esex`);
  const result = spawnSync(engineBinary, ["build-esex", activityDir, outputPath], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`Failed to build ${basename(outputPath)}`);
  }

  requireFile(outputPath, `package ${basename(outputPath)}`);
  console.log(`Built content/packages/${basename(outputPath)} ${result.stdout.trim()}`);
}

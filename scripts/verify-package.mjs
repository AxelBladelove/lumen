import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const exeSuffix = process.platform === "win32" ? ".exe" : "";
const requiredPaths = [
  "frontend/dist",
  "extension/out",
  "assets",
  `bin/lumen-engine${exeSuffix}`,
  `bin/lumen-console-runner${exeSuffix}`,
  "content/packages"
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const relative of requiredPaths) {
  if (!existsSync(join(repoRoot, relative))) {
    fail(`Missing package asset: ${relative}`);
  }
}

const packageDir = join(repoRoot, "content", "packages");
const packages = readdirSync(packageDir).filter((name) => name.endsWith(".esex")).sort();
if (packages.length === 0) {
  fail("Missing package asset: content/packages/*.esex");
}

for (const packageName of packages) {
  const packagePath = join(packageDir, packageName);
  if (!statSync(packagePath).isFile() || statSync(packagePath).size === 0) {
    fail(`Invalid package asset: content/packages/${packageName}`);
  }
}

console.log(`Verified package assets (${packages.length} .esex files).`);

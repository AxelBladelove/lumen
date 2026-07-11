import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  readFileSync
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const extensionId = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
const targetDir = join(homedir(), ".vscode", "extensions", extensionId);

// This script exists because the extension is developed in this workspace but
// VS Code's normal (non-debug) window loads it from a separate, static copy
// under ~/.vscode/extensions. Building here does not update that copy by
// itself. Run this after `bun run build` (or `bun run build:local`) so the
// regular VS Code window picks up local changes too.

if (!existsSync(targetDir)) {
  console.error(
    `Lumen is not installed yet at ${targetDir}.\n` +
      "Install the packaged .vsix once with `code --install-extension <path-to-vsix>`, " +
      "then re-run this script after every local build to sync changes."
  );
  process.exit(1);
}

const copies = [
  ["extension/out", "extension/out"],
  ["frontend/dist", "frontend/dist"],
  ["assets", "assets"]
];

for (const [from, to] of copies) {
  const src = join(repoRoot, from);
  const dest = join(targetDir, to);
  if (!existsSync(src)) {
    console.warn(`Skipping ${from}: not found. Did you run "bun run build"?`);
    continue;
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

const engineBinaryName = process.platform === "win32" ? "lumen-engine.exe" : "lumen-engine";
const engineBinary = join(repoRoot, "engine", "target", "release", engineBinaryName);
if (existsSync(engineBinary)) {
  const binDir = join(targetDir, "bin");
  mkdirSync(binDir, { recursive: true });

  // Limpieza best-effort de binarios apartados en syncs anteriores.
  for (const stale of readdirSync(binDir)) {
    if (stale.startsWith(`${engineBinaryName}.old-`)) {
      try {
        rmSync(join(binDir, stale), { force: true });
      } catch {
        // Sigue bloqueado por un engine en ejecución; se limpiará en otro sync.
      }
    }
  }

  const target = join(binDir, engineBinaryName);
  try {
    cpSync(engineBinary, target);
  } catch (error) {
    // Windows no permite sobreescribir un exe en ejecución (un VS Code abierto
    // mantiene vivo el engine), pero sí permite renombrarlo. Se aparta el
    // binario bloqueado y se copia el nuevo en su lugar.
    if (["EIO", "EBUSY", "EPERM", "EACCES"].includes(error.code) && existsSync(target)) {
      renameSync(target, join(binDir, `${engineBinaryName}.old-${Date.now()}`));
      cpSync(engineBinary, target);
      console.warn(
        "El engine anterior estaba en ejecución: se apartó el binario bloqueado y se copió el nuevo."
      );
    } else {
      throw error;
    }
  }
} else {
  console.warn(`Skipping engine binary: not found. Did you run "bun run build:engine"?`);
}

cpSync(join(repoRoot, "package.json"), join(targetDir, "package.json"));
cpSync(join(repoRoot, "README.md"), join(targetDir, "readme.md"));

console.log(`Synced local build into ${targetDir}`);
console.log('Reload the VS Code window ("Developer: Reload Window") to pick up the change.');

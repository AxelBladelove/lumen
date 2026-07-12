import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type * as vscode from "vscode";

const externalRunLockPath = path.join(os.tmpdir(), "lumen-external-run.lock");

export type ExternalRunReservation = {
  token: string;
  release(): void;
};

export function resolveConsoleRunnerPath(context: vscode.ExtensionContext): string {
  return path.resolve(context.extensionUri.fsPath, "bin", "lumen-console-runner.exe");
}

export function isExternalRunActive(): boolean {
  if (!existsSync(externalRunLockPath)) return false;

  let pid: number;
  try {
    const lockContents = readFileSync(externalRunLockPath, "utf8").trim();
    const reservation = /^reservation:(\d+):/.exec(lockContents);
    pid = Number(reservation?.[1] ?? lockContents);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      removeStaleLock();
      return false;
    }
  } catch {
    removeStaleLock();
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    removeStaleLock();
    return false;
  }
}

export function acquireExternalRunReservation(): ExternalRunReservation | undefined {
  if (isExternalRunActive()) return undefined;
  const token = randomUUID();
  const contents = `reservation:${process.pid}:${token}`;
  try {
    writeFileSync(externalRunLockPath, contents, { encoding: "utf8", flag: "wx" });
  } catch {
    return undefined;
  }
  return {
    token,
    release() {
      try {
        if (readFileSync(externalRunLockPath, "utf8").trim() === contents) {
          unlinkSync(externalRunLockPath);
        }
      } catch {
        // The runner may already have claimed and removed the reservation.
      }
    }
  };
}

export function launchProgram(options: {
  runnerPath: string;
  exePath: string;
  title: string;
  reservation: ExternalRunReservation;
}): void {
  launchRunner(
    options.runnerPath,
    path.dirname(options.exePath),
    "run",
    [
      "--title",
      options.title,
      "--lock",
      externalRunLockPath,
      "--lock-token",
      options.reservation.token,
      options.exePath
    ],
    options.reservation
  );
}

export function launchReport(options: {
  runnerPath: string;
  reportPath: string;
  title: string;
  exitCode: number;
  reservation: ExternalRunReservation;
}): void {
  launchRunner(
    options.runnerPath,
    path.dirname(options.reportPath),
    "report",
    [
      "--title",
      options.title,
      "--lock",
      externalRunLockPath,
      "--lock-token",
      options.reservation.token,
      "--exit-code",
      String(options.exitCode),
      options.reportPath
    ],
    options.reservation
  );
}

function launchRunner(
  runnerPath: string,
  workingDir: string,
  mode: "run" | "report",
  args: string[],
  reservation: ExternalRunReservation
): void {
  if (process.platform !== "win32") {
    throw new Error("Lumen currently only launches external consoles on Windows.");
  }

  const runnerArguments = [mode, ...args].map(quoteForCmd).join(" ");
  // `start` treats its first quoted argument as the window title. The nested
  // cmd /c uses the same doubled-quote pattern as the previous external launcher
  // so executable paths containing spaces survive cmd's outer quote stripping.
  const commandLine = `start "" /D ${quoteForCmd(workingDir)} cmd /c ""${runnerPath}" ${runnerArguments}"`;
  const child = spawn("cmd.exe", ["/s", "/c", commandLine], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    windowsVerbatimArguments: true
  });
  child.on("error", () => reservation.release());
  // `start` detaches before the real runner claims the token. If cmd/runner
  // never reaches that point, release our reservation instead of wedging F9/F10
  // for the lifetime of the Extension Host. Once claimed, release() is a no-op.
  const claimWatchdog = setTimeout(() => reservation.release(), 5_000);
  claimWatchdog.unref();
  child.unref();
}

function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function removeStaleLock(): void {
  try {
    unlinkSync(externalRunLockPath);
  } catch {
    // Another process may already have removed the stale lock.
  }
}

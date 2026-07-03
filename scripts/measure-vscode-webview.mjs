import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { inflateSync } from "node:zlib";
import { execFile, spawn } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const port = Number(process.env.VSCODE_CDP_PORT ?? 9337);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const iterations = Number(process.env.VSCODE_PERF_ITERATIONS ?? 30);
const warmups = Number(process.env.VSCODE_PERF_WARMUPS ?? 5);
const targetPattern = process.env.VSCODE_WEBVIEW_TARGET ?? "";
const resetMode = process.env.VSCODE_RESET_MODE ?? "process";
const codeExecutable = process.env.VSCODE_CODE_EXE ?? "C:\\Users\\axelb\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe";
const autoOpenSentinel = join(root, ".lumen-perf-auto-open");
const visualThreshold = Number(process.env.VSCODE_VISUAL_THRESHOLD ?? 0.001);
const visualChannelThreshold = Number(process.env.VSCODE_VISUAL_CHANNEL_THRESHOLD ?? 20);

process.on("exit", () => {
  if (resetMode === "process" || resetMode === "window") {
    try {
      rmSync(autoOpenSentinel, { force: true });
    } catch {}
  }
});

const states = [
  { name: "main-path-module", kind: "main" },
  { name: "completed-node-review", kind: "review" },
  { name: "node-to-node-transition", kind: "next-transition" }
];

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result ?? {});
        }
        return;
      }

      const listeners = this.listeners.get(message.method);
      if (listeners) {
        for (const listener of listeners) listener(message.params ?? {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, 20000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const listener = (params) => {
        this.off(method, listener);
        resolve(params);
      };
      this.on(method, listener);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
  }

  off(method, listener) {
    const listeners = this.listeners.get(method);
    if (!listeners) return;
    listeners.delete(listener);
    if (!listeners.size) this.listeners.delete(method);
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  const resultsDirectory = join(root, "perf", "results");
  const visualDirectory = join(root, "perf", "visual", timestamp, "vscode");
  const baselineVisualDirectory = join(root, "perf", "baselines", "vscode-visual");
  await mkdir(resultsDirectory, { recursive: true });
  await mkdir(visualDirectory, { recursive: true });
  await mkdir(baselineVisualDirectory, { recursive: true });

  let lastTarget;
  let lastScreenshotTarget;

  const withClients =
    resetMode === "process" ? withFreshProcessClients :
    resetMode === "window" ? withFreshWindowClients :
    withExistingWebviewClients;

  const runs = [];
  const visualChecks = [];

  for (const state of states) {
    for (let index = 0; index < warmups + iterations; index += 1) {
      await withClients(async ({ client, target, screenshotTarget }) => {
        lastTarget = target;
        lastScreenshotTarget = screenshotTarget;
        const result = resetMode === "webview"
          ? await reloadAndMeasure(client, state, index)
          : await measureState(client, state, index);
        if (index >= warmups) runs.push(result);
      });
    }
  }

  for (const state of states) {
    await withClients(async ({ client, screenshotClient, target, screenshotTarget }) => {
      lastTarget = target;
      lastScreenshotTarget = screenshotTarget;
      const visualRun = await captureVisualState(client, screenshotClient, state, warmups + iterations);
      visualChecks.push(await processVisualCheck(visualRun, visualDirectory, baselineVisualDirectory));
    });
  }

  const summary = {
      capturedAt: new Date().toISOString(),
      harnessVersion: 2,
      objectiveMetric: "p95 VS Code webview visual-complete under 50 ms with visual regression",
      conditions: {
        target: lastTarget?.title ?? null,
        screenshotTarget: lastScreenshotTarget?.title ?? lastTarget?.title ?? null,
        url: lastTarget?.url ?? null,
        iterations,
        warmups,
        cache:
          resetMode === "process" ? "VS Code process restart and Lumen view reopen" :
          resetMode === "window" ? "VS Code window reload and Lumen view reopen" :
          resetMode === "webview" ? "VS Code webview runtime reload" :
          "VS Code webview runtime reload",
        port,
        resetMode,
        routeOrder: states.map((state) => `vscode-webview-route-path:${state.name}`)
      },
      summaries: summarizeRuns(runs),
      visualChecks,
      runs
  };

  const jsonPath = join(resultsDirectory, `${timestamp}-vscode-summary.json`);
  const mdPath = join(resultsDirectory, `${timestamp}-vscode-summary.md`);
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(mdPath, renderMarkdown(summary), "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, summaries: summary.summaries, visualChecks }, null, 2));
  if (resetMode === "process" || resetMode === "window") await rm(autoOpenSentinel, { force: true });
}

async function reloadAndMeasure(client, state, index) {
  await reloadWebview(client);

  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await measureState(client, state, index);
      if (result.loadMs > 0) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw lastError ?? new Error("Timed out waiting for webview reload metrics");
}

async function measureState(client, state, index) {
  const ready = await waitForRouteReady(client);
  let stateMetric = {};
  if (state.kind === "review") stateMetric = await measureReviewState(client);
  if (state.kind === "next-transition") stateMetric = await measureNextTransition(client);
  const metrics = await readPageMetrics(client);
  return {
    page: "vscode-webview-route-path",
    path: "lumen.routePath",
    state: state.name,
    kind: state.kind,
    index,
    ...metrics,
    routeVisualCompleteMs: round(ready.visualCompleteMs),
    routeInteractiveMs: round(ready.interactiveMs),
    ...stateMetric
  };
}

async function captureVisualState(client, screenshotClient, state, index) {
  if (resetMode === "webview") await reloadWebview(client);
  await waitForRouteReady(client);
  await waitForIntroHidden(client);
  if (state.kind === "review") await measureReviewState(client);
  if (state.kind === "next-transition") await measureNextTransition(client);
  await freezeVisualAnimations(client);
  await waitForTwoFrames(client);
  const clip = await readLumenWebviewClip(screenshotClient);
  const screenshot = await screenshotClient.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    ...(clip ? { clip } : {})
  });
  return {
    page: "vscode-webview-route-path",
    state: state.name,
    index,
    base64: screenshot.data
  };
}

async function waitForIntroHidden(client) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      const startedAt = performance.now();
      const deadline = startedAt + 3000;
      function loop() {
        const frame = document.getElementById("active-frame");
        const lumenWindow = frame?.contentWindow ?? window;
        const lumenDocument = lumenWindow.document;
        if (!lumenDocument.querySelector(".lumen-intro") || performance.now() > deadline) {
          resolve();
          return;
        }
        lumenWindow.requestAnimationFrame(loop);
      }
      loop();
    })`
  });
}

async function readLumenWebviewClip(screenshotClient) {
  const result = await screenshotClient.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const frame = [...document.querySelectorAll("iframe.webview.ready")]
        .find((candidate) => candidate.src.includes("extensionId=lumen.lumen"));
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      return {
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        scale: 1
      };
    })()`
  });
  return result.result.value ?? null;
}

async function withFreshWindowClients(callback) {
  await writeFile(autoOpenSentinel, `${new Date().toISOString()}\n`, "utf8");
  await reloadWorkbenchWindow();
  await delay(8500);
  return withExistingWebviewClients(callback);
}

async function withFreshProcessClients(callback) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await restartVsCodeProcess();
      await waitForWorkbenchTarget();
      await focusVsCodeWindow();
      await delay(12000);
      await focusVsCodeWindow();
      return await withExistingWebviewClients(callback);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Unable to start VS Code and attach to Lumen webview");
}

async function withExistingWebviewClients(callback) {
  const target = await findWebviewTarget();
  const screenshotTarget = await findTopLevelTarget(target);
  const client = await connect(target.webSocketDebuggerUrl);
  const screenshotClient = screenshotTarget ? await connect(screenshotTarget.webSocketDebuggerUrl) : client;

  try {
    await client.send("Runtime.enable");
    if (screenshotClient !== client) await screenshotClient.send("Page.enable");
    return await callback({ client, screenshotClient, target, screenshotTarget });
  } finally {
    if (screenshotClient !== client) screenshotClient.close();
    client.close();
  }
}

async function restartVsCodeProcess() {
  await writeFile(autoOpenSentinel, `${new Date().toISOString()}\n`, "utf8");
  await new Promise((resolve) => {
    execFile("taskkill", ["/IM", "Code.exe", "/F"], () => resolve());
  });
  await delay(2000);
  const child = spawn(codeExecutable, [`--remote-debugging-port=${port}`, root], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LUMEN_PERF_AUTO_OPEN: "1"
    }
  });
  child.unref();
}

async function focusVsCodeWindow() {
  const command = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$window = Get-Process Code -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Sort-Object StartTime -Descending |
  Select-Object -First 1
if ($window) {
  [Win32]::ShowWindowAsync($window.MainWindowHandle, 9) | Out-Null
  [Win32]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
}
`;
  await new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      () => resolve()
    );
  });
}

async function reloadWorkbenchWindow() {
  const target = await findWorkbenchTarget();
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    await client.send("Page.reload", { ignoreCache: false });
  } finally {
    client.close();
  }
}

async function waitForWorkbenchTarget() {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await findWorkbenchTarget();
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw lastError ?? new Error("Timed out waiting for VS Code workbench target");
}

async function runWorkbenchCommand(command) {
  const target = await findWorkbenchTarget();
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await dispatchKey(client, "keyDown", "Control", "ControlLeft", 17, 2);
    await dispatchKey(client, "keyDown", "Shift", "ShiftLeft", 16, 10);
    await dispatchKey(client, "keyDown", "P", "KeyP", 80, 10);
    await dispatchKey(client, "keyUp", "P", "KeyP", 80, 10);
    await dispatchKey(client, "keyUp", "Shift", "ShiftLeft", 16, 2);
    await dispatchKey(client, "keyUp", "Control", "ControlLeft", 17, 0);
    await delay(1000);
    await dispatchKey(client, "keyDown", "Control", "ControlLeft", 17, 2);
    await dispatchKey(client, "keyDown", "A", "KeyA", 65, 2);
    await dispatchKey(client, "keyUp", "A", "KeyA", 65, 2);
    await dispatchKey(client, "keyUp", "Control", "ControlLeft", 17, 0);
    await delay(100);
    await client.send("Input.insertText", { text: command });
    await dispatchKey(client, "keyDown", "Enter", "Enter", 13, 0);
    await dispatchKey(client, "keyUp", "Enter", "Enter", 13, 0);
  } finally {
    client.close();
  }
}

async function closeActiveEditor() {
  const target = await findWorkbenchTarget();
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await dispatchKey(client, "keyDown", "Control", "ControlLeft", 17, 2);
    await dispatchKey(client, "keyDown", "w", "KeyW", 87, 2);
    await dispatchKey(client, "keyUp", "w", "KeyW", 87, 2);
    await dispatchKey(client, "keyUp", "Control", "ControlLeft", 17, 0);
  } finally {
    client.close();
  }
}

async function dispatchKey(client, type, key, code, windowsVirtualKeyCode, modifiers) {
  await client.send("Input.dispatchKeyEvent", {
    type,
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    modifiers
  });
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function reloadWebview(client) {
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      setTimeout(() => location.reload(), 0);
    })()`
  }).catch(() => undefined);
}

async function waitForRouteReady(client) {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      function lumenContext() {
        const frame = document.getElementById("active-frame");
        const lumenWindow = frame?.contentWindow ?? window;
        return { lumenWindow, lumenDocument: lumenWindow.document };
      }
      const startedAt = performance.now();
      const deadline = startedAt + 10000;
      function marks() {
        const { lumenWindow } = lumenContext();
        return Object.fromEntries(lumenWindow.performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      }
      function ready() {
        const { lumenWindow, lumenDocument } = lumenContext();
        const currentMarks = marks();
        const hero = lumenDocument.querySelector(".hero-sticker-shell img");
        return {
          marks: currentMarks,
          routePresent: Boolean(lumenDocument.querySelector(".route-stage")),
          canvasPresent: Boolean(lumenDocument.querySelector("canvas")),
          nodeCount: lumenDocument.querySelectorAll(".route-node").length,
          heroReady: Boolean(hero && hero.complete && hero.naturalWidth > 0),
          webglReady: Boolean(currentMarks["lumen:webgl-first-render"] && lumenWindow.__LUMEN_WEBGL_STATS__?.renderCount > 0)
        };
      }
      function loop() {
        const state = ready();
        if (state.routePresent && state.canvasPresent && state.nodeCount >= 7 && state.heroReady && state.webglReady) {
          const { lumenWindow } = lumenContext();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const done = lumenWindow.performance.now();
            const routeStart = state.marks["lumen:route-mounted"] ?? state.marks["lumen:app-mounted"] ?? 0;
            const visualCompleteAt = state.marks["lumen:route-visual-complete"] ?? done;
            const interactiveAt = state.marks["lumen:route-interactive"] ?? visualCompleteAt;
            resolve({
              ...state,
              visualCompleteMs: visualCompleteAt - routeStart,
              interactiveMs: interactiveAt - routeStart,
              observedAt: done
            });
          }));
          return;
        }
        if (performance.now() > deadline) {
          const { lumenWindow } = lumenContext();
          resolve({ ...state, timedOut: true, observedAt: lumenWindow.performance.now(), visualCompleteMs: null, interactiveMs: null });
          return;
        }
        const { lumenWindow } = lumenContext();
        requestAnimationFrame(loop);
      }
      loop();
    })`
  });
  return result.result.value;
}

async function measureReviewState(client) {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const frame = document.getElementById("active-frame");
      const lumenWindow = frame?.contentWindow ?? window;
      const lumenDocument = lumenWindow.document;
      const candidates = [...lumenDocument.querySelectorAll(".route-node.completed")];
      const target = candidates[0];
      const start = lumenWindow.performance.now();
      if (!target) {
        resolve({ reviewStateMs: null, reviewTargetFound: false });
        return;
      }
      target.click();
      lumenWindow.requestAnimationFrame(() => lumenWindow.requestAnimationFrame(() => {
        resolve({
          reviewStateMs: lumenWindow.performance.now() - start,
          reviewTargetFound: true,
          reviewRepeatVisible: Boolean(lumenDocument.querySelector(".route-node.review-repeat"))
        });
      }));
    })`
  });
  return mapRounded(result.result.value);
}

async function measureNextTransition(client) {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const frame = document.getElementById("active-frame");
      const lumenWindow = frame?.contentWindow ?? window;
      const lumenDocument = lumenWindow.document;
      const button = lumenDocument.querySelector(".bottom-cta button:not(:disabled)");
      const start = lumenWindow.performance.now();
      if (!button) {
        resolve({ snakeTransitionLatencyMs: null, nodeTransitionFullMs: null, nextButtonFound: false });
        return;
      }
      button.dispatchEvent(new lumenWindow.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse" }));
      const deadline = start + 3600;
      function marks() {
        return Object.fromEntries(lumenWindow.performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      }
      function loop() {
        const currentMarks = marks();
        const firstFrame = currentMarks["lumen:route-advance-first-frame"];
        const routeStart = currentMarks["lumen:route-advance-start"];
        const stableAfterContractAnimations = routeStart && lumenWindow.performance.now() - routeStart >= 1800;
        if (firstFrame && routeStart && stableAfterContractAnimations) {
          lumenWindow.requestAnimationFrame(() => lumenWindow.requestAnimationFrame(() => {
            resolve({
              nextButtonFound: true,
              snakeTransitionLatencyMs: firstFrame - routeStart,
              nodeTransitionFullMs: lumenWindow.performance.now() - routeStart
            });
          }));
          return;
        }
        if (lumenWindow.performance.now() > deadline) {
          resolve({
            nextButtonFound: true,
            timedOut: true,
            snakeTransitionLatencyMs: firstFrame && routeStart ? firstFrame - routeStart : null,
            nodeTransitionFullMs: routeStart ? lumenWindow.performance.now() - routeStart : null
          });
          return;
        }
        lumenWindow.requestAnimationFrame(loop);
      }
      loop();
    })`
  });
  return mapRounded(result.result.value);
}

async function readPageMetrics(client) {
  const metrics = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const frame = document.getElementById("active-frame");
      const lumenWindow = frame?.contentWindow ?? window;
      const lumenDocument = lumenWindow.document;
      const nav = lumenWindow.performance.getEntriesByType("navigation")[0];
      const marks = Object.fromEntries(lumenWindow.performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      const measures = Object.fromEntries(lumenWindow.performance.getEntriesByType("measure").map((entry) => [entry.name, entry.duration]));
      return {
        domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
        loadMs: nav.loadEventEnd - nav.startTime,
        appMountedMs: marks["lumen:app-mounted"] ?? null,
        routeMountedMs: marks["lumen:route-mounted"] ?? null,
        webglMountedMs: marks["lumen:webgl-mounted"] ?? null,
        webglFirstRenderMs: marks["lumen:webgl-first-render"] ?? null,
        webglImportMs: measures["lumen:webgl-import"] ?? null,
        webglContextMs: measures["lumen:webgl-context"] ?? null,
        webglPathSampleMs: measures["lumen:webgl-path-sample"] ?? null,
        webglPipelineMs: measures["lumen:webgl-pipeline"] ?? null,
        webglSegmentsMs: measures["lumen:webgl-segments"] ?? null,
        webglTexturesMs: measures["lumen:webgl-textures"] ?? null,
        webglTextureBodyMs: measures["lumen:webgl-texture-body"] ?? null,
        webglTextureBodyUploadMs: measures["lumen:webgl-texture-body-upload"] ?? null,
        webglTextureCapLeftMs: measures["lumen:webgl-texture-cap-left"] ?? null,
        webglTextureCapLeftUploadMs: measures["lumen:webgl-texture-cap-left-upload"] ?? null,
        webglTextureCapRightMs: measures["lumen:webgl-texture-cap-right"] ?? null,
        webglTextureCapRightUploadMs: measures["lumen:webgl-texture-cap-right-upload"] ?? null,
        webglMountedToFirstRenderMs: measures["lumen:webgl-mounted-to-first-render"] ?? null,
        routeRenderToVisualCompleteMs: measures["lumen:route-render-to-visual-complete"] ?? null,
        routePresent: Boolean(lumenDocument.querySelector(".route-stage")),
        canvasPresent: Boolean(lumenDocument.querySelector("canvas")),
        nodeCount: lumenDocument.querySelectorAll(".route-node").length,
        webglStats: lumenWindow.__LUMEN_WEBGL_STATS__ ?? null,
        scriptBytes: lumenWindow.performance.getEntriesByType("resource")
          .filter((entry) => entry.initiatorType === "script")
          .reduce((total, entry) => total + (entry.transferSize || 0), 0)
      };
    })()`
  });

  return mapRounded(metrics.result.value);
}

async function measureFrameStats(client) {
  const sample = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const waitStarted = performance.now();
      const intervals = [];
      let started = 0;
      let last = 0;
      function ready() {
        return Boolean(performance.getEntriesByName("lumen:webgl-first-render").length);
      }
      function frame(now) {
        if (!started) {
          started = now;
          last = now;
          requestAnimationFrame(frame);
          return;
        }
        intervals.push(now - last);
        last = now;
        if (now - started >= 1800) {
          const sorted = intervals.slice().sort((a, b) => a - b);
          const sum = intervals.reduce((total, value) => total + value, 0);
          resolve({
            frames: intervals.length,
            avgFrameMs: intervals.length ? sum / intervals.length : null,
            p95FrameMs: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null,
            maxFrameMs: sorted.length ? sorted[sorted.length - 1] : null,
            overBudgetFrames: intervals.filter((value) => value > 20).length
          });
          return;
        }
        requestAnimationFrame(frame);
      }
      function wait() {
        if (ready() || performance.now() - waitStarted > 3500) {
          requestAnimationFrame(frame);
          return;
        }
        requestAnimationFrame(wait);
      }
      wait();
    })`
  });

  const value = sample.result.value;
  return {
    ...value,
    avgFrameMs: round(value.avgFrameMs),
    p95FrameMs: round(value.p95FrameMs),
    maxFrameMs: round(value.maxFrameMs)
  };
}

async function readWebglStats(client) {
  const stats = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `window.__LUMEN_WEBGL_STATS__ ?? null`
  });
  const value = stats.result.value;
  if (!value) return null;
  return {
    ...value,
    effectiveRenderScale: round(value.effectiveRenderScale),
    lastRenderMs: round(value.lastRenderMs),
    avgRenderMs: round(value.avgRenderMs),
    maxRenderMs: round(value.maxRenderMs),
    targetFrameInterval: round(value.targetFrameInterval),
    bloomStrength: round(value.bloomStrength),
    bloomRadius: round(value.bloomRadius)
  };
}

async function freezeVisualAnimations(client) {
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      const frame = document.getElementById("active-frame");
      const lumenWindow = frame?.contentWindow ?? window;
      const lumenDocument = lumenWindow.document;
      for (const svg of lumenDocument.querySelectorAll("svg")) {
        try {
          if (typeof svg.setCurrentTime === "function") svg.setCurrentTime(0);
          if (typeof svg.pauseAnimations === "function") svg.pauseAnimations();
        } catch {}
      }
      for (const animation of lumenDocument.getAnimations({ subtree: true })) {
        try {
          animation.pause();
          animation.currentTime = 0;
        } catch {}
      }
    })()`
  });
}

async function waitForTwoFrames(client) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      const frame = document.getElementById("active-frame");
      const lumenWindow = frame?.contentWindow ?? window;
      lumenWindow.requestAnimationFrame(() => lumenWindow.requestAnimationFrame(resolve));
    })`
  });
}

async function processVisualCheck(visualRun, visualDirectory, baselineDirectory) {
  const fileName = `${visualRun.page}-${visualRun.state}.png`;
  const currentPath = join(visualDirectory, fileName);
  const baselinePath = join(baselineDirectory, fileName);
  const current = Buffer.from(visualRun.base64, "base64");
  await writeFile(currentPath, current);

  if (!existsSync(baselinePath)) {
    await writeFile(baselinePath, current);
    return {
      page: visualRun.page,
      state: visualRun.state,
      result: "baseline-created",
      currentPath,
      baselinePath
    };
  }

  const baseline = await readFile(baselinePath);
  const diff = comparePngBuffers(baseline, current);
  return {
    page: visualRun.page,
    state: visualRun.state,
    result: diff.diffRatio <= visualThreshold ? "pass" : "fail",
    currentPath,
    baselinePath,
    threshold: visualThreshold,
    ...diff
  };
}

function comparePngBuffers(aBuffer, bBuffer) {
  const a = readPng(aBuffer);
  const b = readPng(bBuffer);
  if (a.width !== b.width || a.height !== b.height) {
    return {
      dimensionsMatch: false,
      diffPixels: a.width * a.height,
      diffRatio: 1,
      maxChannelDelta: 255
    };
  }

  let diffPixels = 0;
  let maxChannelDelta = 0;
  const comparedPixels = a.width * a.height;
  for (let index = 0; index < comparedPixels; index += 1) {
    const offset = index * 4;
    const delta = Math.max(
      Math.abs(a.data[offset] - b.data[offset]),
      Math.abs(a.data[offset + 1] - b.data[offset + 1]),
      Math.abs(a.data[offset + 2] - b.data[offset + 2]),
      Math.abs(a.data[offset + 3] - b.data[offset + 3])
    );
    maxChannelDelta = Math.max(maxChannelDelta, delta);
    if (delta > visualChannelThreshold) diffPixels += 1;
  }

  return {
    dimensionsMatch: true,
    comparedPixels,
    diffPixels,
    diffRatio: comparedPixels ? diffPixels / comparedPixels : 1,
    maxChannelDelta
  };
}

function readPng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Invalid PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(rowBytes * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawValue = inflated[inputOffset++];
      const left = x >= channels ? raw[rowStart + x - channels] : 0;
      const up = y > 0 ? raw[rowStart + x - rowBytes] : 0;
      const upLeft = y > 0 && x >= channels ? raw[rowStart + x - rowBytes - channels] : 0;
      raw[rowStart + x] = unfilter(filter, rawValue, left, up, upLeft);
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = raw[pixel * channels];
    rgba[pixel * 4 + 1] = raw[pixel * channels + 1];
    rgba[pixel * 4 + 2] = raw[pixel * channels + 2];
    rgba[pixel * 4 + 3] = channels === 4 ? raw[pixel * channels + 3] : 255;
  }

  return { width, height, data: rgba };
}

function unfilter(filter, value, left, up, upLeft) {
  if (filter === 0) return value;
  if (filter === 1) return (value + left) & 255;
  if (filter === 2) return (value + up) & 255;
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 255;
  if (filter === 4) return (value + paeth(left, up, upLeft)) & 255;
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

async function findWebviewTarget() {
  const deadline = Date.now() + 20000;
  let lastCandidates = [];
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) throw new Error(`Unable to list VS Code CDP targets: ${response.status}`);
    const targets = await response.json();
    const candidates = targets.filter((candidate) =>
      candidate.type === "iframe" &&
      `${candidate.title ?? ""} ${candidate.url ?? ""}`.includes("vscode-webview://")
    );
    lastCandidates = candidates;

    if (targetPattern) {
      const explicitMatches = candidates.filter((candidate) =>
        `${candidate.title ?? ""} ${candidate.url ?? ""}`.includes(targetPattern)
      );
      for (const candidate of explicitMatches) {
        if (await isLumenWebviewTarget(candidate)) return candidate;
      }
    }

    for (const candidate of candidates) {
      if (await isLumenWebviewTarget(candidate)) return candidate;
    }

    await delay(250);
  }

  const candidateSummary = lastCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    url: candidate.url
  }));
  throw new Error(
    `Unable to find Lumen VS Code webview target. Candidates: ${JSON.stringify(candidateSummary, null, 2)}`
  );
}

async function findWorkbenchTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`Unable to list VS Code CDP targets: ${response.status}`);
  const targets = await response.json();
  const target = targets.find((candidate) =>
    candidate.type === "page" &&
    /Visual Studio Code/.test(candidate.title ?? "") &&
    /workbench\.html/.test(candidate.url ?? "")
  );
  if (!target) {
    throw new Error(`Unable to find VS Code workbench target on port ${port}`);
  }
  return target;
}

async function findTopLevelTarget(webviewTarget) {
  if (!webviewTarget.parentId) return null;
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`Unable to list VS Code CDP targets: ${response.status}`);
  const targets = await response.json();
  return targets.find((candidate) => candidate.id === webviewTarget.parentId) ?? null;
}

async function isLumenWebviewTarget(target) {
  let client;
  try {
    client = await connect(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    const result = await client.send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((resolve) => {
        const deadline = performance.now() + 10000;
        function check() {
          const frame = document.getElementById("active-frame");
          const lumenWindow = frame?.contentWindow ?? window;
          const lumenDocument = lumenWindow.document;
          const hasLumenRoute =
            Boolean(lumenDocument.querySelector("canvas")) ||
            Boolean(lumenDocument.querySelector(".bottom-cta")) ||
            Boolean(lumenDocument.querySelector(".route-node")) ||
            Boolean(lumenWindow.__LUMEN_WEBGL_STATS__);
          if (hasLumenRoute || performance.now() > deadline) {
            resolve(hasLumenRoute);
            return;
          }
          requestAnimationFrame(check);
        }
        check();
      })`
    });
    return Boolean(result.result.value);
  } catch {
    return false;
  } finally {
    client?.close();
  }
}

async function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpClient(socket);
}

function summarize(results, field) {
  const values = results
    .map((result) => result[field])
    .filter((value) => typeof value === "number")
    .sort((a, b) => a - b);

  return {
    min: round(values[0]),
    median: round(values[Math.floor(values.length / 2)]),
    p95: round(values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]),
    max: round(values[values.length - 1])
  };
}

function summarizeRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.page}:${run.state}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const routeVisualCompleteMs = summarize(group, "routeVisualCompleteMs");
    return {
      page: first.page,
      state: first.state,
      kind: first.kind,
      iterationCount: group.length,
      routeVisualCompleteMs,
      routeInteractiveMs: summarize(group, "routeInteractiveMs"),
      domContentLoadedMs: summarize(group, "domContentLoadedMs"),
      loadMs: summarize(group, "loadMs"),
      webglImportMs: summarize(group, "webglImportMs"),
      webglContextMs: summarize(group, "webglContextMs"),
      webglTexturesMs: summarize(group, "webglTexturesMs"),
      webglMountedToFirstRenderMs: summarize(group, "webglMountedToFirstRenderMs"),
      snakeTransitionLatencyMs: summarize(group, "snakeTransitionLatencyMs"),
      nodeTransitionFullMs: summarize(group, "nodeTransitionFullMs"),
      reviewStateMs: summarize(group, "reviewStateMs"),
      passUnder50ms: typeof routeVisualCompleteMs.p95 === "number" && routeVisualCompleteMs.p95 < 50
    };
  });
}

function renderMarkdown(summary) {
  const lines = [
    "# VS Code Webview Perf Summary",
    "",
    `Captured: ${summary.capturedAt}`,
    "",
    "| State | Visual p95 | Load p95 | WebGL first render p95 | Pass <50ms |",
    "| --- | ---: | ---: | ---: | --- |"
  ];

  for (const item of summary.summaries) {
    lines.push(
      `| ${item.state} | ${item.routeVisualCompleteMs.p95 ?? "n/a"} | ${item.loadMs.p95 ?? "n/a"} | ${item.webglMountedToFirstRenderMs.p95 ?? "n/a"} | ${item.passUnder50ms ? "yes" : "no"} |`
    );
  }

  lines.push("", "## Visual Checks", "");
  for (const check of summary.visualChecks) {
    lines.push(`- ${check.state}: ${check.result} (${check.diffPixels ?? 0} diff pixels)`);
  }
  return `${lines.join("\n")}\n`;
}

function mapRounded(value) {
  if (Array.isArray(value)) return value.map(mapRounded);
  if (!value || typeof value !== "object") return round(value) ?? value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapRounded(entry)]));
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

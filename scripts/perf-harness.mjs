import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir, cpus, platform, release, arch } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\axelb\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe";
const cdpPort = Number(process.env.PERF_CDP_PORT ?? 9341);
const previewPort = Number(process.env.PERF_PREVIEW_PORT ?? 4175);
const origin = process.env.PERF_ORIGIN ?? `http://127.0.0.1:${previewPort}`;
const iterations = Number(process.env.PERF_ITERATIONS ?? 30);
const warmups = Number(process.env.PERF_WARMUPS ?? 5);
const width = Number(process.env.PERF_WIDTH ?? 420);
const height = Number(process.env.PERF_HEIGHT ?? 820);
const deviceScaleFactor = Number(process.env.PERF_DSF ?? 1);
const visualThreshold = Number(process.env.PERF_VISUAL_THRESHOLD ?? 0.001);
const visualChannelThreshold = Number(process.env.PERF_VISUAL_CHANNEL_THRESHOLD ?? 20);
const keepPreview = process.env.PERF_KEEP_PREVIEW === "1";

const pages = [
  {
    name: "route-path",
    path: "/",
    states: [
      { name: "loading-screen", kind: "loading" },
      { name: "main-path-module", kind: "main" },
      { name: "completed-node-review", kind: "review" },
      { name: "node-to-node-transition", kind: "next-transition" }
    ]
  }
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
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
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
      this.pending.set(id, { resolve, reject });
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
  const visualDirectory = join(root, "perf", "visual", timestamp);
  const baselineVisualDirectory = join(root, "perf", "baselines", "visual");
  await mkdir(resultsDirectory, { recursive: true });
  await mkdir(visualDirectory, { recursive: true });
  await mkdir(baselineVisualDirectory, { recursive: true });

  const preview = process.env.PERF_ORIGIN ? null : await startPreview();
  const profileDir = await mkdir(join(tmpdir(), `lumen-perf-${timestamp}`), { recursive: true }).then(() =>
    join(tmpdir(), `lumen-perf-${timestamp}`)
  );
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-features=Translate,BackForwardCache",
      "--autoplay-policy=no-user-gesture-required",
      "about:blank"
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  try {
    await waitForCdp();
    const runs = [];
    const visualChecks = [];

    for (const page of pages) {
      for (const state of page.states) {
        for (let index = 0; index < warmups + iterations; index += 1) {
          const run = await withFreshPage(page, state, index, false, measureState);
          if (index >= warmups) runs.push(run);
        }
      }

      for (const state of page.states) {
        const visualRun = await withFreshPage(page, state, warmups + iterations, true, captureVisualState);
        visualChecks.push(
          await processVisualCheck(visualRun, visualDirectory, baselineVisualDirectory)
        );
      }
    }

    const summary = {
      capturedAt: new Date().toISOString(),
      harnessVersion: 1,
      objectiveMetric: "p95 route/page visual-complete internal load under 50 ms",
      conditions: await readConditions(),
      discoveredPages: pages,
      summaries: summarizeRuns(runs),
      visualChecks,
      runs
    };

    const jsonPath = join(resultsDirectory, `${timestamp}-summary.json`);
    const mdPath = join(resultsDirectory, `${timestamp}-summary.md`);
    await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await writeFile(mdPath, renderMarkdown(summary), "utf8");

    console.log(JSON.stringify({ jsonPath, mdPath, summaries: summary.summaries, visualChecks }, null, 2));
  } finally {
    killProcessTree(chrome);
    if (preview && !keepPreview) killProcessTree(preview);
  }
}

async function startPreview() {
  const preview = spawn(
    "bun",
    ["run", "--cwd", "frontend", "preview", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"],
    { cwd: root, stdio: "ignore" }
  );
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return preview;
    } catch {
      await sleep(120);
    }
  }
  killProcessTree(preview);
  throw new Error(`Timed out waiting for Vite preview at ${origin}`);
}

function killProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill();
}

async function withFreshPage(page, state, index, visualMode, callback) {
  const tab = await createTab();
  const client = await connect(tab.webSocketDebuggerUrl);
  try {
    await prepareClient(client);
    await client.send("Network.clearBrowserCache");
    const url = buildUrl(page, state, index, visualMode);
    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url });
    await loadEvent;
    return await callback(client, page, state, index, visualMode);
  } finally {
    client.close();
    await closeTab(tab.id);
  }
}

async function measureState(client, page, state, index) {
  const base = { page: page.name, path: page.path, state: state.name, kind: state.kind, index };
  const ready = await waitForRouteReady(client);
  let stateMetric = {};

  if (state.kind === "review") {
    stateMetric = await measureReviewState(client);
  } else if (state.kind === "next-transition") {
    stateMetric = await measureNextTransition(client);
  }

  const metrics = await readPageMetrics(client);
  return {
    ...base,
    ...metrics,
    routeVisualCompleteMs: round(ready.visualCompleteMs),
    routeInteractiveMs: round(ready.interactiveMs),
    loadingScreenMs: round(metrics.marks["lumen:intro-hidden"] - metrics.marks["lumen:app-mounted"]),
    ...stateMetric
  };
}

async function captureVisualState(client, page, state, index) {
  if (state.kind === "loading") {
    await waitForLoadingScreen(client);
    await sleepInPage(client, 1600);
    await freezeVisualAnimations(client);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    return {
      page: page.name,
      state: state.name,
      index,
      base64: screenshot.data,
      metrics: await readPageMetrics(client),
      masks: []
    };
  }

  await waitForRouteReady(client);
  await waitForIntroHidden(client);
  if (state.kind === "review") await measureReviewState(client);
  if (state.kind === "next-transition") await measureNextTransition(client);
  await freezeVisualAnimations(client);
  await waitForTwoFrames(client);
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  return {
    page: page.name,
    state: state.name,
    index,
    base64: screenshot.data,
    metrics: await readPageMetrics(client),
    masks: []
  };
}

async function waitForIntroHidden(client) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      const deadline = performance.now() + 8000;
      function loop() {
        if (!document.querySelector(".lumen-intro")) {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
          return;
        }
        if (performance.now() > deadline) {
          resolve();
          return;
        }
        requestAnimationFrame(loop);
      }
      loop();
    })`
  });
}

async function freezeVisualAnimations(client) {
  await client.send("Runtime.evaluate", {
    expression: `(() => {
      for (const svg of document.querySelectorAll("svg")) {
        try {
          if (typeof svg.setCurrentTime === "function") svg.setCurrentTime(0);
          if (typeof svg.pauseAnimations === "function") svg.pauseAnimations();
        } catch {}
      }
      for (const animation of document.getAnimations({ subtree: true })) {
        try {
          animation.pause();
          animation.currentTime = 0;
        } catch {}
      }
    })()`
  });
}

async function sleepInPage(client, ms) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => setTimeout(resolve, ${Number(ms)}))`
  });
}

async function waitForLoadingScreen(client) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      const deadline = performance.now() + 3000;
      function loop() {
        const intro = document.querySelector(".lumen-intro.intro-assets-ready");
        const progress = document.querySelector(".lumen-intro-percent, .lumen-intro-bar");
        if (intro && !progress) {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
          return;
        }
        if (performance.now() > deadline) {
          resolve();
          return;
        }
        requestAnimationFrame(loop);
      }
      loop();
    })`
  });
}

async function waitForRouteReady(client) {
  const result = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const startedAt = performance.now();
      const deadline = startedAt + 8000;
      function marks() {
        return Object.fromEntries(performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      }
      function ready() {
        const currentMarks = marks();
        const hero = document.querySelector(".hero-sticker-shell img");
        return {
          marks: currentMarks,
          routePresent: Boolean(document.querySelector(".route-stage")),
          canvasPresent: Boolean(document.querySelector("canvas")),
          nodeCount: document.querySelectorAll(".route-node").length,
          heroReady: Boolean(hero && hero.complete && hero.naturalWidth > 0),
          webglReady: Boolean(currentMarks["lumen:webgl-first-render"] && window.__LUMEN_WEBGL_STATS__?.renderCount > 0),
          introHidden: Boolean(currentMarks["lumen:intro-hidden"] || !document.querySelector(".lumen-intro"))
        };
      }
      function loop() {
        const state = ready();
        if (state.routePresent && state.canvasPresent && state.nodeCount >= 7 && state.heroReady && state.webglReady) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const done = performance.now();
            const routeStart = state.marks["lumen:route-mounted"] ?? state.marks["lumen:app-mounted"] ?? 0;
            resolve({
              ...state,
              visualCompleteMs: done - routeStart,
              interactiveMs: done - routeStart,
              observedAt: done
            });
          }));
          return;
        }
        if (performance.now() > deadline) {
          resolve({ ...state, timedOut: true, observedAt: performance.now(), visualCompleteMs: null, interactiveMs: null });
          return;
        }
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
      const candidates = [...document.querySelectorAll(".route-node.completed")];
      const target = candidates[0];
      const start = performance.now();
      if (!target) {
        resolve({ reviewStateMs: null, reviewTargetFound: false });
        return;
      }
      target.click();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve({
          reviewStateMs: performance.now() - start,
          reviewTargetFound: true,
          reviewRepeatVisible: Boolean(document.querySelector(".route-node.review-repeat"))
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
      const button = document.querySelector(".bottom-cta button:not(:disabled)");
      const start = performance.now();
      if (!button) {
        resolve({ snakeTransitionLatencyMs: null, nodeTransitionFullMs: null, nextButtonFound: false });
        return;
      }
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse" }));
      const deadline = start + 3600;
      function marks() {
        return Object.fromEntries(performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      }
      function loop() {
        const currentMarks = marks();
        const firstFrame = currentMarks["lumen:route-advance-first-frame"];
        const routeStart = currentMarks["lumen:route-advance-start"];
        const stableAfterContractAnimations = routeStart && performance.now() - routeStart >= 1800;
        if (firstFrame && routeStart && stableAfterContractAnimations) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            resolve({
              nextButtonFound: true,
              snakeTransitionLatencyMs: firstFrame - routeStart,
              nodeTransitionFullMs: performance.now() - routeStart
            });
          }));
          return;
        }
        if (performance.now() > deadline) {
          resolve({
            nextButtonFound: true,
            timedOut: true,
            snakeTransitionLatencyMs: firstFrame && routeStart ? firstFrame - routeStart : null,
            nodeTransitionFullMs: routeStart ? performance.now() - routeStart : null
          });
          return;
        }
        requestAnimationFrame(loop);
      }
      loop();
    })`
  });
  return mapRounded(result.result.value);
}

async function readPageMetrics(client) {
  const result = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const marks = Object.fromEntries(performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      const measures = Object.fromEntries(performance.getEntriesByType("measure").map((entry) => [entry.name, entry.duration]));
      const resources = performance.getEntriesByType("resource");
      return {
        domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
        loadMs: nav.loadEventEnd - nav.startTime,
        marks,
        measures,
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
        webglCompileMs: measures["lumen:webgl-compile"] ?? null,
        webglMountedToFirstRenderMs: measures["lumen:webgl-mounted-to-first-render"] ?? null,
        routeRenderToVisualCompleteMs: measures["lumen:route-render-to-visual-complete"] ?? null,
        routePresent: Boolean(document.querySelector(".route-stage")),
        canvasPresent: Boolean(document.querySelector("canvas")),
        nodeCount: document.querySelectorAll(".route-node").length,
        scriptBytes: resources.filter((entry) => entry.initiatorType === "script").reduce((total, entry) => total + (entry.transferSize || 0), 0),
        imageResourceCount: resources.filter((entry) => entry.initiatorType === "img").length,
        webglStats: window.__LUMEN_WEBGL_STATS__ ?? null
      };
    })()`
  });
  return mapRounded(result.result.value);
}

async function waitForTwoFrames(client) {
  await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`
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
      baselinePath,
      maskedDynamicRegions: visualRun.masks
    };
  }

  const baseline = await readFile(baselinePath);
  const diff = comparePngBuffers(baseline, current, visualRun.masks);
  return {
    page: visualRun.page,
    state: visualRun.state,
    result: diff.diffRatio <= visualThreshold ? "pass" : "fail",
    currentPath,
    baselinePath,
    threshold: visualThreshold,
    maskedDynamicRegions: visualRun.masks,
    ...diff
  };
}

function comparePngBuffers(aBuffer, bBuffer, masks) {
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

  let compared = 0;
  let diffPixels = 0;
  let maxChannelDelta = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      if (isMasked(x, y, a.width, a.height, masks)) continue;
      compared += 1;
      const offset = (y * a.width + x) * 4;
      const dr = Math.abs(a.data[offset] - b.data[offset]);
      const dg = Math.abs(a.data[offset + 1] - b.data[offset + 1]);
      const db = Math.abs(a.data[offset + 2] - b.data[offset + 2]);
      const da = Math.abs(a.data[offset + 3] - b.data[offset + 3]);
      const delta = Math.max(dr, dg, db, da);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > visualChannelThreshold) diffPixels += 1;
    }
  }

  return {
    dimensionsMatch: true,
    comparedPixels: compared,
    diffPixels,
    diffRatio: compared ? diffPixels / compared : 1,
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

function isMasked(x, y, width, height, masks) {
  return masks.some((mask) => {
    const left = Math.round(mask.x * width);
    const top = Math.round(mask.y * height);
    const right = Math.round((mask.x + mask.width) * width);
    const bottom = Math.round((mask.y + mask.height) * height);
    return x >= left && x < right && y >= top && y < bottom;
  });
}

async function prepareClient(client) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: false
  });
}

function buildUrl(page, state, index, visualMode) {
  const query = new URLSearchParams();
  query.set("perf", `${timestamp}-${index}`);
  if (visualMode) query.set("lumenPerfVisual", "1");
  if (visualMode && state.kind === "loading") query.set("lumenPerfHoldIntro", "1");
  return `${origin}${page.path}?${query}`;
}

async function createTab() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to create CDP tab: ${response.status}`);
  return response.json();
}

async function closeTab(id) {
  await fetch(`http://127.0.0.1:${cdpPort}/json/close/${id}`).catch(() => undefined);
}

async function waitForCdp() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("Timed out waiting for Chromium CDP");
}

async function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  return new CdpClient(socket);
}

async function readConditions() {
  return {
    commit: await command("git", ["rev-parse", "HEAD"]),
    gitStatus: await command("git", ["status", "--short"]),
    timestamp,
    os: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    bunVersion: await command("bun", ["--version"]),
    nodeVersion: process.version,
    vscodeVersion: await command("code", ["--version"]),
    extensionVersion: JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
    buildMode: "vite production preview",
    origin,
    routeOrder: pages.flatMap((page) => page.states.map((state) => `${page.name}:${state.name}`)),
    warmups,
    iterations,
    viewport: { width, height, deviceScaleFactor },
    cache: "disabled and fresh tab per run",
    visualSeed: "lumenPerfVisual=1 freezes WebGL shader time only",
    visualChannelThreshold
  };
}

function summarizeRuns(runs) {
  const keys = [...new Set(runs.map((run) => `${run.page}:${run.state}`))];
  return keys.map((key) => {
    const stateRuns = runs.filter((run) => `${run.page}:${run.state}` === key);
    return {
      page: stateRuns[0].page,
      state: stateRuns[0].state,
      kind: stateRuns[0].kind,
      iterationCount: stateRuns.length,
      routeVisualCompleteMs: stats(stateRuns, "routeVisualCompleteMs"),
      routeInteractiveMs: stats(stateRuns, "routeInteractiveMs"),
      loadingScreenMs: stats(stateRuns, "loadingScreenMs"),
      snakeTransitionLatencyMs: stats(stateRuns, "snakeTransitionLatencyMs"),
      nodeTransitionFullMs: stats(stateRuns, "nodeTransitionFullMs"),
      reviewStateMs: stats(stateRuns, "reviewStateMs"),
      webglImportMs: stats(stateRuns, "webglImportMs"),
      webglContextMs: stats(stateRuns, "webglContextMs"),
      webglPathSampleMs: stats(stateRuns, "webglPathSampleMs"),
      webglPipelineMs: stats(stateRuns, "webglPipelineMs"),
      webglSegmentsMs: stats(stateRuns, "webglSegmentsMs"),
      webglTexturesMs: stats(stateRuns, "webglTexturesMs"),
      webglTextureBodyMs: stats(stateRuns, "webglTextureBodyMs"),
      webglTextureBodyUploadMs: stats(stateRuns, "webglTextureBodyUploadMs"),
      webglTextureCapLeftMs: stats(stateRuns, "webglTextureCapLeftMs"),
      webglTextureCapLeftUploadMs: stats(stateRuns, "webglTextureCapLeftUploadMs"),
      webglTextureCapRightMs: stats(stateRuns, "webglTextureCapRightMs"),
      webglTextureCapRightUploadMs: stats(stateRuns, "webglTextureCapRightUploadMs"),
      webglCompileMs: stats(stateRuns, "webglCompileMs"),
      webglMountedToFirstRenderMs: stats(stateRuns, "webglMountedToFirstRenderMs"),
      routeRenderToVisualCompleteMs: stats(stateRuns, "routeRenderToVisualCompleteMs"),
      domContentLoadedMs: stats(stateRuns, "domContentLoadedMs"),
      loadMs: stats(stateRuns, "loadMs"),
      passUnder50ms: stats(stateRuns, "routeVisualCompleteMs").p95 < 50
    };
  });
}

function stats(rows, field) {
  const values = rows
    .map((row) => row[field])
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!values.length) return { min: null, median: null, p95: null, max: null, stddev: null };
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return {
    min: round(values[0]),
    median: round(values[Math.floor(values.length / 2)]),
    p95: round(values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)]),
    max: round(values[values.length - 1]),
    stddev: round(Math.sqrt(variance))
  };
}

function renderMarkdown(summary) {
  const rows = summary.summaries
    .map((row) => {
      const p95 = row.routeVisualCompleteMs.p95 ?? "n/a";
      return `| ${row.page}:${row.state} | ${row.iterationCount} | ${p95} | ${row.routeVisualCompleteMs.median ?? "n/a"} | ${row.passUnder50ms ? "yes" : "no"} |`;
    })
    .join("\n");
  const visualRows = summary.visualChecks
    .map((check) => `| ${check.page}:${check.state} | ${check.result} | ${check.diffRatio ?? "n/a"} | ${check.currentPath} |`)
    .join("\n");

  return `# Lumen Perf Baseline ${summary.capturedAt}

## Conditions

- Commit: ${summary.conditions.commit}
- Build mode: ${summary.conditions.buildMode}
- Warmups: ${summary.conditions.warmups}
- Iterations: ${summary.conditions.iterations}
- Viewport: ${summary.conditions.viewport.width}x${summary.conditions.viewport.height} @ ${summary.conditions.viewport.deviceScaleFactor}
- Cache: ${summary.conditions.cache}
- Visual seed: ${summary.conditions.visualSeed}

## Page/State Results

| Page/State | Runs | Route visual p95 ms | Median ms | Pass <50ms |
| ---------- | ---: | ------------------: | --------: | ---------- |
${rows}

## Visual Regression

| Page/State | Result | Diff ratio | Current screenshot |
| ---------- | ------ | ---------: | ------------------ |
${visualRows}
`;
}

function mapRounded(value) {
  if (Array.isArray(value)) return value.map(mapRounded);
  if (!value || typeof value !== "object") return round(value);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapRounded(entry)]));
}

function round(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function command(cmd, args) {
  return new Promise((resolveCommand) => {
    const child = spawn(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", () => resolveCommand(output.trim()));
    child.on("error", () => resolveCommand(""));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

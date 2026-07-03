import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\axelb\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe";
const port = Number(process.env.CDP_PORT ?? 9333);
const origin = process.env.PERF_ORIGIN ?? "http://127.0.0.1:4173";
const iterations = Number(process.env.PERF_ITERATIONS ?? 11);
const warmups = Number(process.env.PERF_WARMUPS ?? 2);
const settleTimeoutMs = Number(process.env.PERF_SETTLE_TIMEOUT_MS ?? 2500);
const headless = process.env.PERF_HEADLESS !== "0";
const viewport = {
  width: Number(process.env.PERF_WIDTH ?? 420),
  height: Number(process.env.PERF_HEIGHT ?? 820)
};

const pages = [
  { name: "route-path", path: "/" }
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
  const profileDir = await mkdtemp(join(tmpdir(), "lumen-cdp-profile-"));
  const chrome = spawn(chromePath, [
    ...(headless ? ["--headless=new"] : ["--window-position=-32000,-32000", `--window-size=${viewport.width},${viewport.height}`]),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--disable-features=Translate,BackForwardCache",
    "--autoplay-policy=no-user-gesture-required",
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe"]
  });

  try {
    await waitForCdp();

    const allResults = [];
    const visualResults = [];
    for (const page of pages) {
      for (let index = 0; index < warmups + iterations; index += 1) {
        const tab = await createTab();
        const client = await connect(tab.webSocketDebuggerUrl);
        await prepareClient(client);
        await client.send("Network.clearBrowserCache");
        try {
          const result = await measurePage(client, page, index);
          if (index >= warmups) allResults.push(result);
        } finally {
          client.close();
          await closeTab(tab.id);
        }
      }

      const tab = await createTab();
      const client = await connect(tab.webSocketDebuggerUrl);
      await prepareClient(client);
      await client.send("Network.clearBrowserCache");
      try {
        const result = await measurePage(client, page, warmups + iterations);
        result.visualSettle = await waitForVisualSettle(client);
        result.frameStats = await measureFrameStats(client);
        result.webglStats = await readWebglStats(client);
        visualResults.push(result);
      } finally {
        client.close();
        await closeTab(tab.id);
      }
    }

    console.log(JSON.stringify({
      conditions: {
        origin,
        viewport: `${viewport.width}x${viewport.height}`,
        iterations,
        warmups,
        cache: "disabled plus cache-busted URL",
        tab: "fresh tab per load run",
        visualCheck: "one post-load settle check per page",
        headless,
        browser: chromePath
      },
      pages: summarizeByPage(allResults),
      visualChecks: visualResults,
      runs: allResults
    }, null, 2));
  } finally {
    chrome.kill();
    await waitForExit(chrome);
    await rm(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100
    });
  }
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
      function firstWebglFrameReady() {
        return Boolean(performance.getEntriesByName("lumen:webgl-first-render").length);
      }
      function waitForReady() {
        if (firstWebglFrameReady() || performance.now() - waitStarted > 2500) {
          requestAnimationFrame((now) => {
            started = now;
            last = now;
            requestAnimationFrame(frame);
          });
          return;
        }
        requestAnimationFrame(waitForReady);
      }
      function frame(now) {
        intervals.push(now - last);
        last = now;
        if (now - started >= 1800) {
          const sorted = intervals.slice(1).sort((a, b) => a - b);
          const sum = sorted.reduce((total, value) => total + value, 0);
          resolve({
            frames: sorted.length,
            avgFrameMs: sorted.length ? sum / sorted.length : null,
            p95FrameMs: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null,
            maxFrameMs: sorted.length ? sorted[sorted.length - 1] : null,
            overBudgetFrames: sorted.filter((value) => value > 20).length
          });
          return;
        }
        requestAnimationFrame(frame);
      }
      waitForReady();
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

async function prepareClient(client) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  });
}

async function waitForVisualSettle(client) {
  let lastState = null;
  const started = Date.now();
  const deadline = Date.now() + settleTimeoutMs;
  while (Date.now() < deadline) {
    const state = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const marks = Object.fromEntries(performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
        return {
          heroReady: Boolean(document.querySelector(".hero-sticker-shell")),
          webglReady: Boolean(marks["lumen:webgl-first-render"] && document.querySelector("canvas")),
          deferredStatus: window.__LUMEN_DEFERRED_STATUS__ ?? null
        };
      })()`
    });

    lastState = state.result.value;
    if (lastState.heroReady && lastState.webglReady) {
      return {
        ...lastState,
        settled: true,
        elapsedMs: Date.now() - started
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return {
    ...(lastState ?? {}),
    settled: false,
    elapsedMs: Date.now() - started
  };
}

async function measurePage(client, page, index) {
  const url = buildUrl(page, index);
  const loadEvent = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loadEvent;

  const metrics = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
      const marks = Object.fromEntries(performance.getEntriesByType("mark").map((entry) => [entry.name, entry.startTime]));
      return {
        name: ${JSON.stringify(page.name)},
        path: ${JSON.stringify(page.path)},
        domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
        loadMs: nav.loadEventEnd - nav.startTime,
        firstPaintMs: paints["first-paint"] ?? null,
        firstContentfulPaintMs: paints["first-contentful-paint"] ?? null,
        appMountedMs: marks["lumen:app-mounted"] ?? null,
        routeMountedMs: marks["lumen:route-mounted"] ?? null,
        webglMountedMs: marks["lumen:webgl-mounted"] ?? null,
        routePresent: Boolean(document.querySelector(".route-stage")),
        canvasPresent: Boolean(document.querySelector("canvas")),
        nodeCount: document.querySelectorAll(".route-node").length,
        scriptBytes: performance.getEntriesByType("resource")
          .filter((entry) => entry.initiatorType === "script")
          .reduce((total, entry) => total + (entry.transferSize || 0), 0)
      };
    })()`
  });

  return metrics.result.value;
}

function buildUrl(page, index) {
  const separator = origin.includes("?") ? "&" : "?";
  if (/\.html?($|\?)/.test(origin)) {
    return `${origin}${separator}perf=${Date.now()}-${index}`;
  }
  return `${origin}${page.path}?perf=${Date.now()}-${index}`;
}

function summarizeByPage(results) {
  return pages.map((page) => {
    const pageRuns = results.filter((result) => result.name === page.name);
    return {
      name: page.name,
      path: page.path,
      domContentLoadedMs: summarize(pageRuns, "domContentLoadedMs"),
      loadMs: summarize(pageRuns, "loadMs"),
      firstContentfulPaintMs: summarize(pageRuns, "firstContentfulPaintMs"),
      appMountedMs: summarize(pageRuns, "appMountedMs"),
      routeMountedMs: summarize(pageRuns, "routeMountedMs"),
      webglMountedMs: summarize(pageRuns, "webglMountedMs")
    };
  });
}

function summarize(results, field) {
  const values = results
    .map((result) => result[field])
    .filter((value) => typeof value === "number")
    .sort((a, b) => a - b);

  return {
    min: round(values[0]),
    median: round(values[Math.floor(values.length / 2)]),
    max: round(values[values.length - 1])
  };
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : null;
}

async function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpClient(socket);
}

async function createTab() {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT"
  });
  if (!response.ok) {
    throw new Error(`Unable to create CDP tab: ${response.status}`);
  }
  return response.json();
}

async function closeTab(id) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${id}`);
  } catch {
    // The browser may already have closed the target during shutdown.
  }
}

async function waitForCdp() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for Chromium CDP");
}

async function waitForExit(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

function pruneDistSourceAssets() {
  return {
    name: "lumen-prune-dist-source-assets",
    closeBundle() {
      for (const directory of [
        join(frontendRoot, "dist", "assets", "route-hero"),
        join(frontendRoot, "dist", "assets", "route-nodes"),
        join(frontendRoot, "dist", "materials", "snake-green")
      ]) {
        if (!existsSync(directory)) continue;

        for (const fileName of readdirSync(directory)) {
          if (fileName.toLowerCase().endsWith(".png")) {
            rmSync(join(directory, fileName), { force: true });
          }
        }
      }
    }
  };
}

function inlineCriticalIndexAssets() {
  return {
    name: "lumen-inline-critical-index-assets",
    enforce: "post" as const,
    closeBundle() {
      const distDirectory = join(frontendRoot, "dist");
      const indexPath = join(distDirectory, "index.html");
      if (!existsSync(indexPath)) return;

      let html = readFileSync(indexPath, "utf8");
      const assetMatches = [
        ...html.matchAll(
          /<script type="module" crossorigin src="\.\/(assets\/index-[^"]+\.js)"><\/script>/g
        )
      ];
      const styleMatches = [
        ...html.matchAll(
          /<link rel="stylesheet" crossorigin href="\.\/(assets\/index-[^"]+\.css)">/g
        )
      ];

      const bootstrapBlocks = [
        ...styleMatches.map((match) => deferredStylesheetBootstrap(match[1])),
        ...assetMatches.map((match) => moduleEntryBootstrap(match[1]))
      ];

      for (const match of [...styleMatches, ...assetMatches]) {
        html = html.replace(match[0], "");
      }

      if (bootstrapBlocks.length > 0) {
        html = html.replace("</head>", `    ${bootstrapBlocks.join("\n    ")}\n  </head>`);
      }

      writeFileSync(indexPath, html);
    }
  };
}

/**
 * La cortina estatica de index.html referencia el logo/wordmark con
 * placeholders (__LUMEN_BRAND_LOGO__/__LUMEN_BRAND_WORDMARK__): en dev se
 * resuelven a los assets fuente via /@fs/, y en build a los archivos
 * hasheados que Vite emitio en dist/assets (los mismos que usa lumenBrand.ts).
 */
function injectStaticIntroBrandAssets() {
  return {
    name: "lumen-inject-static-intro-brand-assets",
    enforce: "post" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string, ctx: { server?: unknown }) {
        if (!ctx.server) return html;
        const brandRoot = join(frontendRoot, "..", "assets", "brand").replace(/\\/g, "/");
        return html
          .replace("__LUMEN_BRAND_LOGO__", `/@fs/${brandRoot}/lumen-logo.svg`)
          .replace("__LUMEN_BRAND_WORDMARK__", `/@fs/${brandRoot}/lumen-wordmark.webp`);
      }
    },
    closeBundle() {
      const distDirectory = join(frontendRoot, "dist");
      const indexPath = join(distDirectory, "index.html");
      const assetsDirectory = join(distDirectory, "assets");
      if (!existsSync(indexPath) || !existsSync(assetsDirectory)) return;

      const assetFiles = readdirSync(assetsDirectory);
      const logoFile = assetFiles.find((name) => /^lumen-logo-.+\.svg$/.test(name));
      const wordmarkFile = assetFiles.find((name) => /^lumen-wordmark-.+\.webp$/.test(name));

      let html = readFileSync(indexPath, "utf8");
      if (logoFile) {
        const logoPayload = readFileSync(join(assetsDirectory, logoFile)).toString("base64");
        html = html.replace("__LUMEN_BRAND_LOGO__", `data:image/svg+xml;base64,${logoPayload}`);
      }
      if (wordmarkFile) {
        const wordmarkPayload = readFileSync(join(assetsDirectory, wordmarkFile)).toString("base64");
        html = html.replace("__LUMEN_BRAND_WORDMARK__", `data:image/webp;base64,${wordmarkPayload}`);
      }
      writeFileSync(indexPath, html);
    }
  };
}

function relocateInlinedModuleUrls(source: string) {
  return source
    .replace(/(["'`])\.\/(?!assets\/)([^"'`]+?\.(?:js|css))\1/g, "$1./assets/$2$1")
    .replace(
      /new URL\("([^"/][^"]+\.(?:svg|png|webp))",import\.meta\.url\)/g,
      'new URL("./assets/$1",import.meta.url)'
    );
}

function deferredStylesheetBootstrap(assetPath: string) {
  return `<script data-lumen-style-bootstrap>
window.__LUMEN_LOAD_STYLES__ = () => {
  if (window.__LUMEN_STYLES_READY__) return window.__LUMEN_STYLES_READY__;
  window.__LUMEN_STYLES_READY__ = new Promise((resolve) => {
    const existing = document.querySelector('link[data-lumen-style]');
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./${assetPath}";
    link.dataset.lumenStyle = "true";
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  return window.__LUMEN_STYLES_READY__;
};
if (window.__LUMEN_WEBVIEW_BOOTSTRAP__) {
  window.__LUMEN_LOAD_STYLES__();
} else {
  window.addEventListener("load", () => window.__LUMEN_LOAD_STYLES__(), { once: true });
}
</script>`;
}

function moduleEntryBootstrap(assetPath: string) {
  return `<script type="module" data-lumen-entry-bootstrap>
import "./${assetPath}";
</script>`;
}

export default defineConfig({
  base: "./",
  plugins: [svelte(), pruneDistSourceAssets(), inlineCriticalIndexAssets(), injectStaticIntroBrandAssets()],
  server: {
    fs: {
      allow: [".."]
    }
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.includes("/node_modules/three/")) return "three";
        }
      }
    }
  }
});

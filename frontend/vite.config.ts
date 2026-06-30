import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { existsSync, readdirSync, rmSync } from "node:fs";
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

export default defineConfig({
  base: "./",
  plugins: [svelte(), pruneDistSourceAssets()],
  server: {
    fs: {
      allow: [".."]
    }
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"]
        }
      }
    }
  }
});

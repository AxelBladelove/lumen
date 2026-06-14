import type { ModuleTheme } from "../types/routePath";

export const stringsGreenTheme: ModuleTheme = {
  id: "strings-green",
  coreColor: "#00c991",
  edgeColor: "#21f6d2",
  glowColor: "#00ffe0",
  accentColor: "#eafffb",
  snakeTintStrength: 0,
  nodeTintFilter: "none"
};

export const lockedSnakeTheme: ModuleTheme = {
  id: "locked-purple-graphite",
  coreColor: "#8068a8",
  edgeColor: "#cfbfec",
  glowColor: "#c7aaf0",
  accentColor: "#f4eeff",
  snakeTintStrength: 0.86,
  nodeTintFilter: "none"
};

export function themeVars(theme: ModuleTheme) {
  return [
    `--theme-core:${theme.coreColor}`,
    `--theme-edge:${theme.edgeColor}`,
    `--theme-glow:${theme.glowColor}`,
    `--theme-accent:${theme.accentColor}`,
    `--snake-tint-strength:${theme.snakeTintStrength ?? 0}`,
    `--node-tint:${theme.nodeTintFilter ?? "none"}`
  ].join(";");
}

export function publicAsset(path: string) {
  const cleanPath = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${cleanPath}`;
}

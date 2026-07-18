import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  nextTramoDemoIndex,
  tramoDemoDelayMs
} from "../src/route-path-view/state/tramoDemo";

const routePathView = readFileSync(
  new URL("../src/route-path-view/RoutePathView.svelte", import.meta.url),
  "utf8"
);
const webviewContent = readFileSync(
  new URL("../../extension/src/lumenWebviewContent.ts", import.meta.url),
  "utf8"
);
const extensionPackage = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
);

describe("tramo demo", () => {
  test("avanza desde cero como máximo dos tramos con el intervalo acordado", () => {
    expect(tramoDemoDelayMs).toBe(2_500);
    expect(nextTramoDemoIndex(0, 4)).toBe(1);
    expect(nextTramoDemoIndex(1, 4)).toBe(2);
    expect(nextTramoDemoIndex(2, 4)).toBeNull();
  });

  test("no solicita un tramo que el módulo no contiene", () => {
    expect(nextTramoDemoIndex(0, 1)).toBeNull();
    expect(nextTramoDemoIndex(0, 2)).toBe(1);
    expect(nextTramoDemoIndex(1, 2)).toBeNull();
  });

  test("acepta query param o dataset inyectado por el setting de VS Code", () => {
    expect(routePathView).toContain('has("lumenTramoDemo")');
    expect(routePathView).toContain('dataset.lumenTramoDemo === "true"');
    expect(webviewContent).toContain('get<boolean>("tramoDemo", false)');
    expect(webviewContent).toContain('data-lumen-tramo-demo="true"');
    expect(extensionPackage.contributes.configuration.properties["lumen.tramoDemo"]).toEqual({
      type: "boolean",
      default: false,
      markdownDescription:
        "Herramienta de verificación visual que recorre automáticamente tramos cortos de la ruta para comprobar el scroll real. Requiere recargar la vista de Lumen."
    });
  });
});

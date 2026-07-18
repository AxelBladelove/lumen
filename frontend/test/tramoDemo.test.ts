import { describe, expect, test } from "bun:test";

import {
  nextTramoDemoIndex,
  tramoDemoDelayMs
} from "../src/route-path-view/state/tramoDemo";

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
});

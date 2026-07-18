import { describe, expect, test } from "bun:test";

import {
  createModuleDataState,
  moduleDataFallbackDelayMs,
  transitionModuleDataState
} from "../src/route-path-view/state/moduleDataState";

describe("module data presentation state", () => {
  test("espera cinco segundos y cae al mock sin estado de error", () => {
    const waiting = createModuleDataState();
    const fallback = transitionModuleDataState(waiting, { type: "fallback-timeout" });

    expect(moduleDataFallbackDelayMs).toBe(5_000);
    expect(waiting.status).toBe("waiting");
    expect(fallback.status).toBe("mock-fallback");
    expect(transitionModuleDataState(fallback, { type: "fallback-timeout" })).toBe(fallback);
  });

  test("la data del engine gana antes o después del timeout y no retransiciona", () => {
    const direct = transitionModuleDataState(createModuleDataState(), {
      type: "engine-data-received"
    });
    const afterFallback = transitionModuleDataState(
      transitionModuleDataState(createModuleDataState(), { type: "fallback-timeout" }),
      { type: "engine-data-received" }
    );

    expect(direct.status).toBe("engine-data");
    expect(afterFallback.status).toBe("engine-data");
    expect(transitionModuleDataState(direct, { type: "engine-data-received" })).toBe(direct);
    expect(transitionModuleDataState(direct, { type: "fallback-timeout" })).toBe(direct);
  });
});

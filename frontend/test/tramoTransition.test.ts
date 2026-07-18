import { describe, expect, test } from "bun:test";

import {
  createTramoTransition,
  requestTramoTransition,
  settleTramoTransition
} from "../src/route-path-view/state/tramoTransition";

describe("tramoTransition", () => {
  test("inicializa en el tramo avanzado sin animarlo", () => {
    expect(createTramoTransition(3)).toEqual({
      phase: "idle",
      visibleTramoIndex: 3,
      targetTramoIndex: 3,
      direction: "none"
    });
  });

  test("avanzar de tramo dispara scrolling exactamente una vez", () => {
    const initial = createTramoTransition(0);
    const scrolling = requestTramoTransition(initial, 1);
    const repeated = requestTramoTransition(scrolling, 1);

    expect(scrolling).toEqual({
      phase: "scrolling",
      visibleTramoIndex: 0,
      targetTramoIndex: 1,
      direction: "forward"
    });
    expect(repeated).toBe(scrolling);

    const settled = settleTramoTransition(scrolling);
    expect(settled).toEqual({
      phase: "settled",
      visibleTramoIndex: 1,
      targetTramoIndex: 1,
      direction: "forward"
    });
    expect(settleTramoTransition(settled)).toBe(settled);
  });

  test("reduced motion corta directamente al destino", () => {
    const state = requestTramoTransition(createTramoTransition(2), 3, true);

    expect(state).toEqual({
      phase: "settled",
      visibleTramoIndex: 3,
      targetTramoIndex: 3,
      direction: "forward"
    });
  });

  test("reduced motion también asienta un scroll que ya estaba en curso", () => {
    const scrolling = requestTramoTransition(createTramoTransition(0), 1);
    const settled = requestTramoTransition(scrolling, 1, true);

    expect(settled.phase).toBe("settled");
    expect(settled.visibleTramoIndex).toBe(1);
  });

  test("calcula también la dirección de regreso", () => {
    expect(requestTramoTransition(createTramoTransition(3), 1).direction).toBe("backward");
  });
});

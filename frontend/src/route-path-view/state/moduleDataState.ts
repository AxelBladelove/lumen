export const moduleDataFallbackDelayMs = 5_000;

export type ModuleDataStatus = "waiting" | "engine-data" | "mock-fallback";

export interface ModuleDataState {
  status: ModuleDataStatus;
}

export type ModuleDataEvent =
  | { type: "engine-data-received" }
  | { type: "fallback-timeout" };

export function createModuleDataState(): ModuleDataState {
  return { status: "waiting" };
}

// La transición es idempotente: una vez resuelta la espera, los snapshots
// siguientes actualizan el módulo sin recomputar este estado de presentación.
export function transitionModuleDataState(
  state: ModuleDataState,
  event: ModuleDataEvent
): ModuleDataState {
  if (event.type === "engine-data-received") {
    return state.status === "engine-data" ? state : { status: "engine-data" };
  }

  return state.status === "waiting" ? { status: "mock-fallback" } : state;
}

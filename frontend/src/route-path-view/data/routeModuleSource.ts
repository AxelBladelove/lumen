import { mockRouteModule } from "./mockRouteModule";
import type { RoutePathModuleView } from "../types/routePath";

export const routeModuleDataSource = "mock:route-c-module-2-strings";

export function createInitialRouteModule() {
  return cloneRouteModule(mockRouteModule);
}

export function cloneRouteModule(module: RoutePathModuleView): RoutePathModuleView {
  if (typeof structuredClone === "function") {
    return structuredClone(module);
  }

  return JSON.parse(JSON.stringify(module)) as RoutePathModuleView;
}

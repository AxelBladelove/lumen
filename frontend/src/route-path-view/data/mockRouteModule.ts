import {
  ROUTE_C_STRINGS_PATH_D,
  ROUTE_C_STRINGS_PATH_TRANSFORM,
  ROUTE_C_STRINGS_WIDTH
} from "../path/snakePath.generated";
import { stringsGreenTheme } from "../theme/moduleTheme";
import { mockRouteVisualSlots } from "./mockRouteSlots";
import type { RoutePathModuleView } from "../types/routePath";

export const mockRouteModule: RoutePathModuleView = {
  routeTitle: "Ruta C",
  moduleNumber: 2,
  title: "Cadenas de caracteres",
  subtitle: "char, strings y texto",
  completed: 18,
  total: 64,
  percent: 28,
  activeExerciseId: "strings-basic",
  theme: stringsGreenTheme,
  path: {
    id: "route-c-strings",
    pathD: ROUTE_C_STRINGS_PATH_D,
    transform: ROUTE_C_STRINGS_PATH_TRANSFORM,
    tubeWidth: ROUTE_C_STRINGS_WIDTH,
    materialPreset: "liquid-v1"
  },
  nodes: [
    {
      id: "hello-world",
      title: "Hola mundo",
      subtitle: "printf",
      type: "exercise",
      status: "completed",
      ...mockRouteVisualSlots[0]
    },
    {
      id: "read-text",
      title: "Leer texto",
      subtitle: "scanf / fgets",
      type: "exercise",
      status: "completed",
      ...mockRouteVisualSlots[1]
    },
    {
      id: "strings-basic",
      title: "Strings básicos",
      subtitle: "char[], cadenas",
      type: "exercise",
      status: "active",
      size: 126,
      ...mockRouteVisualSlots[2]
    },
    {
      id: "string-functions",
      title: "Funciones string",
      subtitle: "strlen, strcpy",
      type: "exercise",
      status: "locked",
      ...mockRouteVisualSlots[3]
    },
    {
      id: "string-compare",
      title: "Comparar cadenas",
      subtitle: "strcmp",
      type: "exercise",
      status: "locked",
      ...mockRouteVisualSlots[4]
    },
    {
      id: "name-validator",
      title: "Mini reto",
      subtitle: "Validador de nombre",
      type: "challenge",
      status: "challenge",
      ...mockRouteVisualSlots[5]
    },
    {
      id: "agenda-cli",
      title: "Reto: agenda CLI",
      subtitle: "strings + menú",
      type: "project",
      status: "locked",
      ...mockRouteVisualSlots[6]
    }
  ],
  nextAction: {
    label: "Siguiente:",
    targetTitle: "Funciones string"
  }
};

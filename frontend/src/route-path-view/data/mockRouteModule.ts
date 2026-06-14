import {
  ROUTE_C_STRINGS_PATH_D,
  ROUTE_C_STRINGS_PATH_TRANSFORM,
  ROUTE_C_STRINGS_WIDTH
} from "../path/snakePath.generated";
import { stringsGreenTheme } from "../theme/moduleTheme";
import type { RoutePathModuleView } from "../types/routePath";

export const mockRouteModule: RoutePathModuleView = {
  routeTitle: "Ruta C",
  moduleNumber: 2,
  title: "Cadenas de caracteres",
  subtitle: "char, strings y texto",
  completed: 18,
  total: 64,
  percent: 28,
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
      pathT: 0.0,
      labelSide: "right",
      nodeOffset: { x: -10, y: 2 },
      labelOffset: { x: 5, y: -1 }
    },
    {
      id: "read-text",
      title: "Leer texto",
      subtitle: "scanf / fgets",
      type: "exercise",
      status: "completed",
      pathT: 0.164,
      labelSide: "right",
      nodeOffset: { x: -11, y: 0 },
      labelOffset: { x: 5, y: 0 }
    },
    {
      id: "strings-basic",
      title: "Strings básicos",
      subtitle: "char[], cadenas",
      type: "exercise",
      status: "active",
      pathT: 0.359,
      labelSide: "right",
      size: 126,
      nodeOffset: { x: -5, y: 7 },
      labelOffset: { x: 9, y: -1 }
    },
    {
      id: "string-functions",
      title: "Funciones string",
      subtitle: "strlen, strcpy",
      type: "exercise",
      status: "locked",
      pathT: 0.553,
      labelSide: "right",
      nodeOffset: { x: 0, y: 4 },
      labelOffset: { x: 5, y: 1 }
    },
    {
      id: "string-compare",
      title: "Comparar cadenas",
      subtitle: "strcmp",
      type: "exercise",
      status: "locked",
      pathT: 0.686,
      labelSide: "right",
      nodeOffset: { x: 3, y: 5 },
      labelOffset: { x: 4, y: 1 }
    },
    {
      id: "name-validator",
      title: "Mini reto",
      subtitle: "Validador de nombre",
      type: "challenge",
      status: "challenge",
      pathT: 0.858,
      labelSide: "right",
      nodeOffset: { x: -12, y: -1 },
      labelOffset: { x: 8, y: -1 }
    },
    {
      id: "agenda-cli",
      title: "Reto: agenda CLI",
      subtitle: "strings + menú",
      type: "project",
      status: "locked",
      pathT: 0.989,
      labelSide: "right",
      nodeOffset: { x: -1, y: 2 },
      labelOffset: { x: 7, y: 0 }
    }
  ],
  nextAction: {
    label: "Siguiente:",
    targetTitle: "Funciones string"
  }
};

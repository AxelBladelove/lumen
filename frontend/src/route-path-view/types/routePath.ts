export type NodeStatus = "completed" | "active" | "locked" | "challenge";
export type NodeType = "exercise" | "challenge" | "quiz" | "project" | "checkpoint";
export type LabelSide = "left" | "right" | "auto";
export type NodeMotion = "complete" | "unlock";

export type ModuleTheme = {
  id: string;
  coreColor: string;
  edgeColor: string;
  glowColor: string;
  accentColor: string;
  snakeTintStrength?: number;
  nodeTintFilter?: string;
};

export type PathTransform = {
  x: number;
  y: number;
  scale: number;
};

export type SnakePathConfig = {
  id: string;
  pathD: string;
  transform?: PathTransform;
  tubeWidth: number;
  materialPreset: "liquid-v1";
};

export type RoutePathNode = {
  id: string;
  title: string;
  subtitle: string;
  type: NodeType;
  status: NodeStatus;
  pathT: number;
  labelSide?: LabelSide;
  size?: number;
  nodeOffset?: { x: number; y: number };
  labelOffset?: { x: number; y: number };
  motion?: NodeMotion;
  reviewMode?: "repeat";
};

export type RoutePathModuleView = {
  routeTitle: string;
  moduleNumber: number;
  title: string;
  subtitle: string;
  completed: number;
  total: number;
  percent: number;
  activeExerciseId?: string | null;
  theme: ModuleTheme;
  path: SnakePathConfig;
  nodes: RoutePathNode[];
  nextAction: {
    label: string;
    targetTitle: string;
  };
};

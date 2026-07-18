<script lang="ts">
  import HeroTextSticker from "./HeroTextSticker.svelte";
  import NodeOverlay from "./NodeOverlay.svelte";
  import SnakeLayer from "./SnakeLayer.svelte";
  import { publicAsset } from "../theme/moduleTheme";
  import type { ModuleTheme, RoutePathNode, SnakePathConfig } from "../types/routePath";

  export let path: SnakePathConfig;
  export let nodes: RoutePathNode[];
  export let theme: ModuleTheme;
  export let lockedStartT = 1;
  export let renderScale = 1;
  export let interactive = true;
  export let onNodeSelect: ((node: RoutePathNode) => void) | undefined = undefined;
  export let onFirstRender: (() => void) | undefined = undefined;

  const codeLines = [
    "#include <stdio.h>",
    "",
    "int main() {",
    "  char nombre[32];",
    "  gets(nombre);",
    "  printf(\"%s\", nombre);",
    "  return 0;",
    "}"
  ];
  const heroAsset = publicAsset("assets/route-hero/strings-chat-reference-hero.runtime.webp");
</script>

<div class="tramo-composition" class:tramo-inert={!interactive} inert={!interactive}>
  <div class="code-ghost" aria-hidden="true">
    {#each codeLines as line}
      <span>{line || "\u00a0"}</span>
    {/each}
  </div>

  <SnakeLayer {path} {theme} {lockedStartT} {renderScale} {onFirstRender} />
  <NodeOverlay
    {path}
    {nodes}
    {theme}
    isReviewing={nodes.some((node) => node.reviewMode === "repeat")}
    onNodeSelect={interactive ? onNodeSelect : undefined}
  />

  <div class="hero-text-input">
    <HeroTextSticker src={heroAsset} />
  </div>
</div>

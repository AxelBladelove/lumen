<script lang="ts">
  import { onMount } from "svelte";
  import BottomCta from "./components/BottomCta.svelte";
  import HeroTextSticker from "./components/HeroTextSticker.svelte";
  import NodeOverlay from "./components/NodeOverlay.svelte";
  import ProgressCard from "./components/ProgressCard.svelte";
  import RouteHeader from "./components/RouteHeader.svelte";
  import SnakeLayer from "./components/SnakeLayer.svelte";
  import { createPathSampler, type PathSampler } from "./path/pathMetrics";
  import { publicAsset, themeVars } from "./theme/moduleTheme";
  import type { NodeMotion, NodeStatus, RoutePathModuleView, RoutePathNode } from "./types/routePath";

  export let module: RoutePathModuleView;
  export let onNodeSelected: ((node: RoutePathNode) => void) | undefined = undefined;
  export let onContinueRequest:
    | ((payload: { fromNodeId?: string; nextNodeId?: string }) => void)
    | undefined = undefined;

  const stage = { width: 1086, height: 1448 };
  let scale = 1;
  let layoutWidth = stage.width;
  let layoutHeight = stage.height;
  let contentOffset = 0;
  let compactLayout = false;
  let routeArtScale = 1;
  let displayedLockedStartT = 0;
  let splitAnimationFrame = 0;
  let splitAnimationTarget = -1;
  let splitAnimationReady = false;
  let isAdvancing = false;
  let advanceCommitDone = false;
  let mounted = false;
  let deferredVisualsReady = false;
  let pathSampler: PathSampler | null =
    typeof document !== "undefined" && module?.path?.pathD
      ? createPathSampler(module.path.pathD, module.path.transform)
      : null;
  let nodeMotionById: Record<string, NodeMotion> = {};
  let nodeMotionTimers: number[] = [];
  let reviewNodeId: string | null = null;
  const routeAnimationDuration = 860;
  const routeStartKick = 0.1;
  const routeNodeCommitFallbackProgress = 0.4;
  const nodeEdgeCommitRadius = 25;
  const nodeMotionDuration = 720;

  function updateScale() {
    const marginX = 28;
    const marginY = 22;
    const availableWidth = window.innerWidth - marginX;
    const availableHeight = window.innerHeight - marginY;
    // En paneles angostos (Lumen como columna derecha del editor) el layout se
    // compacta antes de bajar la escala global: el chrome anclado a bordes
    // conserva tamano legible y la ruta/snake absorbe el ajuste visual.
    const isNarrowPanel = availableWidth < 820;
    const compactLayoutWidth = isNarrowPanel ? 700 : 860;
    const compactStageHeight = isNarrowPanel ? 1304 : stage.height;
    const nextScale = Math.max(
      0.32,
      Math.min(1, availableWidth / compactLayoutWidth, availableHeight / compactStageHeight)
    );
    const expandedWidth = availableWidth / nextScale;
    compactLayout = isNarrowPanel;
    scale = nextScale;
    layoutHeight = compactStageHeight;
    layoutWidth = Math.max(compactLayoutWidth, Math.min(2200, expandedWidth));
    contentOffset = (layoutWidth - stage.width) / 2;
    routeArtScale = compactLayout ? 0.9 : 1;
  }

  onMount(() => {
    performance.mark("lumen:route-mounted");
    mounted = true;
    updateScale();
    window.addEventListener("resize", updateScale);
    window.addEventListener("lumen:exercise-completed", handleExerciseCompletedEvent);
    displayedLockedStartT = lockedStartT;
    splitAnimationTarget = lockedStartT;
    splitAnimationReady = true;
    loadDeferredVisuals();

    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("lumen:exercise-completed", handleExerciseCompletedEvent);
      cancelAnimationFrame(splitAnimationFrame);
      nodeMotionTimers.forEach((timer) => window.clearTimeout(timer));
    };
  });

  $: if (module?.path?.pathD) {
    pathSampler = createPathSampler(module.path.pathD, module.path.transform);
  }

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

  function loadDeferredVisuals() {
    (window as any).__LUMEN_DEFERRED_STATUS__ = {
      ...(window as any).__LUMEN_DEFERRED_STATUS__,
      routeVisuals: "loading"
    };

    deferredVisualsReady = true;
    (window as any).__LUMEN_DEFERRED_STATUS__.routeVisuals = "loaded";
  }

  let activeNodeIndex = -1;

  $: initialActiveIndex = Math.max(
    0,
    module.nodes.findIndex((node) => node.status === "active")
  );
  $: if (activeNodeIndex < 0 || !module.nodes[activeNodeIndex]) {
    activeNodeIndex = initialActiveIndex;
  }
  $: interactiveNodes = module.nodes.map((node, index) => ({
    ...node,
    status: statusForNode(node, index, activeNodeIndex),
    motion: nodeMotionById[node.id],
    reviewMode: node.id === reviewNodeId && index < activeNodeIndex ? "repeat" as const : undefined
  }));
  $: activeNode = interactiveNodes.find((node) => node.status === "active");
  $: nextNode = interactiveNodes[activeNodeIndex + 1];
  $: firstLockedNode = interactiveNodes.find((node) => node.status === "locked");
  $: lockedStartT = activeNode
    ? activeNode.pathT
    : firstLockedNode?.pathT ?? 1;
  $: if (!splitAnimationReady) {
    displayedLockedStartT = lockedStartT;
  }
  $: completedCount = module.completed + Math.max(0, activeNodeIndex - initialActiveIndex);
  $: completionPercent = Math.round((completedCount / module.total) * 100);
  $: nextTargetTitle = nextNode?.title ?? "Módulo completado";
  $: canContinue = Boolean(nextNode) && !isAdvancing;

  function statusForNode(node: RoutePathNode, index: number, currentIndex: number): NodeStatus {
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "active";
    if (node.type === "challenge") return "challenge";
    return "locked";
  }

  function continueToNextNode() {
    performance.mark("lumen:continue-pressed");
    const fromNodeId = activeNode?.id;
    const nextNodeId = nextNode?.id;
    completeActiveExercise();
    onContinueRequest?.({
      fromNodeId,
      nextNodeId
    });
  }

  function handleNodeSelect(node: RoutePathNode) {
    onNodeSelected?.(node);

    const selectedIndex = module.nodes.findIndex((candidate) => candidate.id === node.id);
    if (selectedIndex < 0) return;

    if (selectedIndex < activeNodeIndex) {
      reviewNodeId = reviewNodeId === node.id ? null : node.id;
      return;
    }

    if (selectedIndex === activeNodeIndex) {
      reviewNodeId = null;
    }
  }

  function handleExerciseCompletedEvent(event: Event) {
    const completedNodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
    const currentNode = module.nodes[activeNodeIndex];
    if (completedNodeId && currentNode?.id !== completedNodeId) return;
    completeActiveExercise();
  }

  function completeActiveExercise() {
    if (!canContinue) return;
    const targetIndex = activeNodeIndex + 1;
    const targetNode = module.nodes[targetIndex];
    if (!targetNode) return;
    const previousNode = module.nodes[activeNodeIndex];

    isAdvancing = true;
    advanceCommitDone = false;
    reviewNodeId = null;
    performance.mark("lumen:route-advance-start");
    window.dispatchEvent(new CustomEvent("lumen:route-advance-started"));
    const commitAtT = nodeEdgeCommitT(displayedLockedStartT, targetNode);

    animateUnlockedRoute(displayedLockedStartT, targetNode.pathT, commitAtT, () => {
      activeNodeIndex = targetIndex;
      displayedLockedStartT = targetNode.pathT;
      isAdvancing = false;
    }, () => {
      if (advanceCommitDone) return;
      advanceCommitDone = true;
      activeNodeIndex = targetIndex;
      playNodeTransition(previousNode, targetNode);
    });
  }

  function playNodeTransition(previousNode: RoutePathNode | undefined, targetNode: RoutePathNode) {
    const nextMotionById = { ...nodeMotionById, [targetNode.id]: "unlock" as NodeMotion };
    if (previousNode) {
      nextMotionById[previousNode.id] = "complete";
    }
    nodeMotionById = nextMotionById;

    const transitionIds = [previousNode?.id, targetNode.id].filter(Boolean) as string[];
    const timer = window.setTimeout(() => {
      const remainingMotions = { ...nodeMotionById };
      transitionIds.forEach((id) => delete remainingMotions[id]);
      nodeMotionById = remainingMotions;
      nodeMotionTimers = nodeMotionTimers.filter((motionTimer) => motionTimer !== timer);
    }, nodeMotionDuration);
    nodeMotionTimers = [...nodeMotionTimers, timer];
  }

  function nodeEdgeCommitT(from: number, targetNode: RoutePathNode) {
    if (!pathSampler?.totalLength) {
      return from + (targetNode.pathT - from) * routeNodeCommitFallbackProgress;
    }

    const edgeInsetT = nodeEdgeCommitRadius / pathSampler.totalLength;
    return Math.max(from, Math.min(targetNode.pathT, targetNode.pathT - edgeInsetT));
  }

  function easeRouteTravel(t: number) {
    if (t < 0.18) {
      const local = t / 0.18;
      return 0.22 * (1 - Math.pow(1 - local, 2));
    }
    const local = (t - 0.18) / 0.82;
    return 0.22 + 0.78 * (1 - Math.pow(1 - local, 3));
  }

  function animateUnlockedRoute(
    from: number,
    to: number,
    commitAtT: number,
    onComplete?: () => void,
    onReachNode?: () => void
  ) {
    cancelAnimationFrame(splitAnimationFrame);
    splitAnimationTarget = to;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || to <= from) {
      displayedLockedStartT = to;
      onReachNode?.();
      onComplete?.();
      return;
    }

    const startTime = performance.now();
    const duration = routeAnimationDuration;
    const startKick = routeStartKick;
    displayedLockedStartT = from + (to - from) * startKick;
    performance.mark("lumen:route-advance-kick");
    progressFrameNotMarked = true;

    function tick(now: number) {
      if (progressFrameNotMarked) {
        performance.mark("lumen:route-advance-first-frame");
        progressFrameNotMarked = false;
      }
      const progress = Math.min(1, (now - startTime) / duration);
      const easedProgress = startKick + (1 - startKick) * easeRouteTravel(progress);
      displayedLockedStartT = from + (to - from) * easedProgress;

      if (!advanceCommitDone && displayedLockedStartT >= commitAtT) {
        onReachNode?.();
      }

      if (progress < 1) {
        splitAnimationFrame = requestAnimationFrame(tick);
      } else {
        displayedLockedStartT = to;
        onReachNode?.();
        onComplete?.();
      }
    }

    splitAnimationFrame = requestAnimationFrame(tick);
  }

  let progressFrameNotMarked = false;
</script>

<main class="lumen-route-app" style={themeVars(module.theme)}>
  <div
    class="stage-viewport"
    style={`width:${layoutWidth * scale}px; height:${layoutHeight * scale}px;`}
  >
    <section
      class="route-stage"
      class:compact={compactLayout}
      aria-label={`${module.routeTitle}, módulo ${module.moduleNumber}: ${module.title}`}
      style={`--stage-scale:${scale}; --layout-width:${layoutWidth}px; --stage-height:${layoutHeight}px; --content-offset:${contentOffset}px; --route-art-scale:${routeArtScale};`}
    >
      <div class="background-layer"></div>
      {#if deferredVisualsReady}
        <div class="code-ghost" aria-hidden="true">
          {#each codeLines as line}
            <span>{line || "\u00a0"}</span>
          {/each}
        </div>
      {/if}

      <RouteHeader
        routeTitle={module.routeTitle}
        moduleNumber={module.moduleNumber}
        title={module.title}
        subtitle={module.subtitle}
      />

      {#if deferredVisualsReady}
        <ProgressCard completed={completedCount} total={module.total} percent={completionPercent} />
      {/if}

      <SnakeLayer path={module.path} theme={module.theme} lockedStartT={displayedLockedStartT} renderScale={scale} />
      {#if deferredVisualsReady}
        <NodeOverlay
          path={module.path}
          nodes={interactiveNodes}
          theme={module.theme}
          isReviewing={Boolean(reviewNodeId)}
          onNodeSelect={handleNodeSelect}
        />
      {/if}

      <div class="hero-text-input">
        {#if deferredVisualsReady}
          <HeroTextSticker src={heroAsset} />
        {/if}
      </div>

      {#if deferredVisualsReady}
        <BottomCta
          label={module.nextAction.label}
          targetTitle={nextTargetTitle}
          disabled={!canContinue}
          onContinue={continueToNextNode}
        />
      {/if}
    </section>
  </div>
</main>

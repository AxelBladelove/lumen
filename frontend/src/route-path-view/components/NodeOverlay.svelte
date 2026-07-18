<script lang="ts">
  import { onDestroy } from "svelte";
  import NodeStringInputIcon from "./NodeStringInputIcon.svelte";
  import { createPathSampler, type PathSampler } from "../path/pathMetrics";
  import { publicAsset } from "../theme/moduleTheme";
  import {
    expireLockedNodeHint,
    lockedNodeHintCopy,
    lockedNodeHintDurationMs,
    showLockedNodeHint,
    type LockedNodeHintState
  } from "../state/lockedNodeHintState";
  import type { ModuleTheme, RoutePathNode, SnakePathConfig } from "../types/routePath";

  export let path: SnakePathConfig;
  export let nodes: RoutePathNode[];
  export let theme: ModuleTheme;
  export let isReviewing = false;
  export let onNodeSelect: ((node: RoutePathNode) => void) | undefined = undefined;

  let sampler: PathSampler | null =
    typeof document !== "undefined" && path?.pathD
      ? createPathSampler(path.pathD, path.transform)
      : null;
  let placedNodes: Array<{ node: RoutePathNode; place: ReturnType<typeof placement> }> = [];
  let lockedNodeHint: LockedNodeHintState | null = null;
  let lockedNodeHintTimer = 0;

  const assets = {
    completed: publicAsset("assets/route-nodes/node-completed-green.runtime.webp"),
    active: publicAsset("assets/route-nodes/node-current-empty-green.runtime.webp"),
    locked: publicAsset("assets/route-nodes/node-locked-green.runtime.webp"),
    challenge: publicAsset("assets/route-nodes/node-challenge-purple.runtime.webp")
  };

  const motionParticles = [
    { x: 48, y: 13, dx: 1, dy: -12, size: 2.8, delay: 0 },
    { x: 72, y: 24, dx: 11, dy: -8, size: 2.4, delay: 38 },
    { x: 84, y: 49, dx: 13, dy: 1, size: 2.2, delay: 74 },
    { x: 64, y: 76, dx: 7, dy: 10, size: 2.4, delay: 108 },
    { x: 31, y: 75, dx: -9, dy: 9, size: 2.1, delay: 58 },
    { x: 17, y: 44, dx: -11, dy: -1, size: 2.5, delay: 96 },
    { x: 39, y: 31, dx: -5, dy: -7, size: 1.9, delay: 132 },
    { x: 58, y: 58, dx: 5, dy: 6, size: 1.8, delay: 156 },
    { x: 50, y: 8, dx: 0, dy: -18, size: 3.2, delay: 18 },
    { x: 76, y: 22, dx: 14, dy: -10, size: 2.8, delay: 66 },
    { x: 88, y: 51, dx: 18, dy: 0, size: 2.4, delay: 106 },
    { x: 65, y: 82, dx: 10, dy: 14, size: 2.7, delay: 140 },
    { x: 30, y: 78, dx: -12, dy: 12, size: 2.4, delay: 90 },
    { x: 14, y: 44, dx: -16, dy: -2, size: 2.9, delay: 130 }
  ];

  $: if (path?.pathD) {
    sampler = createPathSampler(path.pathD, path.transform);
  }

  $: placedNodes = nodes.map((node) => ({ node, place: placement(node, sampler) }));

  function placement(node: RoutePathNode, pathSampler: PathSampler | null) {
    const point = pathSampler?.pointAt(node.pathT) ?? {
      x: 0,
      y: 0,
      tangent: { x: 0, y: 1 },
      normal: { x: -1, y: 0 },
      angle: Math.PI / 2
    };
    const offset = node.nodeOffset ?? { x: 0, y: 0 };
    const labelOffset = node.labelOffset ?? { x: 0, y: 0 };
    const anchor = {
      x: point.x + offset.x,
      y: point.y + offset.y
    };
    const size = node.status === "active" ? node.size ?? 126 : 86;
    const labelDistance = node.status === "active" ? 98 : node.status === "challenge" ? 82 : 76;
    const side = node.labelSide === "left" ? -1 : 1;
    const yLift = node.status === "active" ? -22 : -19;
    const labelFineTune = contextualLabelOffset(node);
    const labelX =
      anchor.x +
      side * labelDistance +
      labelOffset.x +
      labelFineTune.x -
      (side < 0 ? 300 : 0);
    const labelY = anchor.y + yLift + labelOffset.y + labelFineTune.y;
    const shadowWidth = size * (node.status === "active" ? 1.32 : node.status === "challenge" ? 1.18 : 1.14);
    const shadowHeight = size * (node.status === "active" ? 0.42 : 0.38);
    const depthDrop = node.status === "active" ? 32 : 25;
    const shadowX = anchor.x + point.normal.x * 2 + 3 - shadowWidth / 2;
    const shadowY = anchor.y + point.normal.y * 1 + depthDrop - shadowHeight / 2;
    const contactWidth = size * (node.status === "active" ? 0.98 : 1.02);
    const contactHeight = node.status === "active" ? 29 : 27;
    const contactX = point.x - contactWidth / 2;
    const contactY = point.y - contactHeight / 2;
    const rimWidth = size * (node.status === "active" ? 1.04 : 1.12);
    const rimHeight = node.status === "active" ? 16 : 15;
    const rimX = point.x - rimWidth / 2;
    const rimY = point.y - rimHeight / 2;

    return {
      point,
      anchor,
      size,
      labelX,
      labelY,
      nodeX: anchor.x - size / 2,
      nodeY: anchor.y - size / 2,
      shadowX,
      shadowY,
      shadowWidth,
      shadowHeight,
      shadowAngle: -0.16 + point.normal.x * 0.08,
      contactX,
      contactY,
      contactWidth,
      contactHeight,
      contactAngle: point.angle,
      rimX,
      rimY,
      rimWidth,
      rimHeight
    };
  }

  function contextualLabelOffset(node: RoutePathNode) {
    const offset = { x: 0, y: 0 };

    if (node.id === "string-functions" && node.status === "active") {
      offset.y -= 16;
    }

    if (node.reviewMode !== "repeat") return offset;

    const repeatOffsets: Record<string, number> = {
      "hello-world": -10,
      "string-functions": -34,
      "string-compare": -10
    };

    offset.y += repeatOffsets[node.id] ?? 0;

    if (node.id === "string-functions") {
      offset.x += 20;
    }

    return offset;
  }

  function iconLabel(node: RoutePathNode) {
    if (node.status === "active") return "Concepto actual";
    if (node.status === "challenge") return "Reto, bloqueado";
    if (node.status === "locked") return `${node.title}, bloqueado`;
    return node.title;
  }

  function handleNodeActivation(node: RoutePathNode) {
    // Conserva el callback existente; la explicación es presentación local y
    // no introduce un mensaje ni una razón de bloqueo nuevos en el protocolo.
    onNodeSelect?.(node);
    if (node.status !== "locked" && node.status !== "challenge") return;

    const hint = showLockedNodeHint(node.id, performance.now());
    lockedNodeHint = hint;
    window.clearTimeout(lockedNodeHintTimer);
    lockedNodeHintTimer = window.setTimeout(() => {
      lockedNodeHint = expireLockedNodeHint(lockedNodeHint, hint.expiresAt);
    }, lockedNodeHintDurationMs);
  }

  onDestroy(() => {
    window.clearTimeout(lockedNodeHintTimer);
  });

  function motionClass(node: RoutePathNode) {
    return node.motion ? `motion-${node.motion}` : "";
  }

  function nodeStateClass(node: RoutePathNode) {
    const reviewClass = node.reviewMode === "repeat" ? "review-repeat" : "";
    const mutedClass = isReviewing && node.status === "active" ? "review-muted" : "";
    return `${node.status} ${reviewClass} ${mutedClass} ${motionClass(node)}`.trim();
  }
</script>

<div class="node-overlay" style={`--node-tint:${theme.nodeTintFilter ?? "none"}`}>
  {#each placedNodes as { node, place } (node.id)}
    <span
      class={`node-contact-rim ${nodeStateClass(node)}`}
      style={`
        left:${place.rimX}px;
        top:${place.rimY}px;
        width:${place.rimWidth}px;
        height:${place.rimHeight}px;
        transform:rotate(${place.contactAngle}rad);
      `}
    ></span>
    <span
      class={`node-contact ${nodeStateClass(node)}`}
      style={`
        left:${place.contactX}px;
        top:${place.contactY}px;
        width:${place.contactWidth}px;
        height:${place.contactHeight}px;
        transform:rotate(${place.contactAngle}rad);
      `}
    ></span>
    <span
      class={`node-shadow ${nodeStateClass(node)}`}
      style={`
        left:${place.shadowX}px;
        top:${place.shadowY}px;
        width:${place.shadowWidth}px;
        height:${place.shadowHeight}px;
        --node-shadow-angle:${place.shadowAngle}rad;
        transform:rotate(var(--node-shadow-angle));
      `}
    ></span>

    <button
      class={`route-node ${nodeStateClass(node)}`}
      type="button"
      aria-label={iconLabel(node)}
      onclick={() => handleNodeActivation(node)}
      style={`
        left:${place.nodeX}px;
        top:${place.nodeY}px;
        width:${place.size}px;
        height:${place.size}px;
      `}
    >
      <img
        src={assets[node.status]}
        alt=""
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        draggable="false"
      />
      {#if node.status === "active"}
        <span class={`active-text-icon ${motionClass(node)}`} aria-hidden="true">
          <NodeStringInputIcon />
        </span>
      {/if}
      {#if node.motion}
        <span class={`node-motion-sheen ${motionClass(node)}`} aria-hidden="true"></span>
        <span class={`node-motion-sparks ${motionClass(node)}`} aria-hidden="true">
          {#each motionParticles as particle}
            <span
              class="node-motion-spark"
              style={`
                --spark-x:${particle.x}%;
                --spark-y:${particle.y}%;
                --spark-dx:${particle.dx}px;
                --spark-dy:${particle.dy}px;
                --spark-size:${particle.size}px;
                --spark-delay:${particle.delay}ms;
              `}
            ></span>
          {/each}
        </span>
      {/if}
    </button>

    {#if lockedNodeHint?.nodeId === node.id}
      {#key lockedNodeHint.shownAt}
        <div
          class="locked-node-hint"
          role="status"
          aria-live="polite"
          style={`left:${place.anchor.x}px; top:${place.nodeY - 12}px;`}
        >
          {lockedNodeHintCopy}
        </div>
      {/key}
    {/if}

    <div
      class={`node-label ${nodeStateClass(node)}`}
      style={`
        left:${place.labelX}px;
        top:${place.labelY}px;
      `}
    >
      <h3>{node.title}</h3>
      <p>{node.subtitle}</p>
      {#if node.status === "active"}
        <span class="continue-badge">SIGUE AQUÍ</span>
      {:else if node.reviewMode === "repeat"}
        <span class="continue-badge repeat">REPETIR</span>
      {/if}
    </div>
  {/each}
</div>

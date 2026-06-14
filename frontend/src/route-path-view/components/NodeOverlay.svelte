<script lang="ts">
  import { onMount } from "svelte";
  import NodeStringInputIcon from "./NodeStringInputIcon.svelte";
  import { createPathSampler, type PathSampler } from "../path/pathMetrics";
  import { publicAsset } from "../theme/moduleTheme";
  import type { ModuleTheme, RoutePathNode, SnakePathConfig } from "../types/routePath";

  export let path: SnakePathConfig;
  export let nodes: RoutePathNode[];
  export let theme: ModuleTheme;

  let sampler: PathSampler | null = null;
  let mounted = false;
  let placedNodes: Array<{ node: RoutePathNode; place: ReturnType<typeof placement> }> = [];

  const assets = {
    completed: publicAsset("assets/route-nodes/node-completed-green.runtime.webp"),
    active: publicAsset("assets/route-nodes/node-current-empty-green.runtime.webp"),
    locked: publicAsset("assets/route-nodes/node-locked-green.runtime.webp"),
    challenge: publicAsset("assets/route-nodes/node-challenge-purple.runtime.webp")
  };

  onMount(() => {
    mounted = true;
    sampler = createPathSampler(path.pathD, path.transform);
  });

  $: if (mounted && path?.pathD) {
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
    const labelX = anchor.x + side * labelDistance + labelOffset.x;
    const labelY = anchor.y + yLift + labelOffset.y;
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

  function iconLabel(node: RoutePathNode) {
    if (node.status === "active") return "Concepto actual";
    if (node.status === "challenge") return "Reto";
    return node.title;
  }
</script>

<div class="node-overlay" style={`--node-tint:${theme.nodeTintFilter ?? "none"}`}>
  {#each placedNodes as { node, place } (node.id)}
    <span
      class={`node-contact-rim ${node.status}`}
      style={`
        left:${place.rimX}px;
        top:${place.rimY}px;
        width:${place.rimWidth}px;
        height:${place.rimHeight}px;
        transform:rotate(${place.contactAngle}rad);
      `}
    ></span>
    <span
      class={`node-contact ${node.status}`}
      style={`
        left:${place.contactX}px;
        top:${place.contactY}px;
        width:${place.contactWidth}px;
        height:${place.contactHeight}px;
        transform:rotate(${place.contactAngle}rad);
      `}
    ></span>
    <span
      class={`node-shadow ${node.status}`}
      style={`
        left:${place.shadowX}px;
        top:${place.shadowY}px;
        width:${place.shadowWidth}px;
        height:${place.shadowHeight}px;
        transform:rotate(${place.shadowAngle}rad);
      `}
    ></span>

    <button
      class={`route-node ${node.status}`}
      type="button"
      aria-label={iconLabel(node)}
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
        loading="eager"
        decoding="async"
        fetchpriority={node.status === "active" || node.status === "completed" ? "high" : "auto"}
        draggable="false"
      />
      {#if node.status === "active"}
        <span class="active-text-icon" aria-hidden="true">
          <NodeStringInputIcon />
        </span>
      {/if}
    </button>

    <div class={`node-label ${node.status}`} style={`left:${place.labelX}px; top:${place.labelY}px;`}>
      <h3>{node.title}</h3>
      <p>{node.subtitle}</p>
      {#if node.status === "active"}
        <span class="continue-badge">SIGUE AQUÍ</span>
      {/if}
    </div>
  {/each}
</div>

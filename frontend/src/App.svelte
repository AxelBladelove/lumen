<script lang="ts">
  import { onMount } from "svelte";
  import RoutePathView from "./route-path-view/RoutePathView.svelte";
  import { lumenBrand, ensureLumenFavicon } from "./brand/lumenBrand";
  import {
    cloneRouteModule,
    createInitialRouteModule,
    routeModuleDataSource
  } from "./route-path-view/data/routeModuleSource";
  import type { RoutePathNode } from "./route-path-view/types/routePath";
  import { lumenWebviewProtocolVersion } from "./webview/messages";
  import { createVscodeBridge } from "./webview/vscodeBridge";

  const bridge = createVscodeBridge();
  let routeModule = createInitialRouteModule();

  onMount(() => {
    ensureLumenFavicon();

    const stopListening = bridge.onMessage((message) => {
      if (message.type === "route.module.snapshot") {
        routeModule = cloneRouteModule(message.payload.module);
      }

      if (message.type === "route.exercise.completed") {
        window.dispatchEvent(
          new CustomEvent("lumen:exercise-completed", {
            detail: { nodeId: message.payload.nodeId }
          })
        );
      }
    });

    bridge.post({
      type: "frontend.ready",
      payload: {
        protocolVersion: lumenWebviewProtocolVersion,
        view: "route-path-view",
        routeId: "route-c",
        moduleId: routeModule.path.id,
        dataSource: routeModuleDataSource
      }
    });

    return stopListening;
  });

  function handleNodeSelected(node: RoutePathNode) {
    bridge.post({
      type: "route.node.selected",
      payload: {
        nodeId: node.id,
        status: node.status,
        nodeType: node.type
      }
    });
  }

  function handleContinueRequest(payload: { fromNodeId?: string; nextNodeId?: string }) {
    bridge.post({
      type: "route.continue.requested",
      payload
    });
  }
</script>

<RoutePathView
  module={routeModule}
  onNodeSelected={handleNodeSelected}
  onContinueRequest={handleContinueRequest}
/>

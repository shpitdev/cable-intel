<script lang="ts">
  import type { IdentifyMode } from "$lib/types";
  import {
    catalogSearchStore,
    identifyModeStore,
  } from "$lib/workspace-ui-state";

  const links = [{ to: "/", label: "Workspace" }];

  const setIdentifyMode = (mode: IdentifyMode): void => {
    identifyModeStore.set(mode);
  };
</script>

<header class="top-nav">
  <div class="top-nav-inner">
    <a href="/" class="block">
      <p class="brand-title">Cable Intel</p>
      <p class="brand-subtitle">Find cables without guesswork</p>
    </a>

    <div class="top-nav-controls">
      <div class="segment-control nav-segment-control">
        <button
          type="button"
          class={$identifyModeStore === "catalog" ? "is-active" : ""}
          onclick={() => setIdentifyMode("catalog")}
        >
          Catalog
        </button>
        <button
          type="button"
          class={$identifyModeStore === "markings" ? "is-active" : ""}
          onclick={() => setIdentifyMode("markings")}
        >
          Manual entry
        </button>
      </div>

      {#if $identifyModeStore === "catalog"}
        <label class="nav-search-field">
          <span class="sr-only">Catalog query</span>
          <input
            type="text"
            class="nav-search-input"
            placeholder='Try: "usb-c to c, 240w, braided, anker"'
            bind:value={$catalogSearchStore}
          >
        </label>
      {/if}
    </div>

    <nav class="flex items-center gap-2" aria-label="Main">
      {#each links as link (link.to)}
        <a href={link.to} class="nav-link">{link.label}</a>
      {/each}
    </nav>
  </div>
</header>

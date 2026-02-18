<script lang="ts">
  import "../app.css";
  import { setupConvex } from "convex-svelte";
  import { PUBLIC_CONVEX_URL } from "$env/static/public";
  import Header from "../components/header.svelte";

  const { children } = $props();
  setupConvex(PUBLIC_CONVEX_URL);
</script>

<div class="grid h-svh grid-rows-[auto_1fr]">
  <Header />
  <main class="app-main">{@render children()}</main>
</div>

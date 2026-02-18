<script lang="ts">
  import "../app.css";
  import { setupConvex } from "convex-svelte";
  import { PUBLIC_CONVEX_URL } from "$env/static/public";
  import Header from "../components/header.svelte";

  const { children } = $props();
  const convexUrl = PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "Missing PUBLIC_CONVEX_URL. Set it directly or configure CONVEX_DEPLOY_KEY in Vercel."
    );
  }
  setupConvex(convexUrl);
</script>

<div class="grid h-svh grid-rows-[auto_1fr]">
  <Header />
  <main class="app-main">{@render children()}</main>
</div>

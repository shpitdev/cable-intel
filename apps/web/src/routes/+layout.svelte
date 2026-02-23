<script lang="ts">
  import "../app.css";
  import { setupConvex } from "convex-svelte";
  import { page } from "$app/state";
  import { env as publicEnv } from "$env/dynamic/public";
  import Header from "../components/header.svelte";

  const { children } = $props();
  const siteName = "Cable Intel";
  const siteDescription =
    "Identify charging cables fast and pick the right label without guesswork.";
  const currentUrl = $derived(page.url.toString());
  const openGraphImageUrl = $derived(
    new URL("/opengraph.svg", page.url).toString()
  );
  const convexUrl = publicEnv.PUBLIC_CONVEX_URL?.trim();
  const fallbackConvexUrl = "https://placeholder.convex.cloud";
  setupConvex(convexUrl || fallbackConvexUrl, {
    disabled: !convexUrl,
  });
</script>

<svelte:head>
  <title>{siteName}</title>
  <meta name="description" content={siteDescription}>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content={siteName}>
  <meta property="og:title" content={siteName}>
  <meta property="og:description" content={siteDescription}>
  <meta property="og:url" content={currentUrl}>
  <meta property="og:image" content={openGraphImageUrl}>
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content={siteName}>
  <meta name="twitter:description" content={siteDescription}>
  <meta name="twitter:image" content={openGraphImageUrl}>
</svelte:head>

<div class="grid h-svh grid-rows-[auto_1fr]">
  <Header />
  <main class="app-main">{@render children()}</main>
</div>

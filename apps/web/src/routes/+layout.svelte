<script lang="ts">
  import "../app.css";
  import { setupConvex } from "convex-svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { PUBLIC_CONVEX_URL } from "$env/static/public";
  import Header from "../components/header.svelte";

  const PLACEHOLDER_CONVEX_URL = "https://placeholder.convex.cloud";
  const { children } = $props();
  const siteName = "Cable Intel";
  const siteDescription =
    "Identify charging cables fast and pick the right label without guesswork.";
  const currentUrl = $derived(page.url.toString());
  const openGraphImageUrl = $derived(
    new URL("/opengraph.svg", page.url).toString()
  );
  const isConvexDisabled =
    !browser || PUBLIC_CONVEX_URL === PLACEHOLDER_CONVEX_URL;
  setupConvex(PUBLIC_CONVEX_URL, {
    disabled: isConvexDisabled,
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

<script lang="ts">
  const links = [{ to: "/", label: "Workspace" }];
</script>

<header class="top-nav">
  <div class="top-nav-inner">
    <a href="/" class="block">
      <p class="brand-title">Cable Intel</p>
      <p class="brand-subtitle">Find cables without guesswork</p>
    </a>

    <nav class="flex items-center gap-2" aria-label="Main">
      {#each links as link (link.to)}
        <a href={link.to} class="nav-link">{link.label}</a>
      {/each}
    </nav>
  </div>
</header>

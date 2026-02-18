<script lang="ts">
  import type { CableProfile } from "$lib/types";

  interface Props {
    profile: CableProfile | null;
  }

  let { profile }: Props = $props();

  const formatWatts = (value?: number): string => {
    return typeof value === "number" ? `${value}W` : "Not listed";
  };

  const formatData = (profileValue: CableProfile): string => {
    const parts: string[] = [];
    if (typeof profileValue.data.maxGbps === "number") {
      parts.push(`${profileValue.data.maxGbps}Gbps`);
    }
    if (profileValue.data.usbGeneration) {
      parts.push(profileValue.data.usbGeneration);
    }
    return parts.join(" / ") || "Not listed";
  };

  const getVideoSupportText = (value?: boolean): string => {
    if (value === undefined) {
      return "Not listed";
    }
    return value ? "Yes" : "No";
  };

  const formatVideoCeiling = (profileValue: CableProfile): string => {
    const parts: string[] = [];
    if (profileValue.video.maxResolution) {
      parts.push(profileValue.video.maxResolution);
    }
    if (typeof profileValue.video.maxRefreshHz === "number") {
      parts.push(`${profileValue.video.maxRefreshHz}Hz`);
    }

    return parts.join(" / ") || "Not listed";
  };

  const getDisplayName = (profileValue: CableProfile): string => {
    const fallback = [profileValue.brand, profileValue.model]
      .filter(Boolean)
      .join(" ");
    return profileValue.displayName ?? (fallback || "Unnamed cable");
  };

  const getPrimaryImage = (profileValue: CableProfile): string | undefined => {
    const firstImage = profileValue.imageUrls?.find((url) => Boolean(url));
    return firstImage || undefined;
  };

  const hasProfileImage = (profileValue: CableProfile): boolean => {
    return Boolean(getPrimaryImage(profileValue));
  };
</script>

<section class="panel panel-soft fade-in delay-2">
  <div class="flex items-center justify-between gap-3">
    <h3 class="panel-title">Cable Profile</h3>
    {#if profile?.source}
      <span class="tag">{profile.source}</span>
    {/if}
  </div>

  {#if !profile}
    <p class="panel-subtitle">
      Select a cable from catalog or enter markings to populate this summary.
    </p>
  {:else}
    <div class="profile-media mt-2">
      {#if hasProfileImage(profile)}
        <img
          src={getPrimaryImage(profile)}
          alt={`${getDisplayName(profile)} image`}
          class="profile-image h-full w-full object-contain"
          loading="lazy"
        >
      {:else}
        <p class="note">Catalog image not available for this cable.</p>
      {/if}
    </div>

    <p class="mt-2 text-sm font-semibold text-[color:var(--ink-strong)]">
      {getDisplayName(profile)}
    </p>

    {#if profile.productUrl}
      <a
        href={profile.productUrl}
        target="_blank"
        rel="noopener"
        class="inline-action mt-2 inline-flex"
      >
        View product page
      </a>
    {/if}

    <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt class="field-label">Connector pair</dt>
        <dd class="text-[color:var(--ink-strong)]">
          {profile.connectorFrom}
          to {profile.connectorTo}
        </dd>
      </div>
      <div>
        <dt class="field-label">Max power</dt>
        <dd class="text-[color:var(--ink-strong)]">
          {formatWatts(profile.power.maxWatts)}
        </dd>
      </div>
      <div>
        <dt class="field-label">Data class</dt>
        <dd class="text-[color:var(--ink-strong)]">{formatData(profile)}</dd>
      </div>
      <div>
        <dt class="field-label">Video support</dt>
        <dd class="text-[color:var(--ink-strong)]">
          {getVideoSupportText(profile.video.explicitlySupported)}
        </dd>
      </div>
      <div class="sm:col-span-2">
        <dt class="field-label">Video ceiling</dt>
        <dd class="text-[color:var(--ink-strong)]">
          {formatVideoCeiling(profile)}
        </dd>
      </div>
    </dl>
  {/if}
</section>

<script lang="ts">
  import type { CableProfile } from "$lib/types";

  const WHITESPACE_REGEX = /\s+/;

  const VARIANT_COLOR_HEX: Record<string, string> = {
    black: "#1f2937",
    white: "#f8fafc",
    gray: "#9ca3af",
    grey: "#9ca3af",
    silver: "#cbd5e1",
    blue: "#2563eb",
    red: "#dc2626",
    green: "#16a34a",
    orange: "#ea580c",
    pink: "#ec4899",
    purple: "#9333ea",
    yellow: "#f59e0b",
    gold: "#d4a017",
  };

  interface Props {
    cables: CableProfile[];
    onSelect: (variantId: string) => void;
    selectedVariantId: string;
  }

  interface CatalogGroup {
    key: string;
    productUrl?: string;
    variants: CableProfile[];
  }

  interface ColorToken {
    hex: string;
    label: string;
  }

  let { cables, selectedVariantId, onSelect }: Props = $props();

  let failedImagesById = $state<Record<string, boolean>>({});

  const getGroupKey = (profile: CableProfile): string => {
    const productUrl = profile.productUrl?.trim();
    if (productUrl) {
      return productUrl;
    }

    return [
      profile.brand,
      profile.model,
      profile.connectorFrom,
      profile.connectorTo,
    ]
      .filter(Boolean)
      .join("::");
  };

  const getTitle = (profile: CableProfile): string => {
    const fromDisplay = profile.displayName?.trim();
    if (fromDisplay) {
      return fromDisplay;
    }

    const pieces = [profile.brand, profile.model, profile.variant].filter(
      Boolean
    );
    return pieces.length > 0 ? pieces.join(" ") : "Unnamed cable";
  };

  const getVariantLabel = (profile: CableProfile): string => {
    const variant = profile.variant?.trim();
    if (variant) {
      return variant;
    }

    const sku = profile.sku?.trim();
    if (sku) {
      return sku;
    }

    return "Standard";
  };

  const getVariantSpec = (profile: CableProfile): string => {
    const parts: string[] = [];
    if (typeof profile.power.maxWatts === "number") {
      parts.push(`${profile.power.maxWatts}W`);
    }

    if (typeof profile.data.maxGbps === "number") {
      parts.push(`${profile.data.maxGbps}Gbps`);
    } else if (profile.data.usbGeneration) {
      parts.push(profile.data.usbGeneration);
    }

    return parts.join(" • ");
  };

  const getDetail = (profile: CableProfile): string => {
    const detail = [`${profile.connectorFrom} to ${profile.connectorTo}`];
    const variantSpec = getVariantSpec(profile);

    if (variantSpec) {
      detail.push(variantSpec);
    }

    return detail.join(" • ");
  };

  const getPreviewImageUrl = (profile: CableProfile): string | null => {
    const firstValidImage = profile.imageUrls?.find((url) => Boolean(url));
    if (
      !firstValidImage ||
      (profile.variantId && failedImagesById[profile.variantId])
    ) {
      return null;
    }
    return firstValidImage;
  };

  const getFallbackText = (profile: CableProfile): string => {
    const title = getTitle(profile);
    const words = title.split(WHITESPACE_REGEX).filter(Boolean).slice(0, 2);

    if (words.length === 0) {
      return "CB";
    }
    return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
  };

  const markImageFailed = (variantId: string): void => {
    failedImagesById = {
      ...failedImagesById,
      [variantId]: true,
    };
  };

  const getVariantColors = (profile: CableProfile): ColorToken[] => {
    const probe = [profile.variant, profile.sku, profile.displayName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const tokens: ColorToken[] = [];

    for (const [label, hex] of Object.entries(VARIANT_COLOR_HEX)) {
      if (!probe.includes(label)) {
        continue;
      }
      tokens.push({
        label: `${label[0]?.toUpperCase() ?? ""}${label.slice(1)}`,
        hex,
      });
    }

    return tokens.slice(0, 3);
  };

  const groups = $derived.by(() => {
    const grouped = new Map<string, CatalogGroup>();

    for (const cable of cables) {
      const key = getGroupKey(cable);
      const existing = grouped.get(key);

      if (existing) {
        existing.variants.push(cable);
        if (!existing.productUrl && cable.productUrl) {
          existing.productUrl = cable.productUrl;
        }
      } else {
        grouped.set(key, {
          key,
          productUrl: cable.productUrl,
          variants: [cable],
        });
      }
    }

    // Keep backend-ranked order so search intent (brand/connector/power) stays visible.
    return [...grouped.values()];
  });

  const getPrimaryVariant = (group: CatalogGroup): CableProfile | null => {
    const selected = group.variants.find(
      (variant) => variant.variantId === selectedVariantId
    );
    return selected ?? group.variants[0] ?? null;
  };

  const isGroupSelected = (group: CatalogGroup): boolean => {
    return group.variants.some(
      (variant) => variant.variantId === selectedVariantId
    );
  };
</script>

<div class="catalog-picker">
  {#if groups.length === 0}
    <p
      class="note rounded-xl border border-[color:var(--line)] bg-white/65 p-3"
    >
      No cables match this filter.
    </p>
  {:else}
    <ul class="catalog-results space-y-3 pb-3">
      {#each groups as group (group.key)}
        {@const primary = getPrimaryVariant(group)}
        {#if primary?.variantId}
          <li class="catalog-group">
            <button
              type="button"
              class={`list-card list-card-main ${isGroupSelected(group) ? "is-selected" : ""}`}
              onmousedown={(event) => {
                event.preventDefault();
              }}
              onclick={() => onSelect(primary.variantId ?? "")}
            >
              <div class="grid grid-cols-[4rem_1fr] gap-3">
                {#if getPreviewImageUrl(primary)}
                  <img
                    src={getPreviewImageUrl(primary) ?? ""}
                    alt={`${getTitle(primary)} product preview`}
                    class="h-16 w-16 rounded-lg border border-[color:var(--line)] object-cover"
                    loading="lazy"
                    onerror={() => markImageFailed(primary.variantId ?? "")}
                  >
                {:else}
                  <div
                    class="h-16 w-16 grid place-items-center rounded-lg border border-[color:var(--line)] bg-white/60 text-sm font-semibold text-[color:var(--ink-muted)]"
                  >
                    {getFallbackText(primary)}
                  </div>
                {/if}

                <div class="min-w-0 space-y-1">
                  <p
                    class="truncate text-[0.95rem] font-semibold text-[color:var(--ink-strong)]"
                  >
                    {getTitle(primary)}
                  </p>
                  <p class="text-xs text-[color:var(--ink-muted)]">
                    {getDetail(primary)}
                  </p>
                </div>
              </div>
            </button>

            <div class="catalog-actions">
              {#if group.variants.length > 1}
                <span class="variant-count"
                  >{group.variants.length}
                  versions</span
                >
              {/if}

              {#if group.productUrl}
                <a
                  href={group.productUrl}
                  class="inline-action"
                  target="_blank"
                  rel="noopener"
                >
                  Open product
                </a>
              {/if}
            </div>

            {#if group.variants.length > 1}
              <div class="variant-chip-row">
                {#each group.variants as variant (variant.variantId)}
                  {#if variant.variantId}
                    <button
                      type="button"
                      class={`variant-chip ${selectedVariantId === variant.variantId ? "is-selected" : ""}`}
                      onmousedown={(event) => {
                        event.preventDefault();
                      }}
                      onclick={() => onSelect(variant.variantId ?? "")}
                    >
                      <span class="variant-chip-label"
                        >{getVariantLabel(variant)}</span
                      >
                      {#if getVariantSpec(variant)}
                        <span class="variant-chip-meta"
                          >{getVariantSpec(variant)}</span
                        >
                      {/if}

                      {#if getVariantColors(variant).length > 0}
                        <span class="variant-swatches">
                          {#each getVariantColors(variant) as color (`${variant.variantId}-${color.label}`)}
                            <span
                              class="swatch-dot"
                              style={`--swatch:${color.hex}`}
                              title={color.label}
                              aria-label={color.label}
                            ></span>
                          {/each}
                        </span>
                      {/if}
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</div>

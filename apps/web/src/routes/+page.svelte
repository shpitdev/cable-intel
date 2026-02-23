<script lang="ts">
  import { api } from "@cable-intel/backend/convex/_generated/api";
  import { useQuery } from "convex-svelte";
  import { recommendLabels } from "$lib/labeling";
  import {
    buildProfileFromMarkings,
    mapCatalogRowToProfile,
  } from "$lib/mappers";
  import type {
    CableProfile,
    CatalogCableRow,
    MarkingsDraft,
  } from "$lib/types";
  import { DEFAULT_MARKINGS_DRAFT } from "$lib/types";
  import {
    catalogSearchStore,
    identifyModeStore,
  } from "$lib/workspace-ui-state";
  import CatalogPicker from "../components/catalog-picker.svelte";
  import LabelOutput from "../components/label-output.svelte";
  import MarkingsForm from "../components/markings-form.svelte";
  import ProfileSummary from "../components/profile-summary.svelte";

  const CATALOG_LIMIT = 100;
  const SEARCH_DEBOUNCE_MS = 120;
  const FACET_DIMENSIONS = [
    "brand",
    "type",
    "length",
    "color",
    "price",
  ] as const;
  type FacetDimension = (typeof FACET_DIMENSIONS)[number];
  const FACET_LABELS: Record<FacetDimension, string> = {
    brand: "Brand",
    type: "Type",
    length: "Length",
    color: "Color",
    price: "Price",
  };
  const FACET_ALL_VALUE = "__all__";
  const FACET_UNKNOWN_VALUE = "Unknown";
  const NUMERIC_VALUE_REGEX = /(\d+(?:\.\d+)?)/;
  const LENGTH_RANGE_REGEX =
    /(\d+(?:\.\d+)?)\s*(ft|feet|m|meter|meters|cm|in)\s*[/,]\s*(\d+(?:\.\d+)?)\s*(ft|feet|m|meter|meters|cm|in)/i;
  const LENGTH_SINGLE_REGEX =
    /(\d+(?:\.\d+)?)\s*(ft|feet|m|meter|meters|cm|in)\b/i;
  const COLOR_ORDER = [
    "Black",
    "White",
    "Gray",
    "Blue",
    "Green",
    "Red",
    "Orange",
    "Yellow",
    "Purple",
    "Pink",
    FACET_UNKNOWN_VALUE,
  ] as const;
  const TYPE_ORDER = [
    "C-C",
    "A-C",
    "A-A",
    "C-L",
    "A-L",
    "C-M",
    "A-M",
    "L-L",
    FACET_UNKNOWN_VALUE,
  ] as const;
  const PRICE_ORDER = [
    "<$10",
    "$10-$24",
    "$25-$49",
    "$50+",
    FACET_UNKNOWN_VALUE,
  ] as const;
  const COLOR_TOKENS: Array<{ label: string; tokens: string[] }> = [
    { label: "Black", tokens: ["midnight black", "black"] },
    { label: "White", tokens: ["cloud white", "white"] },
    { label: "Gray", tokens: ["grey", "gray", "silver"] },
    { label: "Blue", tokens: ["ice lake blue", "blue"] },
    { label: "Green", tokens: ["buds green", "green"] },
    { label: "Red", tokens: ["red"] },
    { label: "Orange", tokens: ["orange"] },
    { label: "Yellow", tokens: ["yellow", "gold"] },
    { label: "Purple", tokens: ["violet", "purple"] },
    { label: "Pink", tokens: ["pink"] },
  ];
  const CONNECTOR_SHORT_CODES: Record<string, string> = {
    "USB-C": "C",
    "USB-A": "A",
    Lightning: "L",
    "Micro-USB": "M",
    Unknown: "U",
  };
  const TYPE_LABELS: Record<string, string> = {
    "A-A": "USB-A to USB-A",
    "A-C": "USB-A to USB-C",
    "A-L": "USB-A to Lightning",
    "A-M": "USB-A to Micro-USB",
    "C-C": "USB-C to USB-C",
    "C-L": "USB-C to Lightning",
    "C-M": "USB-C to Micro-USB",
    "L-L": "Lightning to Lightning",
    [FACET_UNKNOWN_VALUE]: FACET_UNKNOWN_VALUE,
  };
  const DEFAULT_FACET_SELECTIONS: Record<FacetDimension, string[]> = {
    brand: [],
    type: [],
    length: [],
    color: [],
    price: [],
  };

  interface FacetOption {
    count: number;
    label: string;
    selected: boolean;
    value: string;
  }

  let debouncedCatalogSearch = $state("");
  const topCablesQuery = useQuery(api.ingestQueries.getTopCables, () => ({
    limit: CATALOG_LIMIT,
    searchQuery: debouncedCatalogSearch || undefined,
  }));

  let selectedVariantId = $state("");
  let facetSelections = $state<Record<FacetDimension, string[]>>({
    ...DEFAULT_FACET_SELECTIONS,
  });
  let markings = $state<MarkingsDraft>({ ...DEFAULT_MARKINGS_DRAFT });

  $effect(() => {
    const nextSearch = $catalogSearchStore.trim();
    const timeoutId = setTimeout(() => {
      debouncedCatalogSearch = nextSearch;
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  });

  const normalizeFacetToken = (value?: string): string => {
    return value?.trim() || FACET_UNKNOWN_VALUE;
  };

  const getConnectorCode = (value: string): string => {
    return CONNECTOR_SHORT_CODES[value] ?? "U";
  };

  const toLengthLabel = (rawValue: string, rawUnit: string): string => {
    const unit = rawUnit.toLowerCase();
    if (unit === "feet" || unit === "ft") {
      return `${rawValue} ft`;
    }
    if (unit === "meter" || unit === "meters" || unit === "m") {
      return `${rawValue} m`;
    }
    if (unit === "cm") {
      return `${rawValue} cm`;
    }
    return `${rawValue} in`;
  };

  const getBrandFacetValue = (profile: CableProfile): string => {
    return normalizeFacetToken(profile.brand);
  };

  const getTypeFacetValue = (profile: CableProfile): string => {
    const connectorCodes = [
      getConnectorCode(profile.connectorFrom),
      getConnectorCode(profile.connectorTo),
    ].sort((left, right) => left.localeCompare(right));
    const [first, second] = connectorCodes;
    if (!(first && second) || first === "U" || second === "U") {
      return FACET_UNKNOWN_VALUE;
    }
    return `${first}-${second}`;
  };

  const getLengthFacetValue = (profile: CableProfile): string => {
    const probe = [
      profile.variant,
      profile.displayName,
      profile.model,
      profile.sku,
    ]
      .filter(Boolean)
      .join(" ");
    const rangeMatch = probe.match(LENGTH_RANGE_REGEX);
    if (rangeMatch?.[1] && rangeMatch[2] && rangeMatch[3] && rangeMatch[4]) {
      return `${toLengthLabel(rangeMatch[1], rangeMatch[2])} / ${toLengthLabel(rangeMatch[3], rangeMatch[4])}`;
    }

    const singleMatch = probe.match(LENGTH_SINGLE_REGEX);
    if (singleMatch?.[1] && singleMatch[2]) {
      return toLengthLabel(singleMatch[1], singleMatch[2]);
    }

    return FACET_UNKNOWN_VALUE;
  };

  const getColorFacetValue = (profile: CableProfile): string => {
    const probe = [profile.variant, profile.displayName, profile.model]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const color of COLOR_TOKENS) {
      if (color.tokens.some((token) => probe.includes(token))) {
        return color.label;
      }
    }

    return FACET_UNKNOWN_VALUE;
  };

  const getPriceFacetValue = (profile: CableProfile): string => {
    const pricedProfile = profile as CableProfile & { priceUsd?: number };
    const price = pricedProfile.priceUsd;
    if (typeof price !== "number") {
      return FACET_UNKNOWN_VALUE;
    }
    if (price < 10) {
      return "<$10";
    }
    if (price < 25) {
      return "$10-$24";
    }
    if (price < 50) {
      return "$25-$49";
    }
    return "$50+";
  };

  const getFacetValue = (
    profile: CableProfile,
    dimension: FacetDimension
  ): string => {
    if (dimension === "brand") {
      return getBrandFacetValue(profile);
    }
    if (dimension === "type") {
      return getTypeFacetValue(profile);
    }
    if (dimension === "length") {
      return getLengthFacetValue(profile);
    }
    if (dimension === "color") {
      return getColorFacetValue(profile);
    }
    return getPriceFacetValue(profile);
  };

  const toFacetLabel = (dimension: FacetDimension, value: string): string => {
    if (dimension === "type") {
      return TYPE_LABELS[value] ?? value;
    }
    return value;
  };

  const getLengthSortValue = (value: string): number => {
    if (value === FACET_UNKNOWN_VALUE) {
      return Number.POSITIVE_INFINITY;
    }
    const match = value.match(NUMERIC_VALUE_REGEX);
    if (!match?.[1]) {
      return Number.POSITIVE_INFINITY;
    }
    return Number(match[1]);
  };

  const getOrderScore = (value: string, order: readonly string[]): number => {
    const index = order.indexOf(value);
    return index >= 0 ? index : order.length + 1;
  };

  const sortFacetValues = (
    dimension: FacetDimension,
    left: string,
    right: string
  ): number => {
    if (dimension === "length") {
      return getLengthSortValue(left) - getLengthSortValue(right);
    }
    if (dimension === "color") {
      return (
        getOrderScore(left, COLOR_ORDER) - getOrderScore(right, COLOR_ORDER)
      );
    }
    if (dimension === "type") {
      return getOrderScore(left, TYPE_ORDER) - getOrderScore(right, TYPE_ORDER);
    }
    if (dimension === "price") {
      return (
        getOrderScore(left, PRICE_ORDER) - getOrderScore(right, PRICE_ORDER)
      );
    }
    return left.localeCompare(right);
  };

  const allCatalogProfiles = $derived.by(() => {
    const rows = (topCablesQuery.data ?? []) as CatalogCableRow[];
    return rows.map(mapCatalogRowToProfile);
  });

  const baseFilteredCatalogProfiles = $derived.by(() => {
    return allCatalogProfiles;
  });

  const matchesFacetSelections = (
    profile: CableProfile,
    excludedDimension?: FacetDimension
  ): boolean => {
    for (const dimension of FACET_DIMENSIONS) {
      if (dimension === excludedDimension) {
        continue;
      }
      const selected = facetSelections[dimension];
      if (selected.length === 0) {
        continue;
      }
      const facetValue = getFacetValue(profile, dimension);
      if (!selected.includes(facetValue)) {
        return false;
      }
    }
    return true;
  };

  const filteredCatalogProfiles = $derived.by(() => {
    return baseFilteredCatalogProfiles.filter((profile) => {
      return matchesFacetSelections(profile);
    });
  });

  const catalogFacetOptions = $derived.by(() => {
    const byDimension = {} as Record<FacetDimension, FacetOption[]>;

    for (const dimension of FACET_DIMENSIONS) {
      const counts = new Map<string, number>();

      for (const profile of baseFilteredCatalogProfiles) {
        if (!matchesFacetSelections(profile, dimension)) {
          continue;
        }
        const value = getFacetValue(profile, dimension);
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }

      if (!counts.has(FACET_UNKNOWN_VALUE)) {
        counts.set(FACET_UNKNOWN_VALUE, 0);
      }

      const totalCount = [...counts.values()].reduce(
        (sum, count) => sum + count,
        0
      );
      const selectedValues = facetSelections[dimension];
      const dimensionOptions = [...counts.entries()]
        .map(([value, count]) => ({
          value,
          label: toFacetLabel(dimension, value),
          count,
          selected: selectedValues.includes(value),
        }))
        .sort((left, right) => {
          if (dimension === "brand") {
            if (right.count !== left.count) {
              return right.count - left.count;
            }
            return left.label.localeCompare(right.label);
          }
          return sortFacetValues(dimension, left.value, right.value);
        });

      const visibleDimensionOptions = dimensionOptions.filter((option) => {
        return (
          option.count > 0 ||
          option.selected ||
          option.value === FACET_UNKNOWN_VALUE
        );
      });

      byDimension[dimension] = [
        {
          value: FACET_ALL_VALUE,
          label: "All",
          count: totalCount,
          selected: selectedValues.length === 0,
        },
        ...visibleDimensionOptions,
      ];
    }

    return byDimension;
  });

  const activeFacetCount = $derived.by(() => {
    return FACET_DIMENSIONS.reduce((total, dimension) => {
      return total + facetSelections[dimension].length;
    }, 0);
  });

  $effect(() => {
    if ($identifyModeStore !== "catalog") {
      return;
    }

    const firstVisibleVariantId = filteredCatalogProfiles[0]?.variantId ?? "";
    if (!firstVisibleVariantId) {
      selectedVariantId = "";
      return;
    }

    const visibleSelection = filteredCatalogProfiles.some(
      (profile) => profile.variantId === selectedVariantId
    );
    if (visibleSelection) {
      return;
    }

    selectedVariantId = firstVisibleVariantId;
  });

  const selectedCatalogProfile = $derived.by(() => {
    return (
      allCatalogProfiles.find(
        (profile) => profile.variantId === selectedVariantId
      ) ?? null
    );
  });

  const activeProfile = $derived.by((): CableProfile | null => {
    if ($identifyModeStore === "catalog") {
      return selectedCatalogProfile;
    }

    return buildProfileFromMarkings(markings);
  });

  const recommendation = $derived.by(() => {
    if (!activeProfile) {
      return null;
    }
    return recommendLabels(activeProfile);
  });

  const setSelectedVariantId = (variantId: string): void => {
    selectedVariantId = variantId;
  };

  const toggleFacetValue = (dimension: FacetDimension, value: string): void => {
    if (value === FACET_ALL_VALUE) {
      facetSelections = {
        ...facetSelections,
        [dimension]: [],
      };
      return;
    }

    const current = facetSelections[dimension];
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    facetSelections = {
      ...facetSelections,
      [dimension]: nextValues,
    };
  };

  const clearAllFacets = (): void => {
    facetSelections = {
      ...DEFAULT_FACET_SELECTIONS,
    };
  };

  const patchMarkings = (patch: Partial<MarkingsDraft>): void => {
    markings = {
      ...markings,
      ...patch,
    };
  };
</script>

<div class="page-wrap">
  {#if $identifyModeStore === "catalog"}
    <div class="catalog-workspace">
      <aside class="facet-nav fade-in delay-2">
        {#if activeFacetCount > 0}
          <div class="facet-rail-header">
            <button
              type="button"
              class="inline-action"
              onclick={clearAllFacets}
            >
              Clear filters
            </button>
          </div>
        {/if}

        {#each FACET_DIMENSIONS as dimension (dimension)}
          <section class="facet-group">
            <p class="facet-group-title">{FACET_LABELS[dimension]}</p>
            {#if dimension === "price"}
              <p class="facet-note">
                Price ingest is pending, so unknown is expected for now.
              </p>
            {/if}
            <div
              class="facet-options"
              role="group"
              aria-label={FACET_LABELS[dimension]}
            >
              {#each catalogFacetOptions[dimension] as option (`${dimension}-${option.value}`)}
                <button
                  type="button"
                  class={`facet-option ${option.selected ? "is-selected" : ""}`}
                  onclick={() => toggleFacetValue(dimension, option.value)}
                >
                  <span class="facet-option-label">{option.label}</span>
                  <span class="facet-count">{option.count}</span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </aside>

      <section class="panel fade-in delay-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="panel-title">Catalog Results</h2>
          <span class="tag">{filteredCatalogProfiles.length} shown</span>
        </div>

        <p class="panel-subtitle">
          Pick the matching cable row. Use the top bar query and filters to
          narrow quickly.
        </p>

        <div class="catalog-results-wrap mt-4">
          <CatalogPicker
            cables={filteredCatalogProfiles}
            {selectedVariantId}
            onSelect={setSelectedVariantId}
          />
        </div>

        {#if topCablesQuery.isLoading}
          <p class="note mt-3">Loading catalog rows...</p>
        {/if}

        {#if !topCablesQuery.data || topCablesQuery.data.length === 0}
          <p class="note mt-3">
            Catalog is currently empty. Use manual entry mode for now.
          </p>
        {/if}
      </section>

      <div class="results-column fade-in delay-3">
        <ProfileSummary profile={activeProfile} />
        <LabelOutput profile={activeProfile} {recommendation} />
      </div>
    </div>
  {:else}
    <div class="workspace-grid">
      <section class="panel fade-in delay-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="panel-title">Manual Entry</h2>
        </div>

        <p class="panel-subtitle">
          Enter cable markings when catalog data is not enough.
        </p>

        <div class="mt-4">
          <MarkingsForm values={markings} onChange={patchMarkings} />
        </div>
      </section>

      <div class="results-column fade-in delay-3">
        <ProfileSummary profile={activeProfile} />
        <LabelOutput profile={activeProfile} {recommendation} />
      </div>
    </div>
  {/if}
</div>

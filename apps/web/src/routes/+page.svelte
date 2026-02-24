<script lang="ts">
  import { api } from "@cable-intel/backend/convex/_generated/api";
  import { useConvexClient, useQuery } from "convex-svelte";
  import { onMount } from "svelte";
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
  const DRAFT_SYNC_DEBOUNCE_MS = 180;
  const CONVEX_REQUEST_TIMEOUT_MS = 12_000;
  const CONVEX_REQUEST_TIMEOUT_MESSAGE =
    "Convex request timed out before acknowledgement.";
  const TRANSIENT_CONVEX_RETRY_DELAY_MS = 700;
  const MANUAL_SESSION_BOOTSTRAP_RETRY_MS = 2500;
  const MANUAL_SUBMIT_RECOVERY_POLL_MS = 250;
  const MANUAL_SUBMIT_RECOVERY_TIMEOUT_MS = 6000;
  const MANUAL_SESSION_INIT_ERROR_PREFIX =
    "Failed to initialize manual session:";
  const CONVEX_RECONNECTING_NOTE =
    "Connection to workspace data is reconnecting. Results will appear once reconnected.";
  const WORKSPACE_STORAGE_KEY = "cable-intel-workspace-id";
  const MOBILE_FACET_QUERY = "(max-width: 1179px)";
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
  const TRANSIENT_CONVEX_ERROR_SNIPPETS = [
    "connection lost while",
    "failed to fetch",
    "fetch failed",
    "network error",
    "timed out before acknowledgement",
  ] as const;

  interface FacetOption {
    count: number;
    label: string;
    selected: boolean;
    value: string;
  }

  interface ConvexConnectionSnapshot {
    connectionCount: number;
    connectionRetries: number;
    hasEverConnected: boolean;
    hasInflightRequests: boolean;
    inflightActions: number;
    inflightMutations: number;
    isWebSocketConnected: boolean;
    timeOfOldestInflightRequest: Date | null;
  }

  const DISCONNECTED_CONNECTION_SNAPSHOT: ConvexConnectionSnapshot = {
    connectionCount: 0,
    connectionRetries: 0,
    hasEverConnected: false,
    hasInflightRequests: false,
    inflightActions: 0,
    inflightMutations: 0,
    isWebSocketConnected: false,
    timeOfOldestInflightRequest: null,
  };

  const convex = useConvexClient();

  const readConvexConnectionState = (): ConvexConnectionSnapshot => {
    try {
      return convex.connectionState();
    } catch {
      return DISCONNECTED_CONNECTION_SNAPSHOT;
    }
  };

  let debouncedCatalogSearch = $state("");
  const topCablesQuery = useQuery(api.ingestQueries.getTopCables, () => ({
    limit: CATALOG_LIMIT,
    searchQuery: debouncedCatalogSearch || undefined,
  }));
  let workspaceId = $state("");
  const manualSessionQuery = useQuery(api.manualInference.getSession, () =>
    workspaceId ? { workspaceId } : "skip"
  );

  let selectedVariantId = $state("");
  let isFacetDrawerOpen = $state(true);
  let facetSelections = $state<Record<FacetDimension, string[]>>({
    ...DEFAULT_FACET_SELECTIONS,
  });
  let markings = $state<MarkingsDraft>({ ...DEFAULT_MARKINGS_DRAFT });
  let manualPrompt = $state("");
  let manualUiError = $state("");
  let isSubmittingManualPrompt = $state(false);
  let pendingQuestionIds = $state<string[]>([]);
  let pendingDraftPatch = $state<Partial<MarkingsDraft>>({});
  let draftSyncTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
  let convexConnectionState = $state<ConvexConnectionSnapshot>(
    readConvexConnectionState()
  );
  let isEnsuringManualSession = $state(false);
  let nextManualSessionEnsureAt = $state(0);

  $effect(() => {
    const nextSearch = $catalogSearchStore.trim();
    const timeoutId = setTimeout(() => {
      debouncedCatalogSearch = nextSearch;
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  });

  const toUiError = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  };

  const isTransientConvexTransportError = (error: unknown): boolean => {
    const normalized = toUiError(error).toLowerCase();
    return TRANSIENT_CONVEX_ERROR_SNIPPETS.some((snippet) => {
      return normalized.includes(snippet);
    });
  };

  const waitMs = async (durationMs: number): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, durationMs);
    });
  };

  const withConvexRequestTimeout = async (
    operation: Promise<unknown>
  ): Promise<unknown> => {
    return await new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(CONVEX_REQUEST_TIMEOUT_MESSAGE));
      }, CONVEX_REQUEST_TIMEOUT_MS);

      operation
        .then((value) => {
          clearTimeout(timeoutId);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  };

  const runWithTransientConvexRetry = async (
    operation: () => Promise<unknown>
  ): Promise<unknown> => {
    try {
      return await withConvexRequestTimeout(operation());
    } catch (error) {
      if (!isTransientConvexTransportError(error)) {
        throw error;
      }
      await waitMs(TRANSIENT_CONVEX_RETRY_DELAY_MS);
      return await withConvexRequestTimeout(operation());
    }
  };

  const createWorkspaceId = (): string => {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return `workspace-${crypto.randomUUID()}`;
    }
    return `workspace-${Date.now().toString(36)}`;
  };

  const resolveWorkspaceId = (): string => {
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)?.trim();
    if (stored) {
      return stored;
    }

    const generated = createWorkspaceId();
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, generated);
    return generated;
  };

  const ensureManualSession = async (
    nextWorkspaceId: string
  ): Promise<void> => {
    if (isEnsuringManualSession) {
      return;
    }

    isEnsuringManualSession = true;
    try {
      await runWithTransientConvexRetry(async () => {
        await convex.mutation(api.manualInference.ensureSession, {
          workspaceId: nextWorkspaceId,
        });
      });
      nextManualSessionEnsureAt = 0;
      if (manualUiError.startsWith(MANUAL_SESSION_INIT_ERROR_PREFIX)) {
        manualUiError = "";
      }
    } catch (error) {
      if (isTransientConvexTransportError(error)) {
        nextManualSessionEnsureAt =
          Date.now() + MANUAL_SESSION_BOOTSTRAP_RETRY_MS;
      } else {
        manualUiError = `${MANUAL_SESSION_INIT_ERROR_PREFIX} ${toUiError(error)}`;
      }
    } finally {
      isEnsuringManualSession = false;
    }
  };

  const flushDraftPatch = async (): Promise<boolean> => {
    if (!workspaceId || Object.keys(pendingDraftPatch).length === 0) {
      return true;
    }

    const patch = pendingDraftPatch;
    pendingDraftPatch = {};
    try {
      await runWithTransientConvexRetry(async () => {
        await convex.mutation(api.manualInference.patchDraft, {
          workspaceId,
          patch,
        });
      });
    } catch (error) {
      pendingDraftPatch = {
        ...patch,
        ...pendingDraftPatch,
      };
      manualUiError = `Failed to sync manual fields: ${toUiError(error)}`;
      return false;
    }
    return true;
  };

  const scheduleDraftSync = (): void => {
    if (!workspaceId) {
      return;
    }

    if (draftSyncTimeoutId) {
      clearTimeout(draftSyncTimeoutId);
    }

    draftSyncTimeoutId = setTimeout(() => {
      flushDraftPatch();
      draftSyncTimeoutId = null;
    }, DRAFT_SYNC_DEBOUNCE_MS);
  };

  onMount(() => {
    const mediaQuery = window.matchMedia(MOBILE_FACET_QUERY);

    const syncFacetDrawerState = (isMobile: boolean): void => {
      isFacetDrawerOpen = !isMobile;
    };

    syncFacetDrawerState(mediaQuery.matches);

    const handleMediaChange = (event: MediaQueryListEvent): void => {
      syncFacetDrawerState(event.matches);
    };

    mediaQuery.addEventListener("change", handleMediaChange);

    let unsubscribeConnectionState: (() => void) | null = null;
    try {
      convexConnectionState = readConvexConnectionState();
      unsubscribeConnectionState = convex.subscribeToConnectionState(
        (nextState) => {
          convexConnectionState = nextState;
        }
      );
    } catch {
      convexConnectionState = DISCONNECTED_CONNECTION_SNAPSHOT;
    }

    const nextWorkspaceId = resolveWorkspaceId();
    workspaceId = nextWorkspaceId;

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      unsubscribeConnectionState?.();
      if (draftSyncTimeoutId) {
        clearTimeout(draftSyncTimeoutId);
      }
    };
  });

  $effect(() => {
    if (!workspaceId || manualSessionQuery.data) {
      return;
    }
    if (
      !convexConnectionState.isWebSocketConnected ||
      isEnsuringManualSession
    ) {
      return;
    }

    const delayMs = Math.max(0, nextManualSessionEnsureAt - Date.now());
    const timeoutId = setTimeout(() => {
      ensureManualSession(workspaceId);
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  });

  $effect(() => {
    const sessionDraft = manualSessionQuery.data?.draft;
    if (!sessionDraft) {
      return;
    }
    if (draftSyncTimeoutId || Object.keys(pendingDraftPatch).length > 0) {
      return;
    }

    markings = {
      ...sessionDraft,
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

  const manualSessionState = $derived.by(() => {
    return manualSessionQuery.data ?? null;
  });

  const pendingFollowUpQuestions = $derived.by(() => {
    if (!manualSessionState) {
      return [];
    }
    return manualSessionState.followUpQuestions.filter((question) => {
      return question.status === "pending";
    });
  });

  const manualStatusTag = $derived.by(() => {
    if (!manualSessionState) {
      return null;
    }

    const confidencePercent = Math.round(manualSessionState.confidence * 100);
    if (manualSessionState.status === "inference_running") {
      return "Inferring...";
    }
    if (manualSessionState.status === "failed") {
      return "Needs retry";
    }
    if (manualSessionState.status === "needs_followup") {
      return `${confidencePercent}% · follow-up`;
    }
    if (manualSessionState.status === "ready") {
      return `${confidencePercent}% · ready`;
    }
    return `${confidencePercent}%`;
  });

  const isConvexConnected = $derived.by(() => {
    return convexConnectionState.isWebSocketConnected;
  });

  const manualErrorMessage = $derived.by(() => {
    const message = manualUiError || manualSessionState?.lastError || "";
    if (
      message.startsWith(MANUAL_SESSION_INIT_ERROR_PREFIX) &&
      !isConvexConnected
    ) {
      return "";
    }
    return message;
  });

  const isManualBusy = $derived.by(() => {
    return (
      isSubmittingManualPrompt ||
      manualSessionState?.status === "inference_running"
    );
  });

  const hasManualPendingQuestions = $derived.by(() => {
    return pendingFollowUpQuestions.length > 0;
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
    pendingDraftPatch = {
      ...pendingDraftPatch,
      ...patch,
    };
    scheduleDraftSync();
  };

  const resetManualSession = async (): Promise<void> => {
    if (!workspaceId) {
      return;
    }

    manualUiError = "";
    try {
      if (draftSyncTimeoutId) {
        clearTimeout(draftSyncTimeoutId);
        draftSyncTimeoutId = null;
      }
      pendingDraftPatch = {};
      await runWithTransientConvexRetry(async () => {
        await convex.mutation(api.manualInference.resetSession, {
          workspaceId,
        });
      });
      manualPrompt = "";
    } catch (error) {
      manualUiError = `Failed to reset manual session: ${toUiError(error)}`;
    }
  };

  const recoverManualSubmitFromConnectionDrop = async (): Promise<boolean> => {
    if (!workspaceId) {
      return false;
    }

    const deadline = Date.now() + MANUAL_SUBMIT_RECOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const session = await convex.query(api.manualInference.getSession, {
        workspaceId,
      });
      if (!session) {
        await waitMs(MANUAL_SUBMIT_RECOVERY_POLL_MS);
        continue;
      }
      if (
        session.status === "inference_running" ||
        session.status === "needs_followup" ||
        session.status === "ready"
      ) {
        return true;
      }
      if (session.status === "failed") {
        return false;
      }
      await waitMs(MANUAL_SUBMIT_RECOVERY_POLL_MS);
    }

    return false;
  };

  const runManualSubmitAction = async (prompt: string): Promise<void> => {
    await withConvexRequestTimeout(
      convex.action(api.manualInference.submitPrompt, {
        workspaceId,
        prompt,
      })
    );
  };

  const retryManualSubmitAfterTransientError = async (
    prompt: string
  ): Promise<void> => {
    const recovered = await recoverManualSubmitFromConnectionDrop();
    if (recovered) {
      return;
    }

    await waitMs(TRANSIENT_CONVEX_RETRY_DELAY_MS);
    try {
      await runManualSubmitAction(prompt);
    } catch (error) {
      if (isTransientConvexTransportError(error)) {
        const recoveredAfterRetry =
          await recoverManualSubmitFromConnectionDrop();
        if (recoveredAfterRetry) {
          return;
        }
      }
      throw error;
    }
  };

  const submitManualPrompt = async (): Promise<void> => {
    const prompt = manualPrompt.trim();
    if (!workspaceId) {
      manualUiError = "Manual workspace is not ready yet.";
      return;
    }
    if (!isConvexConnected) {
      return;
    }
    if (!prompt) {
      manualUiError = "Enter a cable description before inferring fields.";
      return;
    }

    manualUiError = "";
    isSubmittingManualPrompt = true;

    try {
      const didFlushDraftPatch = await flushDraftPatch();
      if (!didFlushDraftPatch) {
        return;
      }
      await runManualSubmitAction(prompt);
    } catch (error) {
      if (isTransientConvexTransportError(error)) {
        try {
          await retryManualSubmitAfterTransientError(prompt);
          return;
        } catch (retryError) {
          manualUiError = `Manual inference failed: ${toUiError(retryError)}`;
          return;
        }
      }

      manualUiError = `Manual inference failed: ${toUiError(error)}`;
    } finally {
      isSubmittingManualPrompt = false;
    }
  };

  const isQuestionBusy = (questionId: string): boolean => {
    return pendingQuestionIds.includes(questionId);
  };

  const answerQuestion = async (
    questionId: string,
    answer: "yes" | "no" | "skip"
  ): Promise<void> => {
    if (!workspaceId) {
      return;
    }
    if (isQuestionBusy(questionId)) {
      return;
    }

    manualUiError = "";
    pendingQuestionIds = [...pendingQuestionIds, questionId];
    try {
      await runWithTransientConvexRetry(async () => {
        await convex.mutation(api.manualInference.answerQuestion, {
          workspaceId,
          questionId,
          answer,
        });
      });
    } catch (error) {
      manualUiError = `Failed to save follow-up answer: ${toUiError(error)}`;
    } finally {
      pendingQuestionIds = pendingQuestionIds.filter((id) => id !== questionId);
    }
  };
</script>

<div class="page-wrap">
  {#if $identifyModeStore === "catalog"}
    <div class="catalog-workspace">
      <aside class="facet-nav fade-in delay-2">
        <details class="facet-drawer" bind:open={isFacetDrawerOpen}>
          <summary class="facet-drawer-summary">
            <span class="facet-drawer-heading">
              <svg
                class="facet-filter-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 5h18l-7 8v5l-4 1v-6L3 5Z" />
              </svg>
              <span>Optional filters</span>
            </span>

            <span class="facet-drawer-meta">
              {#if activeFacetCount > 0}
                <span class="facet-active-count"
                  >{activeFacetCount}
                  active</span
                >
              {/if}
              <span class="facet-drawer-caret" aria-hidden="true"></span>
            </span>
          </summary>

          <div class="facet-drawer-body">
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
          </div>
        </details>
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

        {#if !isConvexConnected}
          <p class="note mt-3">{CONVEX_RECONNECTING_NOTE}</p>
        {:else if topCablesQuery.isLoading}
          <p class="note mt-3">Loading catalog rows...</p>
        {/if}

        {#if isConvexConnected && (!topCablesQuery.data || topCablesQuery.data.length === 0)}
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
      <section class="panel panel-soft fade-in delay-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="panel-title">Describe First</h2>
          {#if manualStatusTag}
            <span class="tag">{manualStatusTag}</span>
          {/if}
        </div>

        <p class="panel-subtitle">
          Describe what is printed on the cable. We will pre-fill manual fields
          and ask up to three focused follow-up questions only when needed.
        </p>

        <label class="field mt-4">
          <span class="sr-only">Cable description</span>
          <textarea
            class="field-textarea"
            rows="3"
            placeholder='Try: "usb-c to c, 240w, braided, 8k 60hz"'
            bind:value={manualPrompt}
          ></textarea>
        </label>

        <div class="manual-assist-actions">
          <button
            type="button"
            class="inline-action inline-action-primary"
            onclick={submitManualPrompt}
            disabled={isManualBusy}
          >
            {isManualBusy ? "Inferring..." : "Infer Fields"}
          </button>
          <button
            type="button"
            class="inline-action"
            onclick={resetManualSession}
            disabled={isManualBusy}
          >
            Reset
          </button>
        </div>

        {#if manualSessionState?.notes}
          <p class="note mt-3">{manualSessionState.notes}</p>
        {/if}

        {#if !isConvexConnected}
          <p class="note mt-3">{CONVEX_RECONNECTING_NOTE}</p>
        {/if}

        {#if manualErrorMessage}
          <p class="manual-error">{manualErrorMessage}</p>
        {/if}

        {#if hasManualPendingQuestions}
          <div class="manual-followup-stack">
            <p class="field-label">Follow-up questions</p>
            {#each pendingFollowUpQuestions as question (question.id)}
              <article class="manual-followup-card">
                <p class="manual-followup-prompt">{question.prompt}</p>
                {#if question.detail}
                  <p class="manual-followup-detail">{question.detail}</p>
                {/if}

                <div class="manual-followup-actions">
                  <button
                    type="button"
                    class="inline-action inline-action-primary"
                    onclick={() => answerQuestion(question.id, "yes")}
                    disabled={isQuestionBusy(question.id)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="inline-action"
                    onclick={() => answerQuestion(question.id, "no")}
                    disabled={isQuestionBusy(question.id)}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    class="inline-action"
                    onclick={() => answerQuestion(question.id, "skip")}
                    disabled={isQuestionBusy(question.id)}
                  >
                    Skip
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

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

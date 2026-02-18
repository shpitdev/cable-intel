<script lang="ts">
  import {
    IconBatteryCharging2,
    IconBolt,
    IconCpu,
    IconDeviceDesktop,
    IconDeviceLaptop,
    IconDeviceMobileCharging,
    IconPlugConnected,
    IconUsb,
  } from "@tabler/icons-svelte";
  import { inferMaxGbpsFromGeneration, resolutionRank } from "$lib/capability";
  import type { CableProfile, LabelRecommendation } from "$lib/types";
  import {
    HOLDER_BAMBU_PETG_HF_HEX,
    LABEL_COLOR_HEX,
    VELCRO_CABLE_MATTERS_HEX,
  } from "$lib/types";
  import HolderPreview from "./holder-preview.svelte";

  interface Props {
    profile: CableProfile | null;
    recommendation: LabelRecommendation | null;
  }

  interface CapabilityScale {
    details: readonly string[];
    heading: string;
    icon: "data" | "power" | "video";
    level: number;
    palette: readonly string[];
    steps: readonly string[];
    title: string;
  }

  const HEX_COLOR_REGEX = /^[\da-fA-F]{6}$/;
  const POWER_BLACK_LUMA_SHIFT = 8;
  const DATA_BLUE_LUMA_SHIFT = -14;

  const SCALE_MAX_LEVEL = 4;
  const POWER_STEPS = [
    "Unknown",
    "Accessory",
    "Modern phone",
    "Small laptop",
    "Powerhouse laptop",
  ] as const;
  const DATA_STEPS = [
    "Unknown",
    "USB2 sync",
    "Fast files",
    "High-speed",
    "USB4/TB class",
  ] as const;
  const VIDEO_STEPS = [
    "Unknown",
    "No display",
    "Basic display",
    "4K class",
    "High refresh",
  ] as const;

  let { recommendation, profile }: Props = $props();

  let showMatrixGuide = $state(false);

  const clampChannel = (value: number): number => {
    return Math.max(0, Math.min(255, Math.round(value)));
  };

  const parseHex = (
    value?: string
  ): { blue: number; green: number; red: number } => {
    const normalized = (value?.trim() ?? "").replace("#", "");
    const hex =
      normalized.length === 3
        ? normalized
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : normalized;

    if (!HEX_COLOR_REGEX.test(hex)) {
      return { red: 128, green: 128, blue: 128 };
    }

    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
    };
  };

  const shiftHex = (value: string, delta: number): string => {
    const { red, green, blue } = parseHex(value);
    return `#${clampChannel(red + delta)
      .toString(16)
      .padStart(2, "0")}${clampChannel(green + delta)
      .toString(16)
      .padStart(2, "0")}${clampChannel(blue + delta)
      .toString(16)
      .padStart(2, "0")}`;
  };

  const getColorHex = (value: string): string => {
    return LABEL_COLOR_HEX[value as keyof typeof LABEL_COLOR_HEX] ?? "#374151";
  };

  const getHolderHex = (value: string): string => {
    return (
      HOLDER_BAMBU_PETG_HF_HEX[
        value as keyof typeof HOLDER_BAMBU_PETG_HF_HEX
      ] ?? getColorHex(value)
    );
  };

  const getVelcroHex = (value: string): string => {
    return (
      VELCRO_CABLE_MATTERS_HEX[
        value as keyof typeof VELCRO_CABLE_MATTERS_HEX
      ] ?? getColorHex(value)
    );
  };

  const getPowerPalette = (): string[] => {
    return [
      "#c3bbb0",
      shiftHex(getHolderHex("Black"), POWER_BLACK_LUMA_SHIFT),
      getHolderHex("Green"),
      getHolderHex("Orange"),
      getHolderHex("Red"),
    ];
  };

  const getDataPalette = (): string[] => {
    return [
      "#c3bbb0",
      getVelcroHex("Black"),
      shiftHex(getVelcroHex("Blue"), DATA_BLUE_LUMA_SHIFT),
      getVelcroHex("Blue"),
      getVelcroHex("Orange"),
    ];
  };

  const VIDEO_PALETTE = [
    "#c3bbb0",
    "#5d646a",
    "#3d7984",
    "#1d7f8a",
    "#0b7f72",
  ] as const;

  const getPowerScale = (profileValue: CableProfile): CapabilityScale => {
    const watts = profileValue.power.maxWatts;
    const palette = getPowerPalette();

    if (watts === 0) {
      return {
        title: "Power",
        icon: "power",
        level: 0,
        palette,
        heading: "Data-only / no charge",
        steps: POWER_STEPS,
        details: [
          "Use this for data transfer only.",
          "Do not rely on it for charging devices.",
        ],
      };
    }

    if (typeof watts !== "number") {
      return {
        title: "Power",
        icon: "power",
        level: 0,
        palette,
        heading: "Power rating not listed",
        steps: POWER_STEPS,
        details: [
          "Safe assumption: accessories and phones.",
          "Laptop charging support is unknown.",
        ],
      };
    }

    if (watts >= 240) {
      return {
        title: "Power",
        icon: "power",
        level: 4,
        palette,
        heading: `${watts}W / EPR class`,
        steps: POWER_STEPS,
        details: [
          "Powerhouse laptop class.",
          "Highest overhead for demanding charging loads.",
        ],
      };
    }

    if (watts >= 100) {
      return {
        title: "Power",
        icon: "power",
        level: 3,
        palette,
        heading: `${watts}W laptop class`,
        steps: POWER_STEPS,
        details: [
          "Small-to-mid laptop charging class.",
          "Common sweet spot for USB-C laptop setups.",
        ],
      };
    }

    if (watts >= 60) {
      return {
        title: "Power",
        icon: "power",
        level: 2,
        palette,
        heading: `${watts}W phone/tablet class`,
        steps: POWER_STEPS,
        details: [
          "Great for smartphones and tablets.",
          "Can help with lighter laptop usage.",
        ],
      };
    }

    return {
      title: "Power",
      icon: "power",
      level: 1,
      palette,
      heading: `${watts}W accessory class`,
      steps: POWER_STEPS,
      details: [
        "Best for accessories and low-draw devices.",
        "Not ideal for sustained laptop charging.",
      ],
    };
  };

  const getDataScale = (profileValue: CableProfile): CapabilityScale => {
    const palette = getDataPalette();
    const hasLightningEndpoint =
      profileValue.connectorFrom === "Lightning" ||
      profileValue.connectorTo === "Lightning";
    const inferredGbps =
      profileValue.data.maxGbps ??
      inferMaxGbpsFromGeneration(profileValue.data.usbGeneration);

    if (hasLightningEndpoint) {
      return {
        title: "Data",
        icon: "data",
        level: 1,
        palette,
        heading: "Lightning path (USB 2.0 ceiling)",
        steps: DATA_STEPS,
        details: [
          "Treat Lightning cables as USB 2.0 class.",
          "Do not expect USB 3/USB4 transfer rates.",
        ],
      };
    }

    if (typeof inferredGbps !== "number") {
      return {
        title: "Data",
        icon: "data",
        level: 0,
        palette,
        heading: "Data speed not listed",
        steps: DATA_STEPS,
        details: [
          "Assume basic transfer until verified.",
          "Avoid relying on this for heavy media workflows.",
        ],
      };
    }

    if (inferredGbps >= 40) {
      return {
        title: "Data",
        icon: "data",
        level: 4,
        palette,
        heading: `${inferredGbps}Gbps USB4/TB class`,
        steps: DATA_STEPS,
        details: [
          "Fast enough for edit-off-SSD workflows.",
          "Best fit for docks and heavy transfer jobs.",
        ],
      };
    }

    if (inferredGbps >= 10) {
      return {
        title: "Data",
        icon: "data",
        level: 3,
        palette,
        heading: `${inferredGbps}Gbps high-speed class`,
        steps: DATA_STEPS,
        details: [
          "Great for large photo/video transfers.",
          "Strong fit for backup-heavy workflows.",
        ],
      };
    }

    if (inferredGbps >= 5) {
      return {
        title: "Data",
        icon: "data",
        level: 2,
        palette,
        heading: `${inferredGbps}Gbps standard class`,
        steps: DATA_STEPS,
        details: [
          "Solid for everyday file transfer.",
          "Not ideal for pro media edit workflows.",
        ],
      };
    }

    return {
      title: "Data",
      icon: "data",
      level: 1,
      palette,
      heading: `${inferredGbps}Gbps basic class`,
      steps: DATA_STEPS,
      details: [
        "Fine for docs/photos/light sync.",
        "Large media transfers will be slow.",
      ],
    };
  };

  const getVideoScale = (profileValue: CableProfile): CapabilityScale => {
    const { explicitlySupported, maxRefreshHz, maxResolution } =
      profileValue.video;

    if (explicitlySupported === false) {
      return {
        title: "Video",
        icon: "video",
        level: 1,
        palette: VIDEO_PALETTE,
        heading: "No listed video output",
        steps: VIDEO_STEPS,
        details: [
          "Treat this as charge/data focused.",
          "Do not rely on it for external displays.",
        ],
      };
    }

    const rank = resolutionRank(maxResolution);

    if ((rank ?? 0) >= 5 || (maxRefreshHz ?? 0) >= 120) {
      return {
        title: "Video",
        icon: "video",
        level: 4,
        palette: VIDEO_PALETTE,
        heading: "High-resolution/high-refresh class",
        steps: VIDEO_STEPS,
        details: [
          "Strong headroom for demanding display setups.",
          "Validate exact output with your host + display chain.",
        ],
      };
    }

    if ((rank ?? 0) >= 4 || (maxRefreshHz ?? 0) >= 60) {
      return {
        title: "Video",
        icon: "video",
        level: 3,
        palette: VIDEO_PALETTE,
        heading: "4K / 60-class output",
        steps: VIDEO_STEPS,
        details: [
          "Good for mainstream external monitor workflows.",
          "Ceiling can still vary by host and adapter path.",
        ],
      };
    }

    if (
      explicitlySupported === true ||
      (rank ?? 0) >= 2 ||
      (maxRefreshHz ?? 0) >= 30
    ) {
      return {
        title: "Video",
        icon: "video",
        level: 2,
        palette: VIDEO_PALETTE,
        heading: "Display-capable (basic ceiling)",
        steps: VIDEO_STEPS,
        details: [
          "External display should work for typical use.",
          "Upper ceiling is not clearly listed in source data.",
        ],
      };
    }

    return {
      title: "Video",
      icon: "video",
      level: 0,
      palette: VIDEO_PALETTE,
      heading: "Video capability not listed",
      steps: VIDEO_STEPS,
      details: [
        "No clear video guarantee from source data.",
        "Validate with one known-good display path.",
      ],
    };
  };
</script>

<section class="panel panel-soft fade-in delay-3">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <span class="flow-step">2</span>
      <h3 class="panel-title">Label Recommendation</h3>
    </div>
    <button
      type="button"
      class="inline-action"
      onclick={() => {
        showMatrixGuide = true;
      }}
    >
      Use-case guide
    </button>
  </div>

  {#if !(recommendation && profile)}
    <p class="panel-subtitle">
      Pick a cable and the color code will be generated automatically.
    </p>
  {:else}
    {@const powerScale = getPowerScale(profile)}
    {@const dataScale = getDataScale(profile)}
    {@const videoScale = getVideoScale(profile)}
    {@const capabilityScales = [powerScale, dataScale, videoScale]}

    <div class="color-code-grid mt-3">
      <div class="color-code-tile">
        <p class="field-label">Velcro strap color</p>
        <p class="color-code-row">
          <span
            class="color-dot"
            style={`--swatch:${getVelcroHex(recommendation.velcroColor)}`}
          ></span>
          <span class="font-semibold text-[color:var(--ink-strong)]"
            >{recommendation.velcroColor}</span
          >
        </p>
      </div>

      <div class="color-code-tile">
        <p class="field-label">Holder color</p>
        <p class="color-code-row">
          <span
            class="color-dot"
            style={`--swatch:${getHolderHex(recommendation.adapterColor)}`}
          ></span>
          <span class="font-semibold text-[color:var(--ink-strong)]"
            >{recommendation.adapterColor}</span
          >
        </p>
      </div>
    </div>

    <div class="mt-4">
      <HolderPreview
        adapterColor={recommendation.adapterColor}
        adapterHex={getHolderHex(recommendation.adapterColor)}
        velcroColor={recommendation.velcroColor}
        velcroHex={getVelcroHex(recommendation.velcroColor)}
      />
    </div>

    <div class="capability-scale-stack mt-4">
      {#each capabilityScales as scale (scale.title)}
        {@const activeColor = scale.palette[scale.level] ?? scale.palette[0]}
        <article
          class="capability-scale-row"
          title={scale.details.join(" • ")}
          style={`--scale-accent:${activeColor}`}
        >
          <div class="capability-scale-head">
            <span class="capability-icon" aria-hidden="true">
              {#if scale.icon === "power"}
                <IconBatteryCharging2 size={16} stroke={1.9} />
              {:else if scale.icon === "data"}
                <IconUsb size={16} stroke={1.9} />
              {:else}
                <IconDeviceDesktop size={16} stroke={1.9} />
              {/if}
            </span>
            <div>
              <p class="field-label">{scale.title}</p>
              <p class="capability-scale-meta">{scale.heading}</p>
            </div>
          </div>

          <div
            class="capability-track"
            style={`--level:${scale.level}; --max-level:${SCALE_MAX_LEVEL}; --track-color:${activeColor}`}
          >
            <span class="capability-track-fill"></span>
            <div class="capability-step-row" role="list">
              {#each scale.steps as step, index (`${scale.title}-${step}`)}
                <span
                  role="listitem"
                  class={`capability-step ${index <= scale.level ? "is-reached" : ""} ${index === scale.level ? "is-active" : ""}`}
                  style={`--step-color:${scale.palette[index] ?? activeColor}`}
                  title={step}
                ></span>
              {/each}
            </div>
          </div>
        </article>
      {/each}

      <p class="capability-detail-hint">
        Each dot is a practical level, from unknown/basic to top-end capability.
      </p>
    </div>

    <details class="optional-block mt-3">
      <summary class="optional-summary">Why this color code</summary>
      <ul
        class="list-disc space-y-1 pl-5 pb-3 pr-3 text-xs text-[color:var(--ink-muted)]"
      >
        {#each recommendation.reasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

{#if showMatrixGuide}
  <div
    class="modal-scrim"
    role="presentation"
    onclick={(event) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      showMatrixGuide = false;
    }}
  >
    <div
      class="matrix-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Use-case guide"
    >
      <div class="flex items-center justify-between gap-3">
        <h4 class="panel-title">Use-Case Guide</h4>
        <button
          type="button"
          class="inline-action"
          onclick={() => {
            showMatrixGuide = false;
          }}
        >
          Close
        </button>
      </div>

      <p class="panel-subtitle">
        Choose by what you need to power and move, then map to the color code.
      </p>

      <div class="guide-grid mt-3">
        <section class="guide-block">
          <p class="field-label">Power use case (holder color)</p>
          <article class="guide-row">
            <span class="guide-icon">
              <IconPlugConnected size={16} stroke={1.9} />
            </span>
            <div class="guide-copy">
              <p class="guide-title">Accessory</p>
              <p class="guide-meta">
                Cameras, hubs, small gadgets (up to ~30W)
              </p>
            </div>
            <span class="guide-color-chip" style="--swatch:#2b2f35">Black</span>
          </article>
          <article class="guide-row">
            <span class="guide-icon">
              <IconDeviceMobileCharging size={16} stroke={1.9} />
            </span>
            <div class="guide-copy">
              <p class="guide-title">Modern smartphone</p>
              <p class="guide-meta">Fast phone/tablet charging (~45-60W)</p>
            </div>
            <span class="guide-color-chip" style="--swatch:#3e9162">Green</span>
          </article>
          <article class="guide-row">
            <span class="guide-icon">
              <IconDeviceLaptop size={16} stroke={1.9} />
            </span>
            <div class="guide-copy">
              <p class="guide-title">Small laptop</p>
              <p class="guide-meta">100W-140W laptop class</p>
            </div>
            <span class="guide-color-chip" style="--swatch:#d9843e"
              >Orange</span
            >
          </article>
          <article class="guide-row">
            <span class="guide-icon"> <IconCpu size={16} stroke={1.9} /> </span>
            <div class="guide-copy">
              <p class="guide-title">Powerhouse laptop</p>
              <p class="guide-meta">240W / EPR class</p>
            </div>
            <span class="guide-color-chip" style="--swatch:#cc4c46">Red</span>
          </article>
        </section>

        <section class="guide-block">
          <p class="field-label">Data use case (velcro color)</p>
          <article class="guide-row">
            <span class="guide-icon">
              <IconBolt size={16} stroke={1.9} />
            </span>
            <div class="guide-copy">
              <p class="guide-title">Basic sync</p>
              <p class="guide-meta">USB 2.0 / Lightning class</p>
            </div>
            <span class="guide-color-chip" style="--swatch:#1f2228">Black</span>
          </article>
          <article class="guide-row">
            <span class="guide-icon"> <IconUsb size={16} stroke={1.9} /> </span>
            <div class="guide-copy">
              <p class="guide-title">Fast files</p>
              <p class="guide-meta">10Gbps-20Gbps class</p>
            </div>
            <span
              class="guide-color-chip"
              style={`--swatch:${getVelcroHex("Blue")}`}
              >Blue</span
            >
          </article>
          <article class="guide-row">
            <span class="guide-icon"> <IconCpu size={16} stroke={1.9} /> </span>
            <div class="guide-copy">
              <p class="guide-title">Dock + pro media</p>
              <p class="guide-meta">USB4 / Thunderbolt / 40Gbps+</p>
            </div>
            <span class="guide-color-chip" style="--swatch:#f29a45"
              >Orange</span
            >
          </article>
        </section>

        <section class="guide-block guide-block-wide">
          <p class="field-label">Connector quick map</p>
          <div class="connector-grid">
            <article class="connector-chip">
              <span class="connector-icon"
                ><IconUsb size={15} stroke={1.9} /></span
              >
              <p class="connector-name">USB-C ↔ USB-C</p>
              <p class="connector-meta">Best all-around modern path</p>
            </article>
            <article class="connector-chip">
              <span class="connector-icon"
                ><IconBolt size={15} stroke={1.9} /></span
              >
              <p class="connector-name">USB-C ↔ Lightning</p>
              <p class="connector-meta">iPhone/iPad legacy ecosystem</p>
            </article>
            <article class="connector-chip">
              <span class="connector-icon"
                ><IconPlugConnected size={15} stroke={1.9} /></span
              >
              <p class="connector-name">USB-A ↔ USB-C</p>
              <p class="connector-meta">Older bricks and ports</p>
            </article>
            <article class="connector-chip">
              <span class="connector-icon"
                ><IconBolt size={15} stroke={1.9} /></span
              >
              <p class="connector-name">USB-A ↔ Lightning</p>
              <p class="connector-meta">Legacy Apple chargers</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}

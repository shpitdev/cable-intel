<script lang="ts">
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
    details: string[];
    heading: string;
    icon: "data" | "power" | "video";
    level: number;
    steps: string[];
    title: string;
  }

  const SCALE_MAX_LEVEL = 4;
  const POWER_STEPS = ["Unknown", "Phone", "Tablet", "Laptop", "High power"];
  const DATA_STEPS = [
    "Unknown",
    "Basic sync",
    "Files",
    "Media",
    "Edit off drive",
  ];
  const VIDEO_STEPS = [
    "Unknown",
    "No display",
    "Basic display",
    "4K class",
    "High refresh",
  ];

  let { recommendation, profile }: Props = $props();

  let showMatrixGuide = $state(false);

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

  const getPowerScale = (profileValue: CableProfile): CapabilityScale => {
    const watts = profileValue.power.maxWatts;

    if (watts === 0) {
      return {
        title: "Power",
        icon: "power",
        level: 0,
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
        heading: "Power rating not listed",
        steps: POWER_STEPS,
        details: [
          "Safe assumption: phones and accessories.",
          "Laptop charging support is unknown.",
        ],
      };
    }

    if (watts >= 240) {
      return {
        title: "Power",
        icon: "power",
        level: 4,
        heading: `${watts}W / EPR class`,
        steps: POWER_STEPS,
        details: [
          "Can power high-wattage laptops.",
          "Best choice for a single do-it-all charging cable.",
        ],
      };
    }

    if (watts >= 100) {
      return {
        title: "Power",
        icon: "power",
        level: 3,
        heading: `${watts}W laptop class`,
        steps: POWER_STEPS,
        details: [
          "Good for most laptop charging workflows.",
          "Less overhead than 240W/EPR cables.",
        ],
      };
    }

    if (watts >= 60) {
      return {
        title: "Power",
        icon: "power",
        level: 2,
        heading: `${watts}W mid-power class`,
        steps: POWER_STEPS,
        details: [
          "Great for phones, tablets, and lighter laptops.",
          "May not keep up with sustained heavy laptop load.",
        ],
      };
    }

    return {
      title: "Power",
      icon: "power",
      level: 1,
      heading: `${watts}W low-power class`,
      steps: POWER_STEPS,
      details: [
        "Best for accessories and phones.",
        "Not ideal for demanding laptop charging.",
      ],
    };
  };

  const getDataScale = (profileValue: CableProfile): CapabilityScale => {
    const inferredGbps =
      profileValue.data.maxGbps ??
      inferMaxGbpsFromGeneration(profileValue.data.usbGeneration);

    if (typeof inferredGbps !== "number") {
      return {
        title: "Data",
        icon: "data",
        level: 0,
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
        heading: `${inferredGbps}Gbps USB4/TB class`,
        steps: DATA_STEPS,
        details: [
          "Fast enough for edit-off-SSD style workflows.",
          "Handles large media/project transfers comfortably.",
        ],
      };
    }

    if (inferredGbps >= 10) {
      return {
        title: "Data",
        icon: "data",
        level: 3,
        heading: `${inferredGbps}Gbps high-speed class`,
        steps: DATA_STEPS,
        details: [
          "Great for large photos/video transfer.",
          "Good performance for regular backup jobs.",
        ],
      };
    }

    if (inferredGbps >= 5) {
      return {
        title: "Data",
        icon: "data",
        level: 2,
        heading: `${inferredGbps}Gbps standard class`,
        steps: DATA_STEPS,
        details: [
          "Solid for everyday file transfer.",
          "Not ideal for edit-off-drive use.",
        ],
      };
    }

    return {
      title: "Data",
      icon: "data",
      level: 1,
      heading: `${inferredGbps}Gbps basic class`,
      steps: DATA_STEPS,
      details: [
        "Fine for docs, photos, and light sync.",
        "Expect slower movement for large media sets.",
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
        heading: "High-resolution/high-refresh class",
        steps: VIDEO_STEPS,
        details: [
          "Strong headroom for demanding display setups.",
          "Validate final output with your exact host + display path.",
        ],
      };
    }

    if ((rank ?? 0) >= 4 || (maxRefreshHz ?? 0) >= 60) {
      return {
        title: "Video",
        icon: "video",
        level: 3,
        heading: "4K / 60-class output",
        steps: VIDEO_STEPS,
        details: [
          "Good for mainstream external monitor workflows.",
          "Resolution/refresh limits can still vary by device chain.",
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
      heading: "Video capability not listed",
      steps: VIDEO_STEPS,
      details: [
        "No clear video guarantee from source data.",
        "Validate with one known-good display cable path.",
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
      Color matrix guide
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

    <p class="mt-3 text-sm text-[color:var(--ink-strong)]">
      Final color code:
      <strong
        >{recommendation.velcroColor}
        velcro + {recommendation.adapterColor} holder</strong
      >
    </p>

    <div class="capability-scale-stack mt-4">
      {#each capabilityScales as scale (scale.title)}
        <article class="capability-scale-row" title={scale.details.join(" • ")}>
          <div class="capability-scale-head">
            <span class="capability-icon" aria-hidden="true">
              {#if scale.icon === "power"}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M13 2 L6 13 H11 L9 22 L18 10 H13 Z"
                    stroke-width="1.9"
                  ></path>
                </svg>
              {:else if scale.icon === "data"}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5 12 H19" stroke-width="1.9"></path>
                  <path d="M14 7 L19 12 L14 17" stroke-width="1.9"></path>
                  <circle cx="8" cy="12" r="2.5" stroke-width="1.9"></circle>
                </svg>
              {:else}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="6"
                    width="18"
                    height="12"
                    rx="2"
                    stroke-width="1.9"
                  ></rect>
                  <path d="M8 18 V20" stroke-width="1.9"></path>
                  <path d="M16 18 V20" stroke-width="1.9"></path>
                </svg>
              {/if}
            </span>
            <div>
              <p class="field-label">{scale.title}</p>
              <p class="capability-scale-meta">{scale.heading}</p>
            </div>
          </div>

          <div
            class="capability-track"
            style={`--level:${scale.level}; --max-level:${SCALE_MAX_LEVEL}`}
          >
            <span class="capability-track-fill"></span>
            <div class="capability-step-row" role="list">
              {#each scale.steps as step, index (`${scale.title}-${step}`)}
                <span
                  role="listitem"
                  class={`capability-step ${index <= scale.level ? "is-reached" : ""} ${index === scale.level ? "is-active" : ""}`}
                  title={step}
                ></span>
              {/each}
            </div>
          </div>
        </article>
      {/each}

      <p class="capability-detail-hint">
        Hover or focus a dot for level details.
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
      aria-label="Color matrix guide"
    >
      <div class="flex items-center justify-between gap-3">
        <h4 class="panel-title">Color Matrix</h4>
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
        Quick cheat-sheet for why each color is suggested.
      </p>

      <div class="matrix-grid mt-3">
        <div>
          <p class="field-label mb-2">Holder color (power)</p>
          <table class="matrix-table">
            <tbody>
              <tr>
                <td>240W / EPR</td>
                <td>Red</td>
              </tr>
              <tr>
                <td>100W - 140W</td>
                <td>Orange</td>
              </tr>
              <tr>
                <td>60W</td>
                <td>Green</td>
              </tr>
              <tr>
                <td>Data-only</td>
                <td>White</td>
              </tr>
              <tr>
                <td>Low / unknown</td>
                <td>Black</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <p class="field-label mb-2">Velcro color (data/video)</p>
          <table class="matrix-table">
            <tbody>
              <tr>
                <td>USB4 / TB / 40Gbps+</td>
                <td>Orange</td>
              </tr>
              <tr>
                <td>10Gbps - 20Gbps</td>
                <td>Blue</td>
              </tr>
              <tr>
                <td>Basic / unknown</td>
                <td>Black</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
{/if}

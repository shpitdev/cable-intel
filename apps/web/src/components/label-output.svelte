<script lang="ts">
  import { inferMaxGbpsFromGeneration } from "$lib/capability";
  import type { CableProfile, LabelRecommendation } from "$lib/types";
  import { LABEL_COLOR_HEX } from "$lib/types";

  interface Props {
    profile: CableProfile | null;
    recommendation: LabelRecommendation | null;
  }

  interface CapabilitySummary {
    heading: string;
    items: string[];
  }

  let { recommendation, profile }: Props = $props();

  let showMatrixGuide = $state(false);

  const getColorHex = (value: string): string => {
    return LABEL_COLOR_HEX[value as keyof typeof LABEL_COLOR_HEX] ?? "#374151";
  };

  const getPowerSummary = (profileValue: CableProfile): CapabilitySummary => {
    const watts = profileValue.power.maxWatts;

    if (watts === 0) {
      return {
        heading: "Data-only / non-charging",
        items: [
          "Use for data transfer, peripherals, or sync.",
          "Not intended for device charging.",
        ],
      };
    }

    if (typeof watts !== "number") {
      return {
        heading: "Power rating not listed",
        items: [
          "Safe assumption: phones and accessories.",
          "Laptop charging support is unknown.",
        ],
      };
    }

    if (watts >= 240) {
      return {
        heading: "240W / EPR class",
        items: [
          "Charges accessories, phones, tablets, and high-power laptops.",
          "Suitable for 16-inch laptop charging workflows.",
        ],
      };
    }

    if (watts >= 100) {
      return {
        heading: `${watts}W high-power class`,
        items: [
          "Charges phones, tablets, and most laptops.",
          "Good default desk cable for mixed devices.",
        ],
      };
    }

    if (watts >= 60) {
      return {
        heading: `${watts}W mid-power class`,
        items: [
          "Great for phones, tablets, and light laptop charging.",
          "May be insufficient for sustained high-load laptop charging.",
        ],
      };
    }

    return {
      heading: `${watts}W low-power class`,
      items: [
        "Best for accessories and phones.",
        "Not intended for demanding laptop charging.",
      ],
    };
  };

  const getDataSummary = (profileValue: CableProfile): CapabilitySummary => {
    const inferredGbps =
      profileValue.data.maxGbps ??
      inferMaxGbpsFromGeneration(profileValue.data.usbGeneration);

    if (typeof inferredGbps !== "number") {
      return {
        heading: "Data speed not listed",
        items: [
          "Assume basic transfer behavior until verified.",
          "Avoid relying on this cable for heavy media workflows.",
        ],
      };
    }

    if (inferredGbps >= 40) {
      return {
        heading: `${inferredGbps}Gbps (USB4 / TB class)`,
        items: [
          "Fast enough for direct editing from external SSDs.",
          "Handles large video and project file movement comfortably.",
        ],
      };
    }

    if (inferredGbps >= 10) {
      return {
        heading: `${inferredGbps}Gbps high-speed class`,
        items: [
          "Great for large photo/video transfer and backups.",
          "Works for many media workflows; less headroom than USB4/TB.",
        ],
      };
    }

    if (inferredGbps >= 5) {
      return {
        heading: `${inferredGbps}Gbps standard class`,
        items: [
          "Good for everyday file transfer and backups.",
          "Not ideal for edit-off-drive workflows.",
        ],
      };
    }

    return {
      heading: `${inferredGbps}Gbps basic class`,
      items: [
        "Fine for documents, photos, and light sync.",
        "Expect slower transfer for large media sets.",
      ],
    };
  };

  const getVideoSummary = (profileValue: CableProfile): CapabilitySummary => {
    const { explicitlySupported, maxRefreshHz, maxResolution } =
      profileValue.video;

    if (explicitlySupported === false) {
      return {
        heading: "No listed video output",
        items: [
          "Treat this as charge/data focused.",
          "Do not rely on this cable for external displays.",
        ],
      };
    }

    if (maxResolution && typeof maxRefreshHz === "number") {
      return {
        heading: `Up to ${maxResolution} @ ${maxRefreshHz}Hz`,
        items: [
          "Suitable for monitor/TV output within this ceiling.",
          "Check device and dock limits for final display behavior.",
        ],
      };
    }

    if (maxResolution) {
      return {
        heading: `Up to ${maxResolution}`,
        items: [
          "Resolution ceiling is listed, refresh ceiling is not listed.",
          "Confirm refresh rate on your exact display chain.",
        ],
      };
    }

    if (typeof maxRefreshHz === "number") {
      return {
        heading: `Video listed up to ${maxRefreshHz}Hz`,
        items: [
          "Refresh target is known, resolution target is not listed.",
          "Confirm final resolution on your display setup.",
        ],
      };
    }

    if (explicitlySupported === true) {
      return {
        heading: "Video supported (ceiling not listed)",
        items: [
          "External display should work.",
          "Maximum resolution and refresh are not listed.",
        ],
      };
    }

    return {
      heading: "Video capability not listed",
      items: [
        "No clear video guarantee from source data.",
        "Validate with one known-good display cable path.",
      ],
    };
  };
</script>

<section class="panel panel-soft fade-in delay-3">
  <div class="flex items-center justify-between gap-3">
    <h3 class="panel-title">Label Recommendation</h3>
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
    {@const powerSummary = getPowerSummary(profile)}
    {@const dataSummary = getDataSummary(profile)}
    {@const videoSummary = getVideoSummary(profile)}

    <div class="color-code-grid mt-3">
      <div class="color-code-tile">
        <p class="field-label">Velcro strap color</p>
        <p class="color-code-row">
          <span
            class="color-dot"
            style={`--swatch:${getColorHex(recommendation.velcroColor)}`}
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
            style={`--swatch:${getColorHex(recommendation.adapterColor)}`}
          ></span>
          <span class="font-semibold text-[color:var(--ink-strong)]"
            >{recommendation.adapterColor}</span
          >
        </p>
      </div>
    </div>

    <div class="holder-preview mt-4">
      <svg
        viewBox="0 0 420 250"
        role="img"
        aria-label="Printable holder and velcro loop preview"
      >
        <defs>
          <linearGradient id="holderBody" x1="0" x2="1" y1="0" y2="1">
            <stop
              offset="0%"
              stop-color={getColorHex(recommendation.adapterColor)}
            ></stop>
            <stop offset="100%" stop-color="#10182866"></stop>
          </linearGradient>
          <linearGradient id="holderFace" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stop-color={getColorHex(recommendation.adapterColor)}
            ></stop>
            <stop offset="100%" stop-color="#0f172a52"></stop>
          </linearGradient>
          <linearGradient id="velcroLoop" x1="0" x2="1" y1="0" y2="1">
            <stop
              offset="0%"
              stop-color={getColorHex(recommendation.velcroColor)}
            ></stop>
            <stop offset="100%" stop-color="#1118277a"></stop>
          </linearGradient>
          <pattern
            id="velcroTexture"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="#ffffff2f"></circle>
            <circle cx="6" cy="4" r="1" fill="#00000020"></circle>
            <circle cx="3" cy="7" r="1" fill="#ffffff1c"></circle>
          </pattern>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow
              dx="0"
              dy="8"
              stdDeviation="7"
              flood-color="#0f172a2e"
            ></feDropShadow>
          </filter>
        </defs>

        <ellipse cx="210" cy="210" rx="168" ry="24" fill="#d8d2c8"></ellipse>

        <g filter="url(#softShadow)">
          <path
            d="M113 168 L170 98 L274 98 L306 138 L306 174 L113 174 Z"
            fill="url(#holderBody)"
            stroke="#10182830"
            stroke-width="2"
          ></path>
          <path
            d="M113 168 L170 98 L170 174 L113 174 Z"
            fill="url(#holderFace)"
            opacity="0.92"
          ></path>
          <path d="M170 98 L274 98 L306 138 L202 138 Z" fill="#ffffff20"></path>
          <rect
            x="266"
            y="136"
            width="26"
            height="23"
            rx="4"
            fill="#0f172a40"
          ></rect>
          <circle cx="219" cy="131" r="5.5" fill="#0f172a3c"></circle>
        </g>

        <g filter="url(#softShadow)">
          <path
            d="M176 60 C239 52 290 67 300 103 C297 120 283 126 231 124 C181 121 160 108 158 90 C160 73 165 64 176 60 Z"
            fill="url(#velcroLoop)"
            stroke="#10182858"
            stroke-width="2"
          ></path>
          <path
            d="M176 60 C239 52 290 67 300 103 C297 120 283 126 231 124 C181 121 160 108 158 90 C160 73 165 64 176 60 Z"
            fill="url(#velcroTexture)"
            opacity="0.42"
          ></path>
        </g>
      </svg>

      <p class="selector-note">
        Holder: <strong>{recommendation.adapterColor}</strong> • Velcro loop:
        <strong>{recommendation.velcroColor}</strong>
      </p>
    </div>

    <p class="mt-3 text-sm text-[color:var(--ink-strong)]">
      Final color code:
      <strong
        >{recommendation.velcroColor}
        velcro + {recommendation.adapterColor} holder</strong
      >
    </p>

    <div class="capability-grid mt-4">
      <article class="capability-card">
        <p class="field-label">Power</p>
        <p class="capability-heading">{powerSummary.heading}</p>
        <ul class="capability-points">
          {#each powerSummary.items as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </article>

      <article class="capability-card">
        <p class="field-label">Data</p>
        <p class="capability-heading">{dataSummary.heading}</p>
        <ul class="capability-points">
          {#each dataSummary.items as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </article>

      <article class="capability-card">
        <p class="field-label">Video</p>
        <p class="capability-heading">{videoSummary.heading}</p>
        <ul class="capability-points">
          {#each videoSummary.items as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </article>
    </div>

    <ul
      class="mt-3 list-disc space-y-1 pl-5 text-xs text-[color:var(--ink-muted)]"
    >
      {#each recommendation.reasons as reason (reason)}
        <li>{reason}</li>
      {/each}
    </ul>
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

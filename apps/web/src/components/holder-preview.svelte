<script lang="ts">
  import { HOLDER_PREVIEW } from "$lib/holder-preview";
  import { LABEL_COLOR_HEX, type LabelColor } from "$lib/types";

  interface Props {
    adapterColor: LabelColor;
    velcroColor: LabelColor;
  }

  let { adapterColor, velcroColor }: Props = $props();

  const getColorHex = (value: LabelColor): string => {
    return LABEL_COLOR_HEX[value] ?? "#374151";
  };
</script>

<div class="holder-preview">
  <svg
    viewBox={HOLDER_PREVIEW.viewBox}
    role="img"
    aria-label="Printable holder clip and velcro strap preview"
  >
    <defs>
      <linearGradient id="holderBodyTone" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color={getColorHex(adapterColor)}></stop>
        <stop offset="100%" stop-color="#0f172a66"></stop>
      </linearGradient>
      <linearGradient id="holderFaceTone" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color={getColorHex(adapterColor)}></stop>
        <stop offset="100%" stop-color="#0f172a4d"></stop>
      </linearGradient>
      <linearGradient id="strapTone" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color={getColorHex(velcroColor)}></stop>
        <stop offset="100%" stop-color="#1118278c"></stop>
      </linearGradient>
      <pattern
        id="strapTextureTone"
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="2" cy="2" r="1" fill="#ffffff22"></circle>
        <circle cx="6" cy="4" r="1" fill="#0000002b"></circle>
        <circle cx="3" cy="7" r="1" fill="#ffffff20"></circle>
      </pattern>
      <filter id="previewShadow" x="-20%" y="-20%" width="150%" height="160%">
        <feDropShadow
          dx="0"
          dy="7"
          stdDeviation="6"
          flood-color="#0f172a33"
        ></feDropShadow>
      </filter>
    </defs>

    <ellipse cx="160" cy="214" rx="120" ry="20" fill="#d8d2c8"></ellipse>
    <ellipse cx="394" cy="214" rx="96" ry="16" fill="#d8d2c8"></ellipse>

    <g filter="url(#previewShadow)">
      <path
        d={HOLDER_PREVIEW.holderBodyPath}
        fill="url(#holderBodyTone)"
        stroke="#11182730"
        stroke-width="2"
      ></path>
      <path
        d={HOLDER_PREVIEW.holderFacePath}
        fill="url(#holderFaceTone)"
        opacity="0.95"
      ></path>
      <path d={HOLDER_PREVIEW.holderTopPath} fill="#ffffff24"></path>
      <circle cx="178" cy="152" r="6" fill="#0f172a3b"></circle>
      <rect
        x="230"
        y="156"
        width="28"
        height="20"
        rx="4"
        fill="#0f172a42"
      ></rect>
      <rect
        x="116"
        y="176"
        width="114"
        height="12"
        rx="5"
        fill="#0f172a2b"
      ></rect>
    </g>

    <g filter="url(#previewShadow)">
      <path
        d={HOLDER_PREVIEW.strapLoopPath}
        fill="url(#strapTone)"
        stroke="#11182758"
        stroke-width="2"
      ></path>
      <path
        d={HOLDER_PREVIEW.strapLoopPath}
        fill="url(#strapTextureTone)"
        opacity="0.45"
      ></path>
      <path
        d={HOLDER_PREVIEW.strapTailPath}
        fill="url(#strapTone)"
        stroke="#11182740"
        stroke-width="2"
      ></path>
    </g>

    <text
      x="158"
      y="238"
      text-anchor="middle"
      font-size="13"
      fill="#5b5144"
      font-weight="600"
    >
      holder clip
    </text>
    <text
      x="394"
      y="238"
      text-anchor="middle"
      font-size="13"
      fill="#5b5144"
      font-weight="600"
    >
      velcro strap
    </text>
  </svg>

  <p class="selector-note">
    Holder clip: <strong>{adapterColor}</strong> • Velcro strap:
    <strong>{velcroColor}</strong>
  </p>
</div>

<script lang="ts">
  import type { MarkingsDraft } from "$lib/types";
  import { CONNECTOR_OPTIONS } from "$lib/types";

  interface Props {
    inferredFields?: Partial<Record<keyof MarkingsDraft, boolean>>;
    onChange: (patch: Partial<MarkingsDraft>) => void;
    values: MarkingsDraft;
  }

  let { values, onChange, inferredFields = {} }: Props = $props();

  const isFieldInferred = (field: keyof MarkingsDraft): boolean => {
    return Boolean(inferredFields[field]);
  };
</script>

<div class="input-grid">
  <label class="field">
    <span class="field-label-row">
      <span class="field-label">Connector from</span>
      {#if isFieldInferred("connectorFrom")}
        <span class="field-inferred">Inferred</span>
      {/if}
    </span>
    <select
      class="field-select"
      value={values.connectorFrom}
      onchange={(event) =>
        onChange({
          connectorFrom: (event.currentTarget as HTMLSelectElement)
            .value as MarkingsDraft["connectorFrom"],
        })}
    >
      {#each CONNECTOR_OPTIONS as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span class="field-label-row">
      <span class="field-label">Connector to</span>
      {#if isFieldInferred("connectorTo")}
        <span class="field-inferred">Inferred</span>
      {/if}
    </span>
    <select
      class="field-select"
      value={values.connectorTo}
      onchange={(event) =>
        onChange({
          connectorTo: (event.currentTarget as HTMLSelectElement)
            .value as MarkingsDraft["connectorTo"],
        })}
    >
      {#each CONNECTOR_OPTIONS as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span class="field-label-row">
      <span class="field-label">Printed wattage</span>
      {#if isFieldInferred("watts")}
        <span class="field-inferred">Inferred</span>
      {/if}
    </span>
    <input
      type="text"
      class="field-input"
      placeholder="60, 100, 240"
      value={values.watts}
      oninput={(event) =>
        onChange({ watts: (event.currentTarget as HTMLInputElement).value })}
    >
  </label>

  <label class="field">
    <span class="field-label-row">
      <span class="field-label">USB generation marking</span>
      {#if isFieldInferred("usbGeneration")}
        <span class="field-inferred">Inferred</span>
      {/if}
    </span>
    <input
      type="text"
      class="field-input"
      placeholder="USB4, TB4, USB 3.2 Gen 2"
      value={values.usbGeneration}
      oninput={(event) =>
        onChange({
          usbGeneration: (event.currentTarget as HTMLInputElement).value,
        })}
    >
  </label>

  <label class="field">
    <span class="field-label-row">
      <span class="field-label">Video support marking</span>
      {#if isFieldInferred("videoSupport")}
        <span class="field-inferred">Inferred</span>
      {/if}
    </span>
    <select
      class="field-select"
      value={values.videoSupport}
      onchange={(event) =>
        onChange({
          videoSupport: (event.currentTarget as HTMLSelectElement)
            .value as MarkingsDraft["videoSupport"],
        })}
    >
      <option value="unknown">Unknown</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>

  <label class="checkbox-tile flex items-center gap-2 md:col-span-2">
    <input
      type="checkbox"
      checked={values.dataOnly}
      onchange={(event) =>
        onChange({ dataOnly: (event.currentTarget as HTMLInputElement).checked })}
    >
    <span class="field-label-row">
      <span class="field-label">Treat this as data-only / non-charging</span>
      {#if isFieldInferred("dataOnly")}
        <span class="field-inferred">Inferred</span>
      {/if}
    </span>
  </label>

  <details class="optional-block md:col-span-2">
    <summary class="optional-summary">Optional advanced signals</summary>
    <div class="optional-content input-grid">
      <label class="field">
        <span class="field-label-row">
          <span class="field-label">Data throughput (Gbps)</span>
          {#if isFieldInferred("gbps")}
            <span class="field-inferred">Inferred</span>
          {/if}
        </span>
        <input
          type="text"
          class="field-input"
          placeholder="10, 20, 40"
          value={values.gbps}
          oninput={(event) =>
            onChange({ gbps: (event.currentTarget as HTMLInputElement).value })}
        >
      </label>

      <label class="field">
        <span class="field-label-row">
          <span class="field-label">Max resolution</span>
          {#if isFieldInferred("maxResolution")}
            <span class="field-inferred">Inferred</span>
          {/if}
        </span>
        <input
          type="text"
          class="field-input"
          placeholder="1080p, 4K"
          value={values.maxResolution}
          oninput={(event) =>
            onChange({
              maxResolution: (event.currentTarget as HTMLInputElement).value,
            })}
        >
      </label>

      <label class="field">
        <span class="field-label-row">
          <span class="field-label">Max refresh rate (Hz)</span>
          {#if isFieldInferred("maxRefreshHz")}
            <span class="field-inferred">Inferred</span>
          {/if}
        </span>
        <input
          type="text"
          class="field-input"
          placeholder="60, 120"
          value={values.maxRefreshHz}
          oninput={(event) =>
            onChange({
              maxRefreshHz: (event.currentTarget as HTMLInputElement).value,
            })}
        >
      </label>
    </div>
  </details>
</div>

import { writable } from "svelte/store";
import type { IdentifyMode } from "./types";

export const identifyModeStore = writable<IdentifyMode>("catalog");
export const catalogSearchInputStore = writable("");
export const catalogSearchQueryStore = writable("");

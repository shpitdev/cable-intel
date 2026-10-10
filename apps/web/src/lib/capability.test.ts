import { describe, expect, it } from "bun:test";
import {
  inferMaxGbpsFromGeneration,
  parsePositiveNumber,
} from "$lib/capability";

describe("parsePositiveNumber", () => {
  it("parses values with unit suffixes and lists", () => {
    expect(parsePositiveNumber("240W")).toBe(240);
    expect(parsePositiveNumber("60, 100, 240W")).toBe(240);
    expect(parsePositiveNumber("")).toBeUndefined();
  });
});

describe("inferMaxGbpsFromGeneration", () => {
  it("does not promote USB 3.2 Gen 1 to the Gen 2 data rate", () => {
    expect(inferMaxGbpsFromGeneration("USB 3.2 Gen 1")).toBe(5);
    expect(inferMaxGbpsFromGeneration("USB 3.2 Gen 2")).toBe(10);
    expect(inferMaxGbpsFromGeneration("USB 3.2 Gen 2x2")).toBe(20);
  });

  it("returns the highest inferred class for combined generation markings", () => {
    expect(inferMaxGbpsFromGeneration("USB 3.2 Gen 2 / USB4 / TB4")).toBe(40);
  });

  it("reads explicit Gbps tokens when generation labels are mixed", () => {
    expect(inferMaxGbpsFromGeneration("USB 3.2 Gen 2, 20Gbps")).toBe(20);
  });
});

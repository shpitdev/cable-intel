import { describe, expect, it } from "bun:test";
import { cleanText } from "./text";

describe("cleanText", () => {
  it("strips balanced HTML tags and normalizes whitespace", () => {
    expect(cleanText("  <p>Hello <strong>world</strong></p>  ")).toBe(
      "Hello world"
    );
  });

  it("preserves unmatched angle brackets instead of truncating the remainder", () => {
    expect(cleanText("prefix <<<<<<<<<< trailing")).toBe(
      "prefix <<<<<<<<<< trailing"
    );
  });

  it("returns an empty string for non-string input", () => {
    expect(cleanText(undefined)).toBe("");
    expect(cleanText(null)).toBe("");
  });
});

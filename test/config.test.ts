import { test, expect } from "bun:test";
import { normalizeBaseUrl } from "../src/config.ts";

test("strips trailing slashes", () => {
  expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
  expect(normalizeBaseUrl("https://example.com///")).toBe("https://example.com");
});

test("trims whitespace", () => {
  expect(normalizeBaseUrl("  https://example.com  ")).toBe("https://example.com");
});

test("preserves URL without trailing slash", () => {
  expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");
});

test("preserves path components except final slashes", () => {
  expect(normalizeBaseUrl("https://example.com/sub/")).toBe("https://example.com/sub");
});

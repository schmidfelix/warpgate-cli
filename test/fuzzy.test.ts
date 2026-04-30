import { test, expect } from "bun:test";
import { score, scoreTarget } from "../src/fuzzy.ts";

test("empty query matches everything with low score", () => {
  expect(score("", "anything")).toBeGreaterThan(0);
});

test("substring match returns positive score", () => {
  expect(score("web", "prod-web-01")).toBeGreaterThan(0);
});

test("non-match returns 0", () => {
  expect(score("xyz", "prod-web-01")).toBe(0);
});

test("word-boundary match scores higher than mid-word", () => {
  const wordStart = score("web", "web-server");
  const midWord = score("web", "prodweb-server");
  expect(wordStart).toBeGreaterThan(midWord);
});

test("exact match scores highest", () => {
  const exact = score("prod", "prod");
  const partial = score("prod", "prod-web");
  expect(exact).toBeGreaterThan(partial);
});

test("case-insensitive", () => {
  expect(score("WEB", "prod-web-01")).toBeGreaterThan(0);
  expect(score("web", "PROD-WEB-01")).toBeGreaterThan(0);
});

test("scoreTarget picks the best field", () => {
  const s = scoreTarget("postgres", ["prod-db-01", "PostgreSQL primary", "Production"]);
  expect(s).toBeGreaterThan(0);
});

test("scoreTarget skips undefined fields", () => {
  expect(scoreTarget("foo", [undefined, "foo bar", undefined])).toBeGreaterThan(0);
});

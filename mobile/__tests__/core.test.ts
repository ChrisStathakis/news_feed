import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  classifyLanguage,
  itemId,
  loadSettings,
  pyRound,
  sha1,
  targetPages,
} from "../src/engine";

describe("sha1", () => {
  it("matches known digests", () => {
    expect(sha1("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(sha1("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(sha1("Η Ημερήσια")).toBe(
      "0b24e410fc573461d7b00dbf5e5d2654c5c7f119",
    );
  });
});

describe("pyRound", () => {
  it("rounds half to even like Python", () => {
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(68.85, 1)).toBe(68.8);
    expect(pyRound(68.86, 1)).toBe(68.9);
  });
});

describe("settings", () => {
  it("merges nested defaults and strips legacy sections", () => {
    const value = loadSettings({
      language: { translate_english: true },
      sections: [{ key: "legacy" }],
    });
    expect(value.language.translate_english).toBe(true);
    expect(value.language.target).toBe("el");
    expect(value).not.toHaveProperty("sections");
  });
});

describe("sections", () => {
  it("matches Python target_pages rounding", () => {
    expect(targetPages(1.5)).toBe(2);
    expect(targetPages(0.3)).toBe(1);
    expect(targetPages(2.0)).toBe(2);
    expect(targetPages("bad")).toBe(1);
  });
});

describe("text", () => {
  it("cleans titles and hashes items", () => {
    expect(cleanTitle("Breaking:  Τεστ είδηση | BBC News")).toBe("Τεστ είδηση");
    expect(itemId("https://example.com/a", "Τεστ")).toHaveLength(12);
  });

  it("detects Greek, English and mixed text", () => {
    expect(classifyLanguage("Αυτή είναι μια ελληνική είδηση")).toBe("el");
    expect(classifyLanguage("This is an English news story")).toBe("en");
    expect(classifyLanguage("This is a Greek κείμενο mixed")).toBe("mixed");
  });
});

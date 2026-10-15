import { describe, expect, it } from "vitest";
import { VISUALS } from "@/lib/visuals/library";
import { findVisuals, wantsVisual } from "@/lib/visuals/match";

describe("visual explanations (ADR-085)", () => {
  it("answers the latch example with reviewed latch pictures", () => {
    const found = findVisuals("I don't understand this nipple latch. Can I see it visually?");
    expect(found.map((v) => v.id)).toEqual(["latch-good", "latch-compare"]);
    for (const v of found) {
      expect(v.alt.length).toBeGreaterThan(60);
      expect(v.credit.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it("shows nothing unless the person asks to see something", () => {
    expect(findVisuals("How do I get a good latch?")).toEqual([]);
    expect(wantsVisual("What does egusi soup look like?")).toBe(true);
    expect(wantsVisual("Plan meals for my family")).toBe(false);
  });

  it("uses the recent conversation when the request has no topic", () => {
    const recent = "My baby keeps slipping off. Which breastfeeding position is best?";
    expect(findVisuals("Can you show me?", recent).map((v) => v.id)).toEqual([
      "position-cradle",
      "position-cross-cradle",
    ]);
    expect(findVisuals("Can you show me?", "")).toEqual([]);
  });

  it("finds hand washing, the balanced plate and Nigerian foods", () => {
    expect(findVisuals("Show me how to wash my hands")[0]!.id).toBe("hand-washing");
    expect(findVisuals("Picture of a balanced plate please")[0]!.id).toBe("balanced-plate");
    expect(findVisuals("What does moi moi look like?")[0]!.id).toBe("moi-moi");
    expect(findVisuals("Show me a photo of ugu")[0]!.id).toBe("ugu");
  });

  it("keeps every library entry complete: credit, licence, accessible text, Commons source", () => {
    const ids = new Set<string>();
    for (const v of VISUALS) {
      expect(ids.has(v.id)).toBe(false);
      ids.add(v.id);
      expect(v.src).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
      expect(v.alt.length).toBeGreaterThan(40);
      expect(v.caption.length).toBeGreaterThan(10);
      expect(v.credit.author).toBeTruthy();
      expect(v.credit.license).toMatch(/^(CC BY(-SA)? \d\.0|CC0|Public domain)$/);
      if (v.credit.license.startsWith("CC BY")) expect(v.credit.licenseUrl).toBeTruthy();
    }
  });
});

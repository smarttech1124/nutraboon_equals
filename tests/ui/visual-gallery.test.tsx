// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { VisualGallery } from "@/components/visuals/VisualGallery";
import { findVisuals } from "@/lib/visuals/match";

afterEach(cleanup);

describe("VisualGallery (ADR-085)", () => {
  const visuals = findVisuals("Can I see a picture of a good latch?");

  it("shows each picture with alt text, a caption and its credit", () => {
    render(<VisualGallery visuals={visuals} />);
    const section = screen.getByRole("region", { name: "Pictures" });
    const images = within(section).getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("alt", visuals[0]!.alt);
    expect(within(section).getByText(visuals[0]!.caption)).toBeInTheDocument();
    expect(within(section).getAllByRole("link", { name: "CC BY-SA 4.0" })[0]).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0",
    );
  });

  it("has no axe violations", async () => {
    const { container } = render(<VisualGallery visuals={visuals} />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { NutritionistCardView } from "@/components/nutritionists/card";
import type { NutritionistCard } from "@/lib/nutritionists/types";

afterEach(cleanup);

const card: NutritionistCard = {
  id: "n1",
  name: "Ada Obi",
  title: "Registered Dietitian",
  photoUrl: null,
  specializations: ["Pregnancy and breastfeeding", "Diabetes"],
  qualificationSummary: ["BSc Nutrition and Dietetics"],
  state: "Lagos",
  city: "Ikeja",
  yearsExperience: 6,
  sessionTypes: ["online", "in_person"],
  sessionFeeMinor: 750000,
  sessionMinutes: 45,
  availability: ["Monday 09:00–17:00"],
};

async function violations() {
  const results = await axe.run(document.body, {
    rules: {
      "color-contrast": { enabled: false },
      "document-title": { enabled: false },
      "html-has-lang": { enabled: false },
      region: { enabled: false },
    },
  });
  return results.violations.map((v) => v.id);
}

describe("nutritionist cards (ADR-064)", () => {
  it("shows what the spec asks for and links to the profile", async () => {
    render(<NutritionistCardView card={card} />);
    const article = screen.getByRole("article", { name: "Ada Obi" });
    const text = article.textContent ?? "";
    for (const expected of [
      "Registered Dietitian",
      "Verified by Nutraboom Equals",
      "Pregnancy and breastfeeding · Diabetes",
      "BSc Nutrition and Dietetics",
      "Ikeja, Lagos",
      "6 years experience",
      "Online or In person · 45 min",
      "₦7,500",
      "Available Monday 09:00–17:00",
    ]) {
      expect(text).toContain(expected);
    }
    expect(within(article).getByRole("link", { name: "View profile and book" })).toHaveAttribute(
      "href",
      "/nutritionists/n1",
    );
    expect(await violations()).toEqual([]);
  });

  it("appears under a chat reply, opening profiles in a new tab", async () => {
    render(
      <MessageBubble
        message={{
          id: "m1",
          role: "assistant",
          content: "Here is some advice.",
          nutritionists: [card],
        }}
      />,
    );
    const section = screen.getByRole("region", { name: "Nutritionists who could help" });
    const link = within(section).getByRole("link", { name: /view profile and book/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName("View profile and book (opens in a new tab)");
    expect(await violations()).toEqual([]);
  });
});

describe("sponsored product cards (ADR-067)", () => {
  const product = {
    id: "p1",
    name: "Plain yogurt",
    vendorName: "Farm Fresh",
    category: "dairy",
    imageUrl: null,
    description: "Plain yogurt.",
    availability: "in_stock" as const,
    priceNaira: 1800,
    whereToBuy: ["Shoprite Ikeja (Ikeja, Lagos)"],
    matchedTerm: "yogurt",
  };

  it("are labelled as sponsored and kept apart from the reply", async () => {
    render(
      <MessageBubble
        message={{ id: "m1", role: "assistant", content: "Try yogurt.", products: [product] }}
      />,
    );
    const section = screen.getByRole("region", { name: "Sponsored products" });
    expect(section).toHaveTextContent("Sponsored by verified vendors");
    expect(section).toHaveTextContent("not nutrition advice");
    const article = within(section).getByRole("article", { name: "Plain yogurt" });
    expect(article).toHaveTextContent("Sponsored · verified vendor");
    expect(article).toHaveTextContent('Farm Fresh · for "yogurt"');
    expect(within(article).getByRole("link", { name: /view product/i })).toHaveAttribute(
      "href",
      "/products/p1",
    );
    expect(await violations()).toEqual([]);
  });
});

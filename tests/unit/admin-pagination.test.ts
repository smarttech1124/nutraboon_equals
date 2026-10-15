import { describe, expect, it } from "vitest";
import { fillDays, monthlyMinor, trendDays } from "@admin/lib/analytics";
import { PAGE_SIZE, pageOf, pageParam, paging } from "@admin/lib/pagination";

describe("n-equals pagination", () => {
  it("reads ?page= safely", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam("2.7")).toBe(2);
    for (const bad of [undefined, "", "0", "-4", "abc", ["2"]]) expect(pageParam(bad)).toBe(1);
  });

  it("clamps a page past the end and computes skip and take", () => {
    expect(paging(9, 45)).toEqual({ page: 3, pages: 3, total: 45, skip: 40, take: PAGE_SIZE });
    expect(paging(1, 0)).toMatchObject({ page: 1, pages: 1, skip: 0 });
  });

  it("pages an in-memory list", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const [second, p] = pageOf(items, 2);
    expect(second).toEqual([20, 21, 22, 23, 24]);
    expect(p).toMatchObject({ page: 2, pages: 2, total: 25 });
  });
});

describe("n-equals analytics helpers", () => {
  it("lists the last 14 Lagos days, oldest first", () => {
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    const days = trendDays(new Date("2026-10-12T23:30:00Z"));
    expect(days).toHaveLength(14);
    expect(days.at(-1)).toBe("2026-10-13");
    expect(days[0]).toBe("2026-09-30");
  });

  it("fills missing days with zero", () => {
    expect(fillDays([{ day: "2026-10-02", count: 4 }], ["2026-10-01", "2026-10-02"])).toEqual([
      { day: "2026-10-01", count: 0 },
      { day: "2026-10-02", count: 4 },
    ]);
  });

  it("counts yearly plans as a twelfth of their price", () => {
    expect(monthlyMinor(120_000, "yearly")).toBe(10_000);
    expect(monthlyMinor(5_000, "monthly")).toBe(5_000);
  });
});

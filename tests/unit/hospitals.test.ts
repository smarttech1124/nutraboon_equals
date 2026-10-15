import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import { parseAudioSettings, parseRadiusKm } from "@/lib/billing/settings";
import { distanceKm, inNigeria } from "@/lib/geo/distance";
import { lookup } from "@/lib/geo/nominatim";
import { isAccessService, isNeed } from "@/lib/hospitals/accessibility";
import { rolesToNotify, routeMessage } from "@/lib/hospitals/agent";
import { deleteAfterFrom } from "@/lib/hospitals/server";
import {
  fromLagosDateKey,
  lagosDateKey,
  lagosMidnight,
  openDates,
  slotsForDay,
} from "@/lib/hospitals/slots";

// Friday 9 October 2026, 09:00 in Lagos.
const NOW = new Date("2026-10-09T08:00:00Z");
const MONDAY = [{ day: 1, start: "09:00", end: "11:00" }];

describe("hospital slots", () => {
  it("lists slot starts inside the window, in Lagos time", () => {
    const monday = fromLagosDateKey("2026-10-12")!;
    expect(monday.toISOString()).toBe("2026-10-11T23:00:00.000Z");
    const slots = slotsForDay(monday, MONDAY, 30, 1, [], NOW).map((d) => d.toISOString());
    expect(slots).toEqual([
      "2026-10-12T08:00:00.000Z",
      "2026-10-12T08:30:00.000Z",
      "2026-10-12T09:00:00.000Z",
      "2026-10-12T09:30:00.000Z",
    ]);
  });

  it("hides full slots and keeps those with room", () => {
    const monday = fromLagosDateKey("2026-10-12")!;
    const at = (iso: string) => new Date(iso);
    const slots = slotsForDay(
      monday,
      MONDAY,
      30,
      2,
      [at("2026-10-12T08:30:00Z"), at("2026-10-12T08:30:00Z"), at("2026-10-12T09:00:00Z")],
      NOW,
    ).map((d) => d.toISOString());
    expect(slots).not.toContain("2026-10-12T08:30:00.000Z");
    expect(slots).toContain("2026-10-12T09:00:00.000Z");
  });

  it("needs two hours' notice and ignores other weekdays", () => {
    const friday = [{ day: 5, start: "09:00", end: "11:00" }];
    expect(slotsForDay(NOW, friday, 30, 1, [], NOW)).toEqual([]);
    expect(slotsForDay(fromLagosDateKey("2026-10-13")!, MONDAY, 30, 1, [], NOW)).toEqual([]);
    expect(slotsForDay(NOW, "not windows", 30, 1, [], NOW)).toEqual([]);
  });

  it("does not book further ahead than allowed", () => {
    const far = fromLagosDateKey("2027-01-04")!; // a Monday, ~3 months away
    expect(slotsForDay(far, MONDAY, 30, 1, [], NOW)).toEqual([]);
  });

  it("finds the next open dates and validates date keys", () => {
    expect(openDates(MONDAY, NOW, 2)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(openDates([], NOW)).toEqual([]);
    expect(fromLagosDateKey("2026-02-30")).toBeNull();
    expect(fromLagosDateKey("12/10/2026")).toBeNull();
    // 23:30 UTC is already the next day in Lagos.
    expect(lagosDateKey(new Date("2026-10-09T23:30:00Z"))).toBe("2026-10-10");
    expect(lagosMidnight(new Date("2026-10-09T23:30:00Z")).toISOString()).toBe(
      "2026-10-09T23:00:00.000Z",
    );
  });
});

describe("distance", () => {
  it("measures great-circle distance in km", () => {
    const ikeja = { latitude: 6.6018, longitude: 3.3515 };
    const abuja = { latitude: 9.0765, longitude: 7.3986 };
    expect(distanceKm(ikeja, ikeja)).toBe(0);
    const d = distanceKm(ikeja, abuja);
    expect(d).toBeGreaterThan(510);
    expect(d).toBeLessThan(540);
  });

  it("recognises coordinates in Nigeria", () => {
    expect(inNigeria({ latitude: 6.6, longitude: 3.35 })).toBe(true);
    expect(inNigeria({ latitude: 51.5, longitude: -0.12 })).toBe(false);
  });
});

describe("OpenStreetMap lookup", () => {
  function reply(body: unknown, ok = true) {
    return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 }));
  }

  it("returns the first Nigerian match and asks only for Nigeria", async () => {
    const fetchImpl = reply([
      { lat: "6.6194", lon: "3.2780", display_name: "Iyana Ipaja, Alimosho, Lagos State, Nigeria" },
    ]);
    const place = await lookup("Iyana-Ipaja", fetchImpl as unknown as typeof fetch);
    expect(place).toEqual({
      latitude: 6.6194,
      longitude: 3.278,
      label: "Iyana Ipaja, Alimosho, Lagos State",
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("countrycodes=ng");
    expect(url).toContain("q=Iyana-Ipaja");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^NutraboomEquals/);
  });

  it("separates not found (null) from unavailable (undefined)", async () => {
    expect(await lookup("nowhere", reply([]) as unknown as typeof fetch)).toBeNull();
    expect(
      await lookup("london", reply([{ lat: "51.5", lon: "-0.12" }]) as unknown as typeof fetch),
    ).toBeNull();
    expect(await lookup("lagos", reply({}, false) as unknown as typeof fetch)).toBeUndefined();
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await lookup("lagos", failing as unknown as typeof fetch)).toBeUndefined();
  }, 15_000);
});

function provider(result: unknown): AIProvider {
  return {
    name: "fake",
    generateResponse: async () => {
      throw new Error("not used");
    },
    generateJson: async () => result,
  };
}

const DEPARTMENTS = [
  { id: "d-ante", name: "Antenatal clinic" },
  { id: "d-gopd", name: "General outpatient" },
];

describe("hospital agent routing", () => {
  it("uses the provider's routing when it is valid", async () => {
    const r = await routeMessage(
      "Can I change my antenatal appointment to Thursday?",
      DEPARTMENTS,
      provider({
        category: "appointment",
        departmentId: "d-ante",
        needsDoctor: false,
        summary: "Wants to move an antenatal appointment to Thursday.",
        reply: "Thank you. The antenatal team will reply here about a new time.",
      }),
    );
    expect(r).toMatchObject({
      category: "appointment",
      departmentId: "d-ante",
      urgent: false,
      source: "ai",
    });
  });

  it("drops a department that is not in the hospital's list", async () => {
    const r = await routeMessage(
      "Where is the lab?",
      DEPARTMENTS,
      provider({
        category: "directions",
        departmentId: "made-up",
        needsDoctor: false,
        summary: "Asks where the lab is.",
        reply: "A staff member will reply here with directions.",
      }),
    );
    expect(r.departmentId).toBeNull();
  });

  it("decides emergencies by code, whatever the provider says", async () => {
    const r = await routeMessage(
      "My chest pain is very bad and I can't breathe",
      DEPARTMENTS,
      provider({
        category: "general",
        departmentId: "",
        needsDoctor: false,
        summary: "General question.",
        reply: "A staff member will reply soon.",
      }),
    );
    expect(r.urgent).toBe(true);
    expect(r.category).toBe("urgent");
    expect(r.needsDoctor).toBe(true);
    expect(r.reply).toContain("112");
  });

  it("replaces a reply that talks about doses", async () => {
    const r = await routeMessage(
      "Should I keep taking my tablets?",
      DEPARTMENTS,
      provider({
        category: "clinical",
        departmentId: "d-gopd",
        needsDoctor: true,
        summary: "Asks about continuing tablets.",
        reply: "Take 500 mg twice daily until the doctor replies.",
      }),
    );
    expect(r.reply).not.toMatch(/500 mg/);
    expect(r.needsDoctor).toBe(true);
  });

  it("falls back to rules without a provider, on bad output and on errors", async () => {
    const none = await routeMessage("What time do you open?", DEPARTMENTS, null);
    expect(none).toMatchObject({ source: "rules", urgent: false, departmentId: null });
    const bad = await routeMessage("Hello", DEPARTMENTS, provider({ category: "nonsense" }));
    expect(bad.source).toBe("rules");
    const throwing: AIProvider = {
      name: "fake",
      generateResponse: async () => {
        throw new Error("x");
      },
      generateJson: async () => {
        throw new Error("timeout");
      },
    };
    expect((await routeMessage("Hello", DEPARTMENTS, throwing)).source).toBe("rules");
  });

  it("alerts doctors only when needed, everyone when urgent", () => {
    expect(rolesToNotify({ urgent: false, needsDoctor: false })).toEqual(["nurse", "staff"]);
    expect(rolesToNotify({ urgent: false, needsDoctor: true })).toEqual(["doctor"]);
    expect(rolesToNotify({ urgent: true, needsDoctor: true })).toContain("owner");
  });
});

describe("hospital settings and vocabularies", () => {
  it("parses the search radius and audio providers safely", () => {
    expect(parseRadiusKm(25)).toBe(25);
    expect(parseRadiusKm(0)).toBe(10);
    expect(parseRadiusKm("25")).toBe(10);
    expect(parseAudioSettings({ speechToText: "browser" }).speechToText).toBe("browser");
    // N-ATLaS is registered but not available, so the browser is used.
    expect(parseAudioSettings({ speechToText: "n-atlas" }).speechToText).toBe("browser");
    expect(parseAudioSettings(null)).toEqual({ speechToText: "browser", textToSpeech: "browser" });
  });

  it("knows accessibility services and needs", () => {
    expect(isAccessService("wheelchair")).toBe(true);
    expect(isAccessService("sign_language")).toBe(false);
    expect(isNeed("read_aloud")).toBe(true);
    expect(isNeed("toString")).toBe(false);
  });

  it("keeps closed conversations for 90 days", () => {
    const closed = new Date("2026-10-09T00:00:00Z");
    expect(deleteAfterFrom(closed).toISOString()).toBe("2027-01-07T00:00:00.000Z");
  });
});

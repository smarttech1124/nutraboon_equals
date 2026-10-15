import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import {
  availabilityFromForm,
  fitsAvailability,
  fromLagosLocal,
  parseAvailability,
} from "@/lib/nutritionists/availability";
import {
  analyseQualifications,
  analysisPrompt,
  deterministicChecks,
  type AnalysisInput,
} from "@/lib/nutritionists/analysis";
import { matchScore, rankCandidates, type Candidate } from "@/lib/nutritionists/matching";
import { missingForSubmission, readProfileForm } from "@/lib/nutritionists/profile";
import { specializationsFor } from "@/lib/nutritionists/specializations";
import { CloudinaryStorage, signParams } from "@/lib/storage/cloudinary";
import { checkUpload, sniffFileKind } from "@/lib/storage/files";

const MONDAY_9_TO_5 = [{ day: 1, start: "09:00", end: "17:00" }];

describe("availability", () => {
  it("drops invalid windows from stored JSON", () => {
    expect(
      parseAvailability([
        { day: 1, start: "09:00", end: "17:00" },
        { day: 9, start: "09:00", end: "17:00" },
        { day: 2, start: "18:00", end: "08:00" },
        "junk",
      ]),
    ).toEqual(MONDAY_9_TO_5);
    expect(parseAvailability(null)).toEqual([]);
  });

  it("converts Lagos local time and checks a session fits a window", () => {
    // Monday 12 October 2026, 10:00 in Lagos is 09:00 UTC.
    const start = fromLagosLocal("2026-10-12T10:00")!;
    expect(start.toISOString()).toBe("2026-10-12T09:00:00.000Z");
    expect(fitsAvailability(MONDAY_9_TO_5, start, 60)).toBe(true);
    expect(fitsAvailability(MONDAY_9_TO_5, fromLagosLocal("2026-10-12T16:30")!, 60)).toBe(false);
    expect(fitsAvailability(MONDAY_9_TO_5, fromLagosLocal("2026-10-13T10:00")!, 60)).toBe(false);
    expect(fromLagosLocal("2026-02-31T10:00")).toBeNull();
    expect(fromLagosLocal("tomorrow")).toBeNull();
  });

  it("reads one window per day from a form", () => {
    const form = new FormData();
    form.set("avail:1:start", "09:00");
    form.set("avail:1:end", "17:00");
    expect(availabilityFromForm(form)).toEqual({ ok: true, value: MONDAY_9_TO_5 });
    form.set("avail:2:start", "10:00");
    expect(availabilityFromForm(form).ok).toBe(false);
  });
});

describe("matching", () => {
  const base: Candidate = {
    userId: "a",
    specializations: ["general"],
    state: "Lagos",
    sessionTypes: ["online"],
    sessionFeeMinor: 500000,
    availability: MONDAY_9_TO_5,
    verifiedAt: new Date("2026-01-01"),
  };

  it("excludes candidates without availability or the wanted session type", () => {
    expect(matchScore({ ...base, availability: [] }, {})).toBeNull();
    expect(matchScore(base, { sessionType: "in_person" })).toBeNull();
    expect(matchScore(base, { maxFeeMinor: 100 })).toBeNull();
  });

  it("only offers in-person-only nutritionists nearby", () => {
    const inPerson = { ...base, sessionTypes: ["in_person"] };
    expect(matchScore(inPerson, { state: "Kano" })).toBeNull();
    expect(matchScore(inPerson, { state: "Lagos" })).not.toBeNull();
    // Ogun is in the same zone as Lagos.
    expect(matchScore(inPerson, { state: "Ogun", sessionType: "in_person" })).not.toBeNull();
  });

  it("ranks matching specialisation, then location, then fee", () => {
    const maternalFar = {
      ...base,
      userId: "maternal-far",
      specializations: ["maternal"],
      state: "Kano",
    };
    const generalNear = { ...base, userId: "general-near" };
    const diabetes = { ...base, userId: "diabetes", specializations: ["diabetes"] };
    const ranked = rankCandidates([generalNear, diabetes, maternalFar], {
      state: "Lagos",
      specializations: ["maternal"],
    });
    expect(ranked.map((c) => c.userId)).toEqual(["maternal-far", "general-near"]);
  });

  it("maps chat situations to specialisations", () => {
    expect(specializationsFor(["pregnancy", "condition:diabetes"], true).sort()).toEqual(
      ["allergies", "diabetes", "maternal"].sort(),
    );
    expect(specializationsFor(["child", "medication"], false)).toEqual(["child"]);
  });
});

describe("profile rules", () => {
  function form(values: Record<string, string | string[]>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) {
      for (const item of [v].flat()) f.append(k, item);
    }
    return f;
  }
  const valid = {
    title: "Registered Dietitian",
    bio: "",
    specializations: ["maternal", "bogus"],
    expertise: "lunchboxes, weaning",
    yearsExperience: "6",
    state: "lagos",
    city: "Ikeja",
    sessionTypes: ["online"],
    sessionFee: "5000",
    contactEmail: "",
    contactPhone: "+234 801 234 5678",
    whatsapp: "",
  };

  it("validates and normalises the profile form", () => {
    const result = readProfileForm(form(valid));
    expect(result).toMatchObject({
      ok: true,
      value: {
        specializations: ["maternal"],
        expertise: ["lunchboxes", "weaning"],
        state: "Lagos",
        sessionFeeMinor: 500000,
        sessionMinutes: 60,
        contactEmail: null,
      },
    });
    expect(readProfileForm(form({ ...valid, state: "Atlantis" })).ok).toBe(false);
    expect(readProfileForm(form({ ...valid, specializations: [] })).ok).toBe(false);
    expect(readProfileForm(form({ ...valid, sessionFee: "five" })).ok).toBe(false);
  });

  it("lists what is missing before submission", () => {
    const missing = missingForSubmission({
      title: "RD",
      specializations: ["maternal"],
      state: "Lagos",
      sessionTypes: ["online"],
      sessionFeeMinor: 0,
      contactEmail: null,
      contactPhone: null,
      whatsapp: null,
      availability: [],
      qualificationCount: 0,
      documentCount: 0,
    });
    expect(missing).toHaveLength(5);
  });
});

const input: AnalysisInput = {
  title: "Registered Dietitian",
  specializations: ["maternal", "diabetes"],
  expertise: [],
  yearsExperience: 12,
  qualifications: [
    {
      kind: "degree",
      title: "BSc Nutrition and Dietetics",
      institution: "University of Ibadan",
      year: 2020,
      hasRegistrationNumber: false,
      expiresOn: null,
    },
    {
      kind: "registration",
      title: "Dietitian registration",
      institution: "Registration body",
      year: null,
      hasRegistrationNumber: true,
      expiresOn: new Date("2026-01-01"),
    },
  ],
  documentCount: 1,
};
const NOW = new Date("2026-10-08T12:00:00Z");

describe("qualification analysis", () => {
  it("computes deterministic checks", () => {
    const checks = Object.fromEntries(deterministicChecks(input, NOW).map((c) => [c.id, c.ok]));
    expect(checks).toEqual({
      has_degree: true,
      has_registration: true,
      years_given: true,
      experience_consistent: false, // 12 years claimed, first qualification 2020
      not_expired: false,
      documents: true,
    });
  });

  it("keeps applicant text as data and leaves out registration numbers", () => {
    const prompt = analysisPrompt(input);
    expect(prompt).toContain("<applicant_profile>");
    expect(prompt).toContain("(number given)");
  });

  it("is unavailable without structured output, and validates the AI result", async () => {
    expect((await analyseQualifications(input, null, NOW)).status).toBe("unavailable");
    const good = {
      relevance: "high",
      relevanceReason: "Dietetics degree.",
      specializationSupport: [
        { specialization: "maternal", supported: "partly", reason: "General dietetics." },
        { specialization: "invented", supported: "yes", reason: "x" },
      ],
      manualChecks: ["Check the registration number with the issuing body."],
      summary: "Relevant degree; registration expired.",
    };
    const provider = {
      name: "fake",
      generateResponse: vi.fn(),
      generateJson: vi.fn(async () => good),
    } as unknown as AIProvider;
    const result = await analyseQualifications(input, provider, NOW);
    expect(result.status).toBe("completed");
    expect(result.assessment?.specializationSupport.map((s) => s.specialization)).toEqual([
      "maternal",
    ]);

    const bad = {
      name: "fake",
      generateResponse: vi.fn(),
      generateJson: vi.fn(async () => ({ relevance: "certain" })),
    } as unknown as AIProvider;
    expect((await analyseQualifications(input, bad, NOW)).status).toBe("failed");
    const throws = {
      name: "fake",
      generateResponse: vi.fn(),
      generateJson: vi.fn(async () => {
        throw new Error("x");
      }),
    } as unknown as AIProvider;
    const failed = await analyseQualifications(input, throws, NOW);
    expect(failed.status).toBe("failed");
    expect(failed.checks).toHaveLength(6);
  });
});

describe("Cloudinary storage", () => {
  const config = { cloudName: "demo", apiKey: "123", apiSecret: "abcd" };

  it("signs like Cloudinary's documented example", () => {
    expect(
      signParams(
        {
          timestamp: 1315060510,
          public_id: "sample_image",
          eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
        },
        "abcd",
      ),
    ).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("uploads documents as private with a signed request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            public_id: "f/x",
            format: "pdf",
            bytes: 10,
            secure_url: "https://res.cloudinary.com/demo/image/private/f/x.pdf",
          }),
        ),
    );
    const storage = new CloudinaryStorage(config, fetch, () => 1_700_000_000_000);
    const stored = await storage.upload(new Blob(["%PDF-1.7"]), "document", "nutraboom/docs");
    expect(stored).toMatchObject({ publicId: "f/x", format: "pdf" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    const body = init?.body as FormData;
    expect(body.get("type")).toBe("private");
    expect(body.get("api_key")).toBe("123");
    const signed = Object.fromEntries(
      ["folder", "public_id", "timestamp", "type"].map((k) => [k, String(body.get(k))]),
    );
    expect(body.get("signature")).toBe(signParams(signed, "abcd"));
  });

  it("does not read error bodies and builds expiring download links", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("secret echo", { status: 401 }),
    );
    const storage = new CloudinaryStorage(config, fetch, () => 1_700_000_000_000);
    await expect(storage.upload(new Blob(["x"]), "photo", "p")).rejects.toThrow("401");
    const link = new URL(storage.privateDownloadUrl("f/x", "pdf", 300));
    expect(link.pathname).toBe("/v1_1/demo/image/download");
    expect(link.searchParams.get("expires_at")).toBe(String(1_700_000_000 + 300));
    expect(link.searchParams.get("type")).toBe("private");
    expect(link.searchParams.get("signature")).toHaveLength(40);
  });
});

describe("upload checks", () => {
  it("identifies files by their content", async () => {
    expect(sniffFileKind(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(sniffFileKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffFileKind(new TextEncoder().encode("<svg>"))).toBeNull();
    const html = new File(["<html>"], "cert.pdf", { type: "application/pdf" });
    expect(await checkUpload(html, { maxBytes: 1000, allow: ["pdf"] })).toEqual({
      ok: false,
      error: "Upload a PDF file.",
    });
    const big = new File([new Uint8Array(2000)], "a.pdf");
    expect((await checkUpload(big, { maxBytes: 1000, allow: ["pdf"] })).ok).toBe(false);
    const pdf = new File(["%PDF-1.7 rest"], "a.pdf");
    expect(await checkUpload(pdf, { maxBytes: 1000, allow: ["pdf"] })).toMatchObject({
      ok: true,
      kind: "pdf",
    });
  });
});

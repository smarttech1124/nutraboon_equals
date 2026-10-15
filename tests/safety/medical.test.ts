import { describe, expect, it } from "vitest";
import {
  detectBreastfeeding,
  detectConditions,
  detectMedication,
  detectPregnancy,
  detectRedFlags,
  urgentCareNotice,
} from "@/lib/safety/context";
import {
  checkMedicalRules,
  findDoseStatements,
  findMedicationChanges,
} from "@/lib/safety/medical-rules";
import { referralNotice, sensitiveCategories } from "@/lib/safety/referrals";

describe("detectPregnancy", () => {
  it.each([
    ["I'm pregnant. Make me a meal plan.", { pregnant: true }],
    ["I'm in my first trimester", { pregnant: true, trimester: 1 }],
    ["My wife is 20 weeks pregnant", { pregnant: true, trimester: 2 }],
    ["I'm 3rd trimester now", { pregnant: true, trimester: 3 }],
  ])("%j → %j", (message, expected) => {
    expect(detectPregnancy(message)).toEqual(expected);
  });

  it.each([
    "I'm not pregnant",
    "We're trying to get pregnant",
    "Is pregnancy tea safe? No, I'm not pregnant",
  ])("ignores %j", (message) => {
    expect(detectPregnancy(message)).toBeUndefined();
  });
});

describe("detectBreastfeeding / detectMedication", () => {
  it("detects breastfeeding but not its negation", () => {
    expect(detectBreastfeeding("I'm breastfeeding my 2-month-old")).toBe(true);
    expect(detectBreastfeeding("I'm not breastfeeding anymore")).toBe(false);
  });

  it("detects medicines, including local herbal mixtures", () => {
    expect(detectMedication("I take metformin every morning")).toBe(true);
    expect(detectMedication("My mother gives him agbo")).toBe(true);
    expect(detectMedication("What can I cook with beans?")).toBe(false);
  });
});

describe("detectConditions", () => {
  it.each([
    ["I'm diabetic", ["diabetes"]],
    ["My mum is a sugar patient", ["diabetes"]],
    ["He has high BP", ["hypertension"]],
    ["My son is a sickler, genotype SS", ["sickle_cell"]],
    ["She's on dialysis for kidney failure", ["kidney_disease"]],
    ["I think I have an eating disorder", ["eating_disorder"]],
  ])("%j → %j", (message, expected) => {
    expect(detectConditions(message).sort()).toEqual([...expected].sort());
  });

  it.each(["I take sugar in my tea", "My pressure washer broke", "What's a good snack?"])(
    "does not flag %j",
    (message) => {
      expect(detectConditions(message)).toEqual([]);
    },
  );
});

describe("detectRedFlags / urgentCareNotice", () => {
  it("detects emergency signs and writes an urgent-care notice with Nigeria's 112", () => {
    const flags = detectRedFlags(
      "He ate groundnut and now his lips are swelling and he has difficulty breathing",
    );
    expect(flags).toEqual(expect.arrayContaining(["difficulty breathing"]));
    expect(urgentCareNotice(flags)).toMatch(/nearest hospital.*112/);
  });

  it("uses a crisis message for self-harm", () => {
    expect(urgentCareNotice(detectRedFlags("I feel suicidal"))).toMatch(/harming yourself.*112/);
  });

  it.each(["My baby is a fussy eater", "I'm a bit tired", "What's good for breakfast?"])(
    "stays quiet for %j",
    (message) => {
      expect(detectRedFlags(message)).toEqual([]);
    },
  );
});

describe("findDoseStatements", () => {
  it.each([
    "Take 400 mcg of folic acid daily.",
    "A 60 mg iron tablet each day is common.",
    "Inject 10 units of insulin before meals.",
  ])("flags %j", (message) => {
    expect(findDoseStatements(message)).toHaveLength(1);
  });

  it("allows nutrition facts that are not doses", () => {
    expect(
      findDoseStatements("A medium orange has about 60 mg of vitamin C and 48 mcg of folate."),
    ).toEqual([]);
  });
});

describe("findMedicationChanges", () => {
  it.each([
    "You could reduce your metformin if you eat more beans.",
    "Stop taking your blood pressure tablets while fasting.",
    "Reduce your insulin, and ask your doctor later.",
  ])("flags %j", (message) => {
    expect(findMedicationChanges(message)).toHaveLength(1);
  });

  it.each([
    "Don't stop your metformin; keep taking it as prescribed.",
    "Ask your doctor before reducing your insulin.",
    "Before changing your dose, talk to your doctor.",
    "Beans are a good source of fibre.",
  ])("allows %j", (message) => {
    expect(findMedicationChanges(message)).toEqual([]);
  });
});

describe("checkMedicalRules", () => {
  it.each([["palm wine"], ["fried liver"], ["fura da nono"], ["soft boiled egg"], ["sushi"]])(
    "rejects %s in pregnancy",
    (food) => {
      const violations = checkMedicalRules(
        { message: "Ideas below.", suggested: [food] },
        { pregnant: true },
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].kind).toBe("medical");
    },
  );

  it("allows the same foods when not pregnant (except doses and changes)", () => {
    expect(checkMedicalRules({ message: "Ideas.", suggested: ["fried liver"] }, {})).toEqual([]);
  });

  it("allows fully cooked foods in pregnancy", () => {
    expect(
      checkMedicalRules(
        { message: "Ideas.", suggested: ["hard boiled egg", "beans", "well cooked beef"] },
        { pregnant: true },
      ),
    ).toEqual([]);
  });

  it("rejects any food for babies under 6 months", () => {
    const violations = checkMedicalRules(
      { message: "Try pap.", suggested: ["pap"] },
      { onlyBabiesUnder6Months: true },
    );
    expect(violations).toEqual([expect.objectContaining({ kind: "child_safety" })]);
    expect(violations[0].reason).toMatch(/breast milk or infant formula/);
  });

  it("classifies doses and medication changes as medication violations", () => {
    const violations = checkMedicalRules(
      { message: "Take 400 mcg folic acid. You could stop your metformin.", suggested: [] },
      {},
    );
    expect(violations.map((v) => v.kind)).toEqual(["medication", "medication"]);
  });
});

describe("referrals", () => {
  it("names the right professional for each situation", () => {
    const categories = sensitiveCategories({
      infant: false,
      childUnder5: true,
      pregnant: true,
      conditions: ["diabetes"],
      takesMedication: true,
    });
    expect(categories).toEqual(["pregnancy", "child", "condition:diabetes", "medication"]);
    const notice = referralNotice(categories)!;
    expect(notice).toContain("antenatal clinic");
    expect(notice).toContain("child welfare clinic");
    expect(notice).toContain("registered dietitian can tailor food advice for diabetes");
    expect(notice).toContain("Keep taking any medicine as prescribed");
  });

  it("never sends a child to an antenatal clinic", () => {
    expect(referralNotice(["child"])).not.toMatch(/antenatal/);
  });
});

describe("detectPregnancy: questions are not statements", () => {
  it.each(["Is palm wine safe in pregnancy?", "What should pregnant women eat?"])(
    "ignores the general question %j",
    (message) => {
      expect(detectPregnancy(message)).toBeUndefined();
    },
  );

  it("still detects a statement inside a longer message", () => {
    expect(detectPregnancy("Hello. My partner is now pregnant, what should she eat?")).toEqual({
      pregnant: true,
    });
  });
});

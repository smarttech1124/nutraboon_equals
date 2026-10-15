/**
 * Allergen vocabulary (ADR-032). Words a user or the model might use for a
 * food that contains each allergen, including Nigerian names and common
 * products made from it. Kept in code rather than the database so allergy
 * checks still work when the database is unavailable.
 *
 * Terms are matched as whole words after normalisation (see normalizeText),
 * with simple plural forms ("s", "es") accepted. Keep terms specific: a term
 * listed here blocks any suggestion that contains it.
 */
export const ALLERGENS = {
  peanut: {
    label: "peanut",
    terms: [
      "peanut",
      "groundnut",
      "peanut butter",
      "groundnut paste",
      "groundnut oil",
      "peanut oil",
      "epa",
      "gyada",
      "ahuekere",
      "kuli kuli",
      "kulikuli",
      "suya",
      "yaji",
    ],
  },
  tree_nut: {
    label: "tree nut",
    terms: [
      "tree nut",
      "cashew",
      "almond",
      "walnut",
      "hazelnut",
      "pistachio",
      "pecan",
      "macadamia",
    ],
  },
  egg: {
    label: "egg",
    terms: ["egg", "eyin", "kwai", "mayonnaise", "mayo"],
  },
  milk: {
    label: "milk",
    terms: [
      "milk",
      "dairy",
      "cheese",
      "wara",
      "yoghurt",
      "yogurt",
      "butter",
      "cream",
      "nono",
      "custard",
      "ice cream",
    ],
  },
  fish: {
    label: "fish",
    terms: [
      "fish",
      "eja",
      "sardine",
      "mackerel",
      "titus",
      "tilapia",
      "catfish",
      "stockfish",
      "panla",
      "tuna",
      "salmon",
      "herring",
    ],
  },
  crustacean: {
    label: "shellfish",
    terms: ["shellfish", "crayfish", "shrimp", "prawn", "crab", "lobster", "ede"],
  },
  soy: {
    label: "soy",
    terms: ["soy", "soya", "soybean", "soya bean", "soy sauce", "tofu", "awara"],
  },
  wheat: {
    label: "wheat",
    terms: [
      "wheat",
      "gluten",
      "bread",
      "semovita",
      "semolina",
      "pasta",
      "spaghetti",
      "macaroni",
      "noodle",
      "indomie",
      "chin chin",
      "puff puff",
      "doughnut",
      "biscuit",
    ],
  },
  sesame: {
    label: "sesame",
    terms: ["sesame", "beniseed", "benne seed"],
  },
} as const satisfies Record<string, { label: string; terms: readonly string[] }>;

export type AllergenKey = keyof typeof ALLERGENS;

export const ALLERGEN_KEYS = Object.keys(ALLERGENS) as AllergenKey[];

/**
 * Words that, in an allergy statement, name more than one allergen. "Nuts"
 * covers peanuts and tree nuts; "seafood" covers fish and shellfish.
 */
export const GROUP_TERMS: Record<string, AllergenKey[]> = {
  nut: ["peanut", "tree_nut"],
  seafood: ["fish", "crustacean"],
  lactose: ["milk"],
};

/**
 * Phrases that contain an allergen word but mean something else. Because the
 * longest phrase wins, these stop e.g. "garden egg" (a local eggplant) from
 * matching "egg", and give "soy milk" soy but not milk.
 */
export const PHRASE_OVERRIDES: Record<string, AllergenKey[]> = {
  "garden egg": [],
  "coconut milk": [],
  "tiger nut": [],
  "tigernut milk": [],
  "tiger nut milk": [],
  "kunu aya": [],
  "shea butter": [],
  "soy milk": ["soy"],
  "soya milk": ["soy"],
  "almond milk": ["tree_nut"],
  "cashew milk": ["tree_nut"],
};

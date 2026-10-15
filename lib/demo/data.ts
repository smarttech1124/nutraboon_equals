/**
 * Demonstration data for development, testing and demos (ADR-074).
 *
 * Every person and business here is fictional. Names of businesses end in
 * "(Sample)", emails use the reserved example.test domain, websites use
 * example.com, and phone numbers are not real lines. Ids are fixed so the
 * seed can be re-run without creating duplicates. Prices are illustrative.
 */

import type { AvailabilityWindow } from "@/lib/nutritionists/availability";

const weekdays = (start: string, end: string, days = [1, 2, 3, 4, 5]): AvailabilityWindow[] =>
  days.map((day) => ({ day, start, end }));

export type DemoPlan = {
  code: string;
  name: string;
  description: string;
  audience: "user" | "nutritionist" | "vendor" | "hospital";
  interval: "monthly" | "yearly";
  priceMinor: number;
  entitlements: Record<string, number | boolean>;
};

/**
 * Three plans for people (the Meal Planner limits, ADR-066) and one plan per
 * partner audience, which the sample partners hold so they are listed.
 */
export const DEMO_PLANS: DemoPlan[] = [
  {
    code: "plus-monthly",
    name: "Plus",
    description: "Weekly meal plans with shopping lists, for one person or a couple.",
    audience: "user",
    interval: "monthly",
    priceMinor: 150_000,
    entitlements: {
      "mealPlanner.maxDays": 7,
      "mealPlanner.plansPerMonth": 10,
      "mealPlanner.shoppingList": true,
      "mealPlanner.adjustmentsPerWeek": 5,
      "mealPlanner.customObjectives": false,
    },
  },
  {
    code: "family-monthly",
    name: "Family",
    description:
      "Month-long plans for the whole household, with shopping lists and your own goals.",
    audience: "user",
    interval: "monthly",
    priceMinor: 350_000,
    entitlements: {
      "mealPlanner.maxDays": 31,
      "mealPlanner.plansPerMonth": 30,
      "mealPlanner.shoppingList": true,
      "mealPlanner.adjustmentsPerWeek": 15,
      "mealPlanner.customObjectives": true,
    },
  },
  {
    code: "premium-yearly",
    name: "Premium (yearly)",
    description: "Plans up to a year long and generous limits, billed once a year.",
    audience: "user",
    interval: "yearly",
    priceMinor: 3_500_000,
    entitlements: {
      "mealPlanner.maxDays": 366,
      "mealPlanner.plansPerMonth": 100,
      "mealPlanner.shoppingList": true,
      "mealPlanner.adjustmentsPerWeek": 50,
      "mealPlanner.customObjectives": true,
    },
  },
  {
    code: "nutritionist-listed",
    name: "Nutritionist listing",
    description: "A listing in the nutritionist directory and in the assistant's suggestions.",
    audience: "nutritionist",
    interval: "monthly",
    priceMinor: 500_000,
    entitlements: { "nutritionist.listing": true },
  },
  {
    code: "vendor-growth",
    name: "Vendor Growth",
    description: "Product recommendations to users and up to 20 listed products.",
    audience: "vendor",
    interval: "monthly",
    priceMinor: 1_000_000,
    entitlements: { "vendor.listing": true, "vendor.maxProducts": 20 },
  },
  {
    code: "hospital-partner",
    name: "Hospital Partner",
    description: "A listing in the hospital directory and up to 50 staff accounts.",
    audience: "hospital",
    interval: "monthly",
    priceMinor: 2_500_000,
    entitlements: { "hospital.listing": true, "hospital.maxStaff": 50 },
  },
];

export type DemoNutritionist = {
  key: string;
  name: string;
  title: string;
  bio: string;
  specializations: string[];
  expertise: string[];
  yearsExperience: number;
  state: string;
  city: string;
  sessionTypes: ("online" | "in_person")[];
  sessionFeeMinor: number;
  sessionMinutes: number;
  availability: AvailabilityWindow[];
  qualifications: {
    kind: "degree" | "certification" | "registration" | "membership";
    title: string;
    institution: string;
    year: number | null;
    registrationNumber?: string;
  }[];
};

export const DEMO_NUTRITIONISTS: DemoNutritionist[] = [
  {
    key: "amaka",
    name: "Amaka Eze",
    title: "Registered Dietitian",
    bio: "I help mothers eat well through pregnancy and breastfeeding, and guide families through weaning with familiar Nigerian foods.",
    specializations: ["maternal", "child"],
    expertise: ["Antenatal nutrition", "Breastfeeding", "Complementary feeding"],
    yearsExperience: 9,
    state: "Enugu",
    city: "Enugu",
    sessionTypes: ["online", "in_person"],
    sessionFeeMinor: 1_500_000,
    sessionMinutes: 45,
    availability: weekdays("09:00", "15:00"),
    qualifications: [
      {
        kind: "degree",
        title: "B.Sc. Nutrition and Dietetics",
        institution: "University of Nigeria, Nsukka",
        year: 2014,
      },
      {
        kind: "registration",
        title: "Registered Dietitian",
        institution: "Institute of Dietetics in Nigeria",
        year: 2016,
        registrationNumber: "SAMPLE-RD-0101",
      },
    ],
  },
  {
    key: "tunde",
    name: "Tunde Bakare",
    title: "Clinical Nutritionist",
    bio: "I work with adults living with diabetes or high blood pressure to build meals that fit their budget, their culture and their medicines.",
    specializations: ["diabetes", "heart"],
    expertise: ["Carbohydrate awareness", "Low-salt cooking", "Meal timing"],
    yearsExperience: 12,
    state: "Lagos",
    city: "Ikeja",
    sessionTypes: ["online", "in_person"],
    sessionFeeMinor: 2_000_000,
    sessionMinutes: 60,
    availability: weekdays("10:00", "17:00", [1, 3, 5]),
    qualifications: [
      {
        kind: "degree",
        title: "M.Sc. Human Nutrition",
        institution: "University of Ibadan",
        year: 2012,
      },
      {
        kind: "registration",
        title: "Registered Dietitian",
        institution: "Institute of Dietetics in Nigeria",
        year: 2013,
        registrationNumber: "SAMPLE-RD-0102",
      },
    ],
  },
  {
    key: "hauwa",
    name: "Hauwa Musa",
    title: "Public Health Nutritionist",
    bio: "I support families and communities with child growth, malnutrition prevention and affordable meals from local grains and legumes.",
    specializations: ["child", "community", "general"],
    expertise: ["Child growth", "Community nutrition", "Local food budgeting"],
    yearsExperience: 7,
    state: "Kano",
    city: "Kano",
    sessionTypes: ["online"],
    sessionFeeMinor: 800_000,
    sessionMinutes: 45,
    availability: weekdays("08:00", "13:00", [0, 1, 2, 3, 4]),
    qualifications: [
      {
        kind: "degree",
        title: "B.Sc. Human Nutrition",
        institution: "Bayero University Kano",
        year: 2016,
      },
      {
        kind: "membership",
        title: "Member",
        institution: "Nutrition Society of Nigeria",
        year: 2017,
      },
    ],
  },
  {
    key: "chinedu",
    name: "Chinedu Okafor",
    title: "Sports Nutritionist",
    bio: "I help athletes and active people fuel training and manage weight with practical, affordable meals.",
    specializations: ["sports", "weight"],
    expertise: ["Training nutrition", "Weight management", "Hydration"],
    yearsExperience: 6,
    state: "FCT",
    city: "Abuja",
    sessionTypes: ["online", "in_person"],
    sessionFeeMinor: 1_200_000,
    sessionMinutes: 60,
    availability: weekdays("16:00", "20:00").concat([{ day: 6, start: "09:00", end: "13:00" }]),
    qualifications: [
      {
        kind: "degree",
        title: "B.Sc. Nutrition and Dietetics",
        institution: "University of Lagos",
        year: 2018,
      },
      {
        kind: "certification",
        title: "Certificate in Sports Nutrition",
        institution: "Sample Sports Institute",
        year: 2020,
      },
    ],
  },
  {
    key: "folake",
    name: "Folake Adeyemi",
    title: "Renal and Geriatric Dietitian",
    bio: "I care for older adults and people with kidney conditions, adapting everyday Nigerian dishes to their needs.",
    specializations: ["kidney", "older_adults", "allergies"],
    expertise: ["Kidney-friendly cooking", "Healthy ageing", "Food allergies"],
    yearsExperience: 15,
    state: "Oyo",
    city: "Ibadan",
    sessionTypes: ["in_person", "online"],
    sessionFeeMinor: 1_800_000,
    sessionMinutes: 60,
    availability: weekdays("09:00", "16:00", [2, 4]),
    qualifications: [
      {
        kind: "degree",
        title: "M.Sc. Clinical Nutrition",
        institution: "University of Ibadan",
        year: 2009,
      },
      {
        kind: "registration",
        title: "Registered Dietitian",
        institution: "Institute of Dietetics in Nigeria",
        year: 2010,
        registrationNumber: "SAMPLE-RD-0105",
      },
    ],
  },
];

export type DemoProduct = {
  key: string;
  name: string;
  category: string;
  description: string;
  benefits: string;
  recommendedUse: string;
  ingredients: string[];
  allergens: string[];
  matchTerms: string[];
  priceNaira: number;
  availability: "in_stock" | "limited" | "seasonal" | "out_of_stock";
  where: {
    kind: "store" | "online";
    name: string;
    state: string | null;
    city: string | null;
    url: string | null;
  }[];
};

export type DemoVendor = {
  key: string;
  name: string;
  owner: string;
  description: string;
  categories: string[];
  state: string;
  city: string;
  registrationNumber: string;
  products: DemoProduct[];
};

export const DEMO_VENDORS: DemoVendor[] = [
  {
    key: "ofada",
    name: "Ofada Fields Foods (Sample)",
    owner: "Bisi Alabi",
    description:
      "A family business milling and packing local Ofada rice and whole grains in Ogun State.",
    categories: ["grains"],
    state: "Ogun",
    city: "Abeokuta",
    registrationNumber: "SAMPLE-RC-1001",
    products: [
      {
        key: "ofada-rice",
        name: "Stone-free Ofada Rice, 2 kg",
        category: "grains",
        description: "Locally grown, unpolished Ofada rice, cleaned and stone-free.",
        benefits: "A whole-grain rice with more fibre than polished white rice.",
        recommendedUse: "Rinse well and cook with ofada stew or vegetable sauce.",
        ingredients: ["ofada rice"],
        allergens: [],
        matchTerms: ["rice", "ofada rice", "brown rice"],
        priceNaira: 4500,
        availability: "in_stock",
        where: [
          {
            kind: "store",
            name: "Sample Market Stall 12, Kuto",
            state: "Ogun",
            city: "Abeokuta",
            url: null,
          },
        ],
      },
      {
        key: "millet",
        name: "Whole Millet Grains, 1 kg",
        category: "grains",
        description: "Sun-dried whole millet for pap, tuwo and porridge.",
        benefits: "A gluten-free whole grain with fibre and iron.",
        recommendedUse: "Soak overnight, then cook as porridge or grind for pap.",
        ingredients: ["millet"],
        allergens: [],
        matchTerms: ["millet", "pap", "ogi"],
        priceNaira: 1800,
        availability: "in_stock",
        where: [
          {
            kind: "online",
            name: "Ofada Fields online shop",
            state: null,
            city: null,
            url: "https://example.com/ofada-fields",
          },
        ],
      },
    ],
  },
  {
    key: "soy",
    name: "Sunrise Soy Kitchen (Sample)",
    owner: "Ngozi Umeh",
    description: "Fresh soy milk and soy-based foods made daily in Enugu.",
    categories: ["dairy", "legumes"],
    state: "Enugu",
    city: "Enugu",
    registrationNumber: "SAMPLE-RC-1002",
    products: [
      {
        key: "soy-milk",
        name: "Unsweetened Soy Milk, 1 litre",
        category: "dairy",
        description: "Fresh soy milk made from whole soybeans, with no added sugar.",
        benefits: "A plant drink with protein, for people who avoid cow's milk.",
        recommendedUse: "Drink chilled or use in pap and smoothies. Keep refrigerated.",
        ingredients: ["soybeans", "water"],
        allergens: ["soy"],
        matchTerms: ["soy milk", "milk", "soya"],
        priceNaira: 1500,
        availability: "in_stock",
        where: [
          {
            kind: "store",
            name: "Sunrise Soy Kitchen, Ogui Road",
            state: "Enugu",
            city: "Enugu",
            url: null,
          },
        ],
      },
      {
        key: "awara",
        name: "Soy Awara (Tofu), 500 g",
        category: "legumes",
        description: "Firm soy curd, ready to fry or add to stews.",
        benefits: "A meat-free protein that takes on the flavour of your stew.",
        recommendedUse: "Slice and fry, or add to pepper sauce. Use within three days.",
        ingredients: ["soybeans", "water", "alum"],
        allergens: ["soy"],
        matchTerms: ["tofu", "awara", "soy"],
        priceNaira: 1200,
        availability: "limited",
        where: [
          {
            kind: "store",
            name: "Sunrise Soy Kitchen, Ogui Road",
            state: "Enugu",
            city: "Enugu",
            url: null,
          },
        ],
      },
    ],
  },
  {
    key: "greens",
    name: "Green Basket Farms (Sample)",
    owner: "Ibrahim Danjuma",
    description: "Fresh leafy vegetables grown near Abuja and delivered within the FCT.",
    categories: ["vegetables"],
    state: "FCT",
    city: "Abuja",
    registrationNumber: "SAMPLE-RC-1003",
    products: [
      {
        key: "ugu",
        name: "Fresh Ugu (Pumpkin Leaves), 500 g bundle",
        category: "vegetables",
        description: "Fresh fluted pumpkin leaves, washed and bundled on the day of harvest.",
        benefits: "A leafy green with vitamin A, folate and iron.",
        recommendedUse: "Slice and add to soups and stews at the end of cooking.",
        ingredients: ["fluted pumpkin leaves"],
        allergens: [],
        matchTerms: ["ugu", "pumpkin leaves", "fluted pumpkin"],
        priceNaira: 700,
        availability: "seasonal",
        where: [
          {
            kind: "online",
            name: "Green Basket delivery",
            state: null,
            city: null,
            url: "https://example.com/green-basket",
          },
        ],
      },
      {
        key: "spinach",
        name: "Fresh Efo Tete (Spinach), 500 g bundle",
        category: "vegetables",
        description: "Tender African spinach, washed and ready to cook.",
        benefits: "A leafy green with folate and vitamin C.",
        recommendedUse: "Blanch briefly and add to efo riro or stews.",
        ingredients: ["african spinach"],
        allergens: [],
        matchTerms: ["spinach", "efo", "efo tete"],
        priceNaira: 600,
        availability: "in_stock",
        where: [
          { kind: "store", name: "Wuse Market, stall 4", state: "FCT", city: "Abuja", url: null },
        ],
      },
    ],
  },
  {
    key: "fish",
    name: "Coastline Fish & Crayfish (Sample)",
    owner: "Ebiere Tamuno",
    description: "Smoked fish and ground crayfish from fishing communities in Rivers State.",
    categories: ["fish"],
    state: "Rivers",
    city: "Port Harcourt",
    registrationNumber: "SAMPLE-RC-1004",
    products: [
      {
        key: "crayfish",
        name: "Ground Crayfish, 250 g",
        category: "fish",
        description: "Cleaned, dried and finely ground crayfish for soups and sauces.",
        benefits: "Adds flavour, protein and calcium to soups.",
        recommendedUse: "Add a spoonful to soups and stews while cooking.",
        ingredients: ["crayfish"],
        allergens: ["crustacean"],
        matchTerms: ["crayfish"],
        priceNaira: 2500,
        availability: "in_stock",
        where: [
          {
            kind: "store",
            name: "Creek Road Market, line 7",
            state: "Rivers",
            city: "Port Harcourt",
            url: null,
          },
        ],
      },
      {
        key: "smoked-fish",
        name: "Smoked Catfish, 2 pieces",
        category: "fish",
        description: "Whole catfish, gutted, cleaned and wood-smoked.",
        benefits: "A source of protein for soups and pepper soup.",
        recommendedUse: "Soak in warm water, debone and add to soups.",
        ingredients: ["catfish"],
        allergens: ["fish"],
        matchTerms: ["catfish", "smoked fish", "fish"],
        priceNaira: 3500,
        availability: "in_stock",
        where: [
          {
            kind: "online",
            name: "Coastline orders",
            state: null,
            city: null,
            url: "https://example.com/coastline",
          },
        ],
      },
    ],
  },
  {
    key: "littlebowl",
    name: "Little Bowl Weaning Foods (Sample)",
    owner: "Zainab Bello",
    description: "Home-style cereal blends for babies starting solid food and young children.",
    categories: ["baby_food", "grains"],
    state: "Lagos",
    city: "Yaba",
    registrationNumber: "SAMPLE-RC-1005",
    products: [
      {
        key: "millet-groundnut",
        name: "Millet and Groundnut Cereal Blend, 500 g",
        category: "baby_food",
        description: "A ground blend of millet, groundnut and soybeans for pap.",
        benefits: "Combines grain and legume protein in one porridge.",
        recommendedUse:
          "For children from 6 months, alongside breastfeeding. Mix with water and cook.",
        ingredients: ["millet", "groundnut", "soybeans"],
        allergens: ["peanut", "soy"],
        matchTerms: ["pap", "ogi", "millet", "weaning food"],
        priceNaira: 3000,
        availability: "in_stock",
        where: [
          {
            kind: "store",
            name: "Little Bowl shop, Herbert Macaulay Way",
            state: "Lagos",
            city: "Yaba",
            url: null,
          },
        ],
      },
      {
        key: "plantain-flour",
        name: "Unripe Plantain Flour, 1 kg",
        category: "tubers",
        description: "Sun-dried unripe plantain milled into a smooth flour.",
        benefits: "A family swallow with more fibre than many refined flours.",
        recommendedUse: "Stir into boiling water to make a smooth swallow.",
        ingredients: ["unripe plantain"],
        allergens: [],
        matchTerms: ["plantain", "plantain flour", "amala"],
        priceNaira: 2800,
        availability: "in_stock",
        where: [
          {
            kind: "online",
            name: "Little Bowl online",
            state: null,
            city: null,
            url: "https://example.com/little-bowl",
          },
        ],
      },
    ],
  },
];

export type DemoHospital = {
  key: string;
  name: string;
  owner: string;
  description: string;
  address: string;
  area: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  accessibility: string[];
  registrationNumber: string;
  departments: {
    key: string;
    name: string;
    description: string;
    slotMinutes: number;
    capacity: number;
    availability: AvailabilityWindow[];
  }[];
};

const opd = (key: string): DemoHospital["departments"][number] => ({
  key,
  name: "General outpatient",
  description: "Walk-in and booked consultations for adults and children.",
  slotMinutes: 20,
  capacity: 3,
  availability: weekdays("08:00", "16:00"),
});

export const DEMO_HOSPITALS: DemoHospital[] = [
  {
    key: "ikeja",
    name: "Harmony Specialist Hospital (Sample)",
    owner: "Adaeze Nwosu",
    description: "A specialist hospital with antenatal, paediatric and nutrition clinics.",
    address: "12 Sample Avenue",
    area: "Ikeja GRA",
    city: "Lagos",
    state: "Lagos",
    latitude: 6.5833,
    longitude: 3.3567,
    accessibility: ["ne_text", "ne_audio", "read_aloud", "wheelchair", "accessible_toilet"],
    registrationNumber: "SAMPLE-HF-2001",
    departments: [
      opd("ikeja-opd"),
      {
        key: "ikeja-antenatal",
        name: "Antenatal clinic",
        description: "Booking and follow-up visits in pregnancy.",
        slotMinutes: 30,
        capacity: 2,
        availability: weekdays("09:00", "14:00", [1, 3]),
      },
      {
        key: "ikeja-nutrition",
        name: "Nutrition clinic",
        description: "Dietitian consultations for adults and children.",
        slotMinutes: 45,
        capacity: 1,
        availability: weekdays("10:00", "15:00", [2, 4]),
      },
    ],
  },
  {
    key: "abuja",
    name: "Capital Care Clinic (Sample)",
    owner: "Musa Abdullahi",
    description: "A family clinic in Wuse with diabetes and child health services.",
    address: "5 Sample Close",
    area: "Wuse II",
    city: "Abuja",
    state: "FCT",
    latitude: 9.0796,
    longitude: 7.4701,
    accessibility: ["ne_text", "read_aloud", "wheelchair", "large_print", "quiet_space"],
    registrationNumber: "SAMPLE-HF-2002",
    departments: [
      opd("abuja-opd"),
      {
        key: "abuja-diabetes",
        name: "Diabetes clinic",
        description: "Reviews and education for people with diabetes.",
        slotMinutes: 30,
        capacity: 2,
        availability: weekdays("09:00", "13:00", [2, 4]),
      },
    ],
  },
  {
    key: "ibadan",
    name: "Bodija Community Hospital (Sample)",
    owner: "Kemi Ogunleye",
    description: "A community hospital with maternal and child health and an elderly care clinic.",
    address: "3 Sample Road",
    area: "Bodija",
    city: "Ibadan",
    state: "Oyo",
    latitude: 7.4352,
    longitude: 3.9133,
    accessibility: ["ne_text", "ne_audio", "guide_assistance", "wheelchair"],
    registrationNumber: "SAMPLE-HF-2003",
    departments: [
      opd("ibadan-opd"),
      {
        key: "ibadan-child",
        name: "Child health clinic",
        description: "Growth checks, immunisation and feeding advice.",
        slotMinutes: 20,
        capacity: 3,
        availability: weekdays("08:00", "12:00"),
      },
      {
        key: "ibadan-elderly",
        name: "Elderly care clinic",
        description: "Reviews for older adults and their carers.",
        slotMinutes: 30,
        capacity: 1,
        availability: weekdays("10:00", "14:00", [3]),
      },
    ],
  },
  {
    key: "portharcourt",
    name: "Riverside Medical Centre (Sample)",
    owner: "Tamuno Briggs",
    description: "A medical centre with antenatal care, kidney care and a dietitian.",
    address: "21 Sample Street",
    area: "Old GRA",
    city: "Port Harcourt",
    state: "Rivers",
    latitude: 4.7975,
    longitude: 7.0131,
    accessibility: ["ne_text", "read_aloud", "accessible_toilet", "large_print"],
    registrationNumber: "SAMPLE-HF-2004",
    departments: [
      opd("ph-opd"),
      {
        key: "ph-renal",
        name: "Kidney clinic",
        description: "Kidney care reviews, with dietitian support.",
        slotMinutes: 30,
        capacity: 1,
        availability: weekdays("09:00", "13:00", [1, 4]),
      },
    ],
  },
  {
    key: "kano",
    name: "Sabon Gari Mother and Child Hospital (Sample)",
    owner: "Aisha Sani",
    description: "A mother and child hospital with antenatal, paediatric and nutrition services.",
    address: "8 Sample Way",
    area: "Sabon Gari",
    city: "Kano",
    state: "Kano",
    latitude: 12.0161,
    longitude: 8.5323,
    accessibility: ["ne_text", "ne_audio", "read_aloud", "guide_assistance", "quiet_space"],
    registrationNumber: "SAMPLE-HF-2005",
    departments: [
      opd("kano-opd"),
      {
        key: "kano-antenatal",
        name: "Antenatal clinic",
        description: "Pregnancy care and nutrition advice.",
        slotMinutes: 30,
        capacity: 3,
        availability: weekdays("08:00", "12:00", [0, 1, 2, 3, 4]),
      },
    ],
  },
];

/** Email of a demo person: reserved test domain, never deliverable. */
export function demoEmail(key: string): string {
  return `demo-${key}@example.test`;
}

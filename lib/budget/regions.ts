import { normalizeText } from "@/lib/nutrition/match";

export const REGIONS = [
  "national",
  "north_central",
  "north_east",
  "north_west",
  "south_east",
  "south_south",
  "south_west",
] as const;

export type Region = (typeof REGIONS)[number];
export type Zone = Exclude<Region, "national">;

export const REGION_LABEL: Record<Region, string> = {
  national: "national average",
  north_central: "North Central average",
  north_east: "North East average",
  north_west: "North West average",
  south_east: "South East average",
  south_south: "South South average",
  south_west: "South West average",
};

/** Nigeria's 36 states and the FCT by geopolitical zone, as NBS groups them. */
const ZONE_STATES: Record<Zone, string[]> = {
  north_central: ["Benue", "Kogi", "Kwara", "Nasarawa", "Niger", "Plateau", "FCT"],
  north_east: ["Adamawa", "Bauchi", "Borno", "Gombe", "Taraba", "Yobe"],
  north_west: ["Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Sokoto", "Zamfara"],
  south_east: ["Abia", "Anambra", "Ebonyi", "Enugu", "Imo"],
  south_south: ["Akwa Ibom", "Bayelsa", "Cross River", "Delta", "Edo", "Rivers"],
  south_west: ["Ekiti", "Lagos", "Ogun", "Ondo", "Osun", "Oyo"],
};

export const STATES: string[] = Object.values(ZONE_STATES).flat();

const STATE_ZONE = new Map<string, Zone>(
  Object.entries(ZONE_STATES).flatMap(([zone, states]) =>
    states.map((s) => [normalizeText(s), zone as Zone] as const),
  ),
);

/**
 * Other names people use for a state: the FCT, and major cities that are
 * not also state names. Matched as whole words.
 */
const PLACE_TO_STATE: Record<string, string> = {
  abuja: "FCT",
  "federal capital territory": "FCT",
  "port harcourt": "Rivers",
  ibadan: "Oyo",
  ikeja: "Lagos",
  abeokuta: "Ogun",
  "benin city": "Edo",
  warri: "Delta",
  asaba: "Delta",
  onitsha: "Anambra",
  awka: "Anambra",
  aba: "Abia",
  umuahia: "Abia",
  owerri: "Imo",
  calabar: "Cross River",
  uyo: "Akwa Ibom",
  yenagoa: "Bayelsa",
  akure: "Ondo",
  osogbo: "Osun",
  "ado ekiti": "Ekiti",
  ilorin: "Kwara",
  lokoja: "Kogi",
  makurdi: "Benue",
  lafia: "Nasarawa",
  minna: "Niger",
  jos: "Plateau",
  maiduguri: "Borno",
  yola: "Adamawa",
  jalingo: "Taraba",
  damaturu: "Yobe",
  dutse: "Jigawa",
  "birnin kebbi": "Kebbi",
  gusau: "Zamfara",
  abakaliki: "Ebonyi",
};

/** Canonical state name for a state or city name, e.g. "port harcourt" → "Rivers". */
export function canonicalState(name: string): string | undefined {
  const key = normalizeText(name);
  if (STATE_ZONE.has(key)) return STATES.find((s) => normalizeText(s) === key);
  return PLACE_TO_STATE[key];
}

/**
 * Finds a Nigerian state (or a city standing for one) named in a message.
 * Only fires on location phrasing ("in Lagos", "I live in Kano", "we're in
 * Port Harcourt") so food names like "Niger" rice don't count.
 */
export function detectState(message: string): string | undefined {
  const text = normalizeText(message);
  const places = [...STATE_ZONE.keys(), ...Object.keys(PLACE_TO_STATE)].sort(
    (a, b) => b.length - a.length,
  );
  for (const place of places) {
    const pattern = new RegExp(
      `\\b(in|from|at|live in|living in|based in|stay in)( \\w+){0,2}? ${place}( state)?\\b`,
    );
    if (pattern.test(text)) return canonicalState(place);
  }
  return undefined;
}

export function zoneOfState(state: string | undefined): Zone | undefined {
  if (!state) return undefined;
  const canonical = canonicalState(state);
  return canonical ? STATE_ZONE.get(normalizeText(canonical)) : undefined;
}

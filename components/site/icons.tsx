import type { SVGProps } from "react";

/**
 * Line icons for the public site (ADR-070), drawn on a 24px grid with a
 * 1.75px stroke so they sit with DM Sans. Decorative by default: pass
 * aria-label (and role="img") only when an icon carries meaning on its own.
 */

export type IconName =
  | "chat"
  | "calendar"
  | "wallet"
  | "leaf"
  | "shield"
  | "hospital"
  | "stethoscope"
  | "store"
  | "pin"
  | "ear"
  | "sparkles"
  | "users"
  | "check"
  | "arrow"
  | "mail"
  | "menu"
  | "close"
  | "basket"
  | "chart"
  | "mic"
  | "lock"
  | "globe"
  | "eye"
  | "hand";

const PATHS: Record<IconName, string[]> = {
  chat: [
    "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
    "M8.5 12h.01M12 12h.01M15.5 12h.01",
  ],
  calendar: [
    "M7 3v3M17 3v3",
    "M4 8h16",
    "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    "M8 12h3v3H8z",
  ],
  wallet: [
    "M4 7a2 2 0 0 1 2-2h11v4",
    "M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2Z",
    "M16 14.5h.01",
  ],
  leaf: ["M5 19c0-9 6-14 15-14 0 9-5 15-14 15", "M5 19 13 11"],
  shield: ["M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z", "m9 12 2 2 4-4"],
  hospital: [
    "M4 21V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14",
    "M3 21h18",
    "M12 8v6M9 11h6",
    "M10 21v-3h4v3",
  ],
  stethoscope: ["M6 3v6a4 4 0 0 0 8 0V3", "M10 13v2a5 5 0 0 0 10 0v-2", "M20 11a2 2 0 1 0 0 .01"],
  store: [
    "M4 9 5.5 4h13L20 9",
    "M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9",
    "M5 11v9h14v-9",
    "M10 20v-5h4v5",
  ],
  pin: [
    "M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z",
    "M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  ],
  ear: [
    "M6 9a6 6 0 1 1 12 0c0 3-2 4.5-3 5.5S13.5 17 13.5 18.5A2.5 2.5 0 0 1 9 20",
    "M9.5 9a2.5 2.5 0 0 1 5 0",
  ],
  sparkles: [
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z",
    "M19 15l.8 2 2 .8-2 .8L19 21l-.8-2-2-.8 2-.8.8-2Z",
  ],
  users: [
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20",
    "M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3",
    "M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  ],
  check: ["m5 12.5 4.5 4.5L19 7.5"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  mail: ["M4 6h16v12H4z", "m4 7 8 6 8-6"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  close: ["M6 6l12 12M18 6 6 18"],
  basket: [
    "M5 10h14l-1.5 9.5a1 1 0 0 1-1 .5h-9a1 1 0 0 1-1-.5L5 10Z",
    "M9 10l3-6 3 6",
    "M3.5 10h17",
  ],
  chart: ["M4 20V4", "M4 20h16", "M8 16v-4M12 16V8M16 16v-6"],
  mic: [
    "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z",
    "M5.5 11.5a6.5 6.5 0 0 0 13 0",
    "M12 18v3",
  ],
  lock: ["M6 11h12v10H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  hand: [
    "M8 13V5.5a1.5 1.5 0 0 1 3 0V11",
    "M11 10V4.5a1.5 1.5 0 0 1 3 0V11",
    "M14 10.5V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15",
  ],
  globe: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M3 12h18",
    "M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z",
  ],
};

export function Icon({
  name,
  className = "size-5",
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  const labelled = Boolean(props["aria-label"]);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      className={className}
      {...props}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

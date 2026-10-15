/** XEELAA state as the AI providers page shows it (ADR-052, ADR-080). Shared by server and client code. */

export type XeelaaView = {
  configured: boolean;
  keyHint?: string;
  enabled: boolean;
  status?: "verified" | "invalid";
  active: boolean;
  lastChecked?: string;
  lastError?: string;
};

/** Plain-language state of the integration, as the admin should read it. */
export function describeXeelaa(view: XeelaaView): {
  label: string;
  tone: "on" | "off" | "warn";
  text: string;
} {
  if (!view.configured) {
    return { label: "Not set up", tone: "off", text: "Chat uses the active configuration." };
  }
  if (view.active) {
    return {
      label: "Active",
      tone: "on",
      text: "Chat tries XEELAA first and falls back to the active configuration if it fails.",
    };
  }
  if (view.enabled && view.status === "invalid") {
    return {
      label: "Key not working",
      tone: "warn",
      text: "XEELAA is switched on, but its key failed, so chat is using the active configuration. Re-check or replace the key.",
    };
  }
  return { label: "Off", tone: "off", text: "Chat uses the active configuration." };
}

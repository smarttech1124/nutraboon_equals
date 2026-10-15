"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";

/**
 * Fills a form's latitude and longitude from this device's location (with the
 * browser's permission) and submits it. Used for "near me" searches and for
 * pinning a hospital while standing at it.
 */
export function LocateButton({ label, formId }: { label: string; formId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function locate() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("This device cannot share its location. Type a place instead.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (!form) return;
        (form.elements.namedItem("latitude") as HTMLInputElement).value = String(
          pos.coords.latitude,
        );
        (form.elements.namedItem("longitude") as HTMLInputElement).value = String(
          pos.coords.longitude,
        );
        setBusy(false);
        form.requestSubmit();
      },
      () => {
        setBusy(false);
        setError("We could not get your location. Allow location access, or type a place instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" onClick={locate} disabled={busy}>
          {busy ? "Finding your location…" : label}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

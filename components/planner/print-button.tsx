"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print plan
    </Button>
  );
}

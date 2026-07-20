"use client";

import { Button } from "@/components/ui/button";

export function SchedulingPrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="pp-scheduling-print-button"
      onClick={() => window.print()}
    >
      Print schedule
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
  /** True when the employee has no real email address (placeholder@placeholder.local). */
  disabled?: boolean;
  /** Shown in place of the button when `disabled` is true. */
  disabledHint?: string;
  /** Label for the first send vs. a resend. Defaults to "Send welcome email". */
  label?: string;
  variant?: "primary" | "secondary";
}

export function SendWelcomeEmailButton({
  employeeId,
  disabled,
  disabledHint,
  label = "Send welcome email",
  variant = "primary",
}: Props) {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function send() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/send-welcome-email`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      setSentTo(data.sentTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  if (disabled) {
    return (
      <p className="text-sm text-gray-500">
        {disabledHint || "Welcome email unavailable."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={variant}
          onClick={send}
          disabled={sending}
        >
          {sending ? "Sending…" : sentTo ? "Resend welcome email" : label}
        </Button>
        {sentTo && !error && (
          <span className="text-sm text-green-700">Sent to {sentTo}</span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

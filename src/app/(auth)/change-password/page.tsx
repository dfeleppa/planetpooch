"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function ChangePasswordPage() {
  const router = useRouter();
  const sessionResult = useSession();
  const session = sessionResult?.data;
  const mustChange = Boolean(
    (session?.user as { mustChangePassword?: boolean } | undefined)
      ?.mustChangePassword
  );
  const sessionEmail = (session?.user as { email?: string } | undefined)?.email;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // The Button's `disabled` only takes effect on the next render, so a fast
  // second tap (or Enter + click in the same frame) can fire submit twice.
  // The first call rotates the password; the second sees the new hash and
  // returns "Current password is incorrect" — the user gets the error even
  // though the change succeeded. Guard with a ref that flips synchronously.
  const submittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to change password");
      }

      // Re-authenticate with the new password to mint a fresh JWT. Calling
      // useSession().update() works in theory, but leaves a window where the
      // proxy sees the stale `mustChangePassword=true` cookie and bounces
      // the redirect back to /change-password. signIn issues a new cookie
      // synchronously with the response, so the next navigation is clean.
      if (sessionEmail) {
        const result = await signIn("credentials", {
          email: sessionEmail,
          password: newPassword,
          redirect: false,
        });
        if (result?.error) {
          // Password changed but re-auth failed — send them to login so
          // they can sign in manually with their new password.
          router.push("/login");
          return;
        }
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {mustChange ? "Set Your Password" : "Change Password"}
          </h1>
          <p className="text-gray-500 mt-2">
            {mustChange
              ? "Your account uses a temporary password. Choose a new one to continue."
              : "Update the password on your account."}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}
              <Input
                label={mustChange ? "Temporary Password" : "Current Password"}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving..." : "Change Password"}
              </Button>
              {!mustChange && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              )}
              {mustChange && (
                <button
                  type="button"
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  Sign out
                </button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

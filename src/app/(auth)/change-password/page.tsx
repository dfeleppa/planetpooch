"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Once the API commits the new password, this stays set for the rest of
  // the page's lifetime. router.push is non-blocking, so the page lingers
  // briefly during navigation; a stray click in that window would otherwise
  // re-submit and the API would reject the (now-stale) temp password with
  // "Current password is incorrect", clobbering the redirect with an error.
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

    let passwordChanged = false;
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
      passwordChanged = true;

      // Drop the stale temp-password JWT and send the user to /login to
      // sign in with the new password. Auto-reauthing here was fragile:
      // it left the page mounted long enough that a stray click could
      // re-fire the API with the (now-invalid) temp password.
      await signOut({ redirect: false });
      router.push("/login");
    } catch (err) {
      if (passwordChanged) {
        // The change committed but sign-out/navigation threw. Still send
        // them to /login — never surface a confusing error in this case.
        router.push("/login");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
        submittingRef.current = false;
        setSaving(false);
      }
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

"use client";

import { getProviders, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [providers, setProviders] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState("");
  const capturedInvite = useRef(false);
  useEffect(() => {
    if (!capturedInvite.current) {
      capturedInvite.current = true;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const value = fragment.get("invite");
      if (value) {
        setInvite(value);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
    getProviders().then((value) => setProviders(Object.keys(value || {}).filter((id) => ["google", "apple"].includes(id))))
      .catch(() => { setProviders([]); setError("Could not load sign-in options. Please try again."); });
  }, []);
  async function connect(provider: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/link-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite }) });
      if (!res.ok) throw new Error("This connection link is invalid. Ask your administrator for a new link.");
      await signIn(provider, { callbackUrl });
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }
  return <div className="space-y-4">
    {(error || searchParams.has("error")) && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error || "We could not connect this sign-in to an active account. Use your existing account email or ask your administrator for an account connection link."}</p>}
    {invite && <p className="text-sm text-gray-600">Choose the Google or Apple account you want to connect to your existing Planet Pooch account.</p>}
    {providers === null && <p className="text-sm text-gray-600">Loading sign-in options…</p>}
    {providers?.map((provider) => <Button key={provider} type="button" className="w-full" disabled={loading} onClick={() => connect(provider)}>Continue with {provider === "google" ? "Google" : "Apple"}</Button>)}
    {providers?.length === 0 && <p role="alert" className="text-sm text-gray-600">Sign-in is awaiting configuration. Please contact your administrator.</p>}
    <p className="text-xs text-gray-500">Use the email on your existing account. If your email differs or you use Apple Hide My Email, ask your administrator for a connection link. Your employee history and permissions stay with your account.</p>
  </div>;
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-pp-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/planet-pooch-logo.png"
            alt="Planet Pooch"
            width={1250}
            height={392}
            priority
            className="h-auto w-[240px]"
          />
          <p className="text-pp-ink-3 mt-3 text-sm">Sign in to your account</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Suspense fallback={<div className="py-4 text-center text-gray-400">Loading...</div>}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

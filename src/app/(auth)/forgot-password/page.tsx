"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { errMsg } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    setMsg("If an account exists for that email, a reset link is on its way.");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Reset password</h1>
        <p className="text-sm text-muted">We&apos;ll email you a secure link.</p>
      </div>
      <Field label="Email">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      {msg && <p className="rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-ink">{msg}</p>}
      <Button type="submit" loading={loading} className="w-full">
        Send reset link
      </Button>
      <Link href="/login" className="block text-center text-sm text-muted hover:text-ink">
        Back to sign in
      </Link>
    </form>
  );
}

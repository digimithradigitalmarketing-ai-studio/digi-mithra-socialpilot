"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const valid = UUID.test(token);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [business, setBusiness] = useState("");
  const [error, setError] = useState("");

  const confirm = async () => {
    setState("loading");
    const { data, error } = await createClient().rpc("unsubscribe_email", { p_token: token });
    if (error) {
      setError(error.message || "Something went wrong");
      setState("error");
      return;
    }
    setBusiness(typeof data === "string" ? data : "");
    setState("done");
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-lg">
        <Image src="/mark.png" alt="" width={44} height={44} className="mx-auto rounded-xl" />
        {!valid ? (
          <>
            <h1 className="mt-4 text-xl font-bold">Invalid link</h1>
            <p className="mt-2 text-sm text-slate-600">This unsubscribe link is not valid. Please use the link from your email.</p>
          </>
        ) : state === "done" ? (
          <>
            <h1 className="mt-4 text-xl font-bold">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-slate-600">
              You won&apos;t receive marketing emails{business ? ` from ${business}` : ""} anymore. You may still get messages about enquiries you start.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold">Unsubscribe from marketing emails?</h1>
            <p className="mt-2 text-sm text-slate-600">We&apos;ll stop sending you marketing emails right away.</p>
            {state === "error" && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              onClick={confirm}
              disabled={state === "loading"}
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {state === "loading" ? "Unsubscribing…" : "Yes, unsubscribe me"}
            </button>
          </>
        )}
        <p className="mt-6 text-[11px] text-slate-400">Powered by Digi Mithra Social Pilot</p>
      </div>
    </div>
  );
}

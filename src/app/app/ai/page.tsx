"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingBlock } from "@/components/ui";

// The AI studio moved to Write; keep old links working.
export default function AiStudioRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/write");
  }, [router]);
  return <LoadingBlock />;
}

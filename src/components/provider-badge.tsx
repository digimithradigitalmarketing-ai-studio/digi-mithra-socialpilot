import { PROVIDERS } from "@/lib/providers";
import type { Provider } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const p = PROVIDERS[provider as Provider];
  return (
    <span
      title={p?.name ?? provider}
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-black", className)}
      style={{ background: p?.color ?? "#64748b" }}
    >
      {p?.short ?? provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function providerName(provider: string) {
  return PROVIDERS[provider as Provider]?.name ?? provider.replace(/_/g, " ");
}

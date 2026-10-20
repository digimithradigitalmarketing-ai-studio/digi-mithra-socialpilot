import type { Metadata } from "next";
import Image from "next/image";
import { AppProvider } from "@/components/app-context";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "Dashboard" };

function Splash() {
  return (
    <div className="brand-glow grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Image src="/mark.png" alt="Digi Mithra" width={72} height={72} className="animate-pulse rounded-2xl" priority />
        <p className="text-xs tracking-[0.3em] text-muted">LOADING WORKSPACE</p>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider fallback={<Splash />}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}

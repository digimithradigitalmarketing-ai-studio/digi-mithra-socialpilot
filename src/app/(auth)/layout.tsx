import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-glow flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex flex-col items-center gap-2">
        <Image src="/mark.png" alt="Digi Mithra" width={64} height={64} className="rounded-2xl" priority />
        <span className="text-lg font-bold">
          Digi <span className="text-gradient italic">Mithra</span>
        </span>
        <span className="-mt-1 text-[10px] font-semibold tracking-[0.3em] text-muted">SOCIAL PILOT</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-2xl">{children}</div>
    </div>
  );
}

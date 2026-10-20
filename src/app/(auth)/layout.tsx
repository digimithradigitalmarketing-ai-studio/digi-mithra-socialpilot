import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-glow flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-7 flex flex-col items-center gap-2">
        <Image src="/mark.png" alt="Digi Mithra" width={60} height={60} className="rounded-2xl shadow-lg shadow-brand/20" priority />
        <span className="text-xl font-bold tracking-tight">
          Digi <span className="text-gradient italic">Mithra</span>
        </span>
        <span className="-mt-1.5 text-[10px] font-semibold tracking-[0.3em] text-faint">SOCIAL PILOT</span>
      </Link>
      <div className="shadow-soft w-full max-w-sm rounded-3xl border border-line bg-panel p-6 sm:p-7">{children}</div>
    </div>
  );
}

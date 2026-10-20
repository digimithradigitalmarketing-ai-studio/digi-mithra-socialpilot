import { cn } from "@/lib/utils";

const SIZES = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-9 text-sm", lg: "size-12 text-base", xl: "size-24 text-3xl" } as const;

function initials(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
}

/** Profile photo with an initials fallback. */
export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover ring-2 ring-panel", SIZES[size], className)} />
    );
  }
  return (
    <span
      aria-label={name}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-2 to-brand-deep font-bold text-on-brand ring-2 ring-panel",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

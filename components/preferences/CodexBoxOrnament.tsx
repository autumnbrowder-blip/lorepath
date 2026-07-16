import { CornerFlourish } from "@/components/theme/FantasyDecor";

/** Antique gold corner flourishes for preference tomb/chest boxes. */
export function CodexBoxOrnament() {
  return (
    <>
      <CornerFlourish className="pointer-events-none absolute left-0.5 top-0.5 z-[2] h-8 w-8 text-gold-400/70 sm:h-9 sm:w-9" />
      <CornerFlourish className="pointer-events-none absolute right-0.5 top-0.5 z-[2] h-8 w-8 rotate-90 text-gold-400/70 sm:h-9 sm:w-9" />
      <CornerFlourish className="pointer-events-none absolute bottom-0.5 left-0.5 z-[2] h-8 w-8 -rotate-90 text-gold-400/70 sm:h-9 sm:w-9" />
      <CornerFlourish className="pointer-events-none absolute bottom-0.5 right-0.5 z-[2] h-8 w-8 rotate-180 text-gold-400/70 sm:h-9 sm:w-9" />
    </>
  );
}

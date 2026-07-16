import {
  CornerFlourish,
  GoldLeafSilhouette,
  SideOrnament,
  StarField,
  TealVine,
} from "@/components/theme/FantasyDecor";

type OrnateFrameProps = {
  children: React.ReactNode;
  className?: string;
};

export function OrnateFrame({ children, className = "" }: OrnateFrameProps) {
  return (
    <div className={`relative p-6 sm:p-10 ${className}`}>
      <div className="pointer-events-none absolute inset-0 rounded-sm border border-gold-500/80" />
      <div className="pointer-events-none absolute inset-[6px] rounded-sm border border-gold-500/40" />

      <CornerFlourish className="pointer-events-none absolute left-0 top-0 h-16 w-16 text-gold-400 sm:h-20 sm:w-20" />
      <CornerFlourish className="pointer-events-none absolute right-0 top-0 h-16 w-16 rotate-90 text-gold-400 sm:h-20 sm:w-20" />
      <CornerFlourish className="pointer-events-none absolute bottom-0 left-0 h-16 w-16 -rotate-90 text-gold-400 sm:h-20 sm:w-20" />
      <CornerFlourish className="pointer-events-none absolute bottom-0 right-0 h-16 w-16 rotate-180 text-gold-400 sm:h-20 sm:w-20" />

      <SideOrnament className="pointer-events-none absolute left-1/2 top-0 h-4 w-6 -translate-x-1/2 -translate-y-1/2 text-gold-400" />
      <SideOrnament className="pointer-events-none absolute bottom-0 left-1/2 h-4 w-6 -translate-x-1/2 translate-y-1/2 rotate-180 text-gold-400" />
      <SideOrnament className="pointer-events-none absolute left-0 top-1/2 h-4 w-6 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-gold-400" />
      <SideOrnament className="pointer-events-none absolute right-0 top-1/2 h-4 w-6 -translate-y-1/2 translate-x-1/2 rotate-90 text-gold-400" />

      <div className="relative">{children}</div>
    </div>
  );
}

export function FantasyBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-forest-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(61,107,79,0.22)_0%,_transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(61,107,79,0.18)_0%,_transparent_45%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(212,184,74,0.12)_0%,_transparent_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(197,160,89,0.1)_0%,_transparent_40%)]" />

      <TealVine className="pointer-events-none absolute -right-4 top-0 h-48 w-48 opacity-90 sm:-right-8 sm:top-4 sm:h-64 sm:w-64" />
      <TealVine
        flip
        className="pointer-events-none absolute -bottom-4 -left-4 h-44 w-44 opacity-90 sm:-bottom-8 sm:-left-8 sm:h-60 sm:w-60"
      />

      <GoldLeafSilhouette className="pointer-events-none absolute left-4 top-16 h-24 w-24 text-gold-600/40 blur-[1px] sm:left-12 sm:top-24 sm:h-32 sm:w-32" />
      <GoldLeafSilhouette className="pointer-events-none absolute bottom-20 right-8 h-28 w-28 text-gold-500/30 blur-[2px] sm:bottom-28 sm:right-16 sm:h-36 sm:w-36" />

      <StarField />
    </>
  );
}

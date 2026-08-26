import type { LucideIcon } from "lucide-react";

type BookMetadataItemProps = {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
};

export function BookMetadataItem({
  icon: Icon,
  label,
  children,
}: BookMetadataItemProps) {
  return (
    <div className="codex-inset flex items-start gap-3 bg-[#184033]/90 px-4 py-3.5">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-gold-600/55 bg-forest-950/55 shadow-[inset_0_1px_0_rgba(255,230,150,0.12)]"
        style={{ color: "#f0d78a" }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <dt className="font-display text-[13px] font-normal uppercase tracking-[0.08em] nav-dragon-gold">
          {label}
        </dt>
        <dd className="mt-1 font-heading text-lg font-medium leading-snug nav-dragon-gold">
          {children}
        </dd>
      </div>
    </div>
  );
}

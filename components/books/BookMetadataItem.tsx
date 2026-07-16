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
    <div className="flex items-start gap-3 rounded-sm border border-gold-600/40 bg-[#184033]/90 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,230,150,0.1)]">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-gold-600/55 bg-forest-950/55 shadow-[inset_0_1px_0_rgba(255,230,150,0.12)]"
        style={{ color: "#f0d78a" }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <dt className="font-storybook text-[13px] font-bold uppercase tracking-[0.18em] nav-dragon-gold">
          {label}
        </dt>
        <dd className="mt-1 font-heading text-lg font-medium leading-snug nav-dragon-gold">
          {children}
        </dd>
      </div>
    </div>
  );
}

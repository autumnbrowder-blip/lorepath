import { Crown } from "lucide-react";
import Link from "next/link";

type UpgradePromptProps = {
  title?: string;
  description?: string;
  compact?: boolean;
};

export function UpgradePrompt({
  title = "Unlock Match Score & Preferences",
  description = "Upgrade to LorePath Premium or use your free 14-day trial to set content preferences and see how well each book matches your taste.",
  compact = false,
}: UpgradePromptProps) {
  return (
    <div
      className={`rounded-2xl border border-gold-300/60 bg-gradient-to-br from-gold-50 to-surface-elevated dark:border-gold-700/40 dark:from-gold-950/30 dark:to-forest-950 ${
        compact ? "p-5" : "p-6"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Crown className="h-5 w-5 text-accent" />
        <h3 className="font-heading font-semibold nav-dragon-gold">{title}</h3>
      </div>
      <p className="mb-4 text-sm nav-dragon-gold">{description}</p>
      <Link href="/paid" className="btn-primary">
        <Crown className="h-4 w-4" />
        View Premium
      </Link>
    </div>
  );
}

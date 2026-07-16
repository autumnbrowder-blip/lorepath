import { Feather } from "lucide-react";
import Link from "next/link";

type SignInPromptProps = {
  title?: string;
  description?: string;
  compact?: boolean;
};

export function SignInPrompt({
  title = "Sign in to save your preferences",
  description = "During Beta, preferences and Match Score are free for every account. Sign in to set your comfort levels and see how well each book matches your taste.",
  compact = false,
}: SignInPromptProps) {
  return (
    <div
      className={`rounded-2xl border border-gold-300/60 bg-gradient-to-br from-gold-50 to-surface-elevated dark:border-gold-700/40 dark:from-gold-950/30 dark:to-forest-950 ${
        compact ? "p-5" : "p-6"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Feather className="h-5 w-5 text-accent" />
        <h3 className="font-heading font-semibold nav-dragon-gold">{title}</h3>
      </div>
      <p className="mb-4 text-sm nav-dragon-gold">{description}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="btn-primary">
          <Feather className="h-4 w-4" />
          Sign in
        </Link>
        <Link href="/register" className="btn-secondary">
          Create account
        </Link>
      </div>
    </div>
  );
}

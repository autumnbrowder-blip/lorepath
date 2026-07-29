import { FantasyPageShell } from "@/components/theme/FantasyPageShell";
import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";

export default function BookNotFound() {
  return (
    <FantasyPageShell>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-20 text-center sm:py-28">
        <div
          className="w-full max-w-lg px-6 py-12 shadow-[0_18px_48px_rgba(0,0,0,0.4)]"
          style={{
            backgroundImage: "url('/images/parchment.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            border: "2px solid #8c6b2e",
            borderRadius: "6px",
          }}
        >
          <ScrollText className="mx-auto mb-4 h-9 w-9 text-[#a67c2d]" />
          <h1 className="font-storybook text-2xl font-semibold tracking-[0.06em] text-[#2f1f0f]">
            This tome could not be opened
          </h1>
          <p className="mt-3 font-heading text-lg leading-relaxed text-[#3f2a1e]/90">
            This shelf-marker led nowhere in the living archives. Return to the
            shelves and choose another volume.
          </p>
          <Link
            href="/browse"
            className="btn-primary mt-8 inline-flex min-w-[12rem] items-center justify-center gap-2 px-8 py-3 text-sm tracking-[0.14em]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Browse
          </Link>
        </div>
      </div>
    </FantasyPageShell>
  );
}

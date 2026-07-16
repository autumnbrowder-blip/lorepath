import {
  CompassIcon,
  OpenBookFrame,
  QuillIcon,
} from "@/components/theme/FantasyDecor";

export function BookLogoMark() {
  return (
    <div className="relative mx-auto w-full max-w-xl px-4">
      <OpenBookFrame className="mx-auto h-auto w-full max-w-md text-gold-400" />

      <QuillIcon className="absolute left-[2%] top-[8%] h-16 w-16 text-gold-300 sm:left-[8%] sm:h-20 sm:w-20" />
      <CompassIcon className="absolute bottom-[12%] right-[2%] h-14 w-14 text-gold-400 sm:right-[8%] sm:h-16 sm:w-16" />

      <h1 className="absolute left-1/2 top-[42%] w-full -translate-x-1/2 -translate-y-1/2 text-center font-display text-5xl font-semibold tracking-wide text-cream-100 sm:text-6xl md:text-7xl">
        <span className="inline-block">
          <span className="relative">
            L
            <span className="absolute -bottom-1 left-0 h-px w-[140%] bg-gold-400/60" />
          </span>
          ore
        </span>
        <span className="inline-block">
          Path
          <span className="ml-0.5 inline-block text-gold-400">.</span>
        </span>
      </h1>
    </div>
  );
}

export function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 4C18 4 28 8 36 16C28 12 18 10 8 12C12 18 16 26 16 36C10 28 6 18 4 4Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M8 8C16 10 22 14 26 22C22 18 16 14 10 14C12 18 14 24 14 30"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.7"
      />
      <circle cx="28" cy="10" r="1.5" fill="currentColor" />
      <path
        d="M14 4C20 6 24 10 26 16"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.5"
      />
    </svg>
  );
}

export function SideOrnament({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2L13.5 6.5L18 8L13.5 9.5L12 14L10.5 9.5L6 8L10.5 6.5L12 2Z"
        stroke="currentColor"
        strokeWidth="0.9"
      />
      <path
        d="M12 5.5V10.5"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.6"
      />
    </svg>
  );
}

export function OpenBookFrame({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M210 248C170 228 120 220 70 228C50 232 30 238 10 248V60C30 48 50 42 70 40C120 32 170 40 210 60V248Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M210 248C250 228 300 220 350 228C370 232 390 238 410 248V60C390 48 370 42 350 40C300 32 250 40 210 60V248Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M210 60V248"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <path
        d="M210 248C200 254 190 258 180 260C200 256 210 252 210 248Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M210 248C220 254 230 258 240 260C220 256 210 252 210 248Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function QuillIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M18 98L92 24C96 20 102 20 106 24C110 28 110 34 106 38L32 112C28 116 22 116 18 112C14 108 14 102 18 98Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M92 24L106 38L88 56L74 42L92 24Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M20 100L28 92"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M30 18C34 14 40 12 46 14C38 18 32 26 28 36C26 28 27 22 30 18Z"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.8"
      />
      <path
        d="M38 10C42 8 48 8 52 12"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.6"
      />
    </svg>
  );
}

export function CompassIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="24" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <path d="M40 14V22M40 58V66M14 40H22M58 40H66" stroke="currentColor" strokeWidth="1" />
      <path
        d="M40 18L44 40L40 62L36 40L40 18Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <circle cx="40" cy="40" r="3" fill="currentColor" />
    </svg>
  );
}

export function TealVine({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden="true"
    >
      <path
        d="M180 20C150 30 130 50 120 80C110 110 90 130 60 150C80 140 100 120 110 95C120 70 140 45 180 20Z"
        fill="#10b981"
        opacity="0.85"
      />
      <path
        d="M160 40C140 55 125 75 118 100"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="135" cy="62" rx="14" ry="8" fill="#34d399" transform="rotate(-30 135 62)" />
      <ellipse cx="108" cy="88" rx="12" ry="7" fill="#10b981" transform="rotate(-50 108 88)" />
      <ellipse cx="82" cy="118" rx="11" ry="6" fill="#059669" transform="rotate(-20 82 118)" />
    </svg>
  );
}

export function GoldLeafSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M60 10C40 30 20 50 15 75C25 60 45 45 60 40C75 45 95 60 105 75C100 50 80 30 60 10Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M60 40V95"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
      />
    </svg>
  );
}

export function StarField() {
  const stars = [
    { top: "8%", left: "12%", size: 3, delay: "0s" },
    { top: "15%", left: "78%", size: 4, delay: "0.5s" },
    { top: "22%", left: "45%", size: 2, delay: "1s" },
    { top: "35%", left: "88%", size: 3, delay: "1.5s" },
    { top: "55%", left: "8%", size: 2, delay: "0.3s" },
    { top: "68%", left: "92%", size: 4, delay: "0.8s" },
    { top: "75%", left: "25%", size: 3, delay: "1.2s" },
    { top: "82%", left: "65%", size: 2, delay: "0.6s" },
    { top: "90%", left: "40%", size: 3, delay: "1.8s" },
    { top: "12%", left: "55%", size: 2, delay: "2s" },
    { top: "48%", left: "72%", size: 2, delay: "0.4s" },
    { top: "62%", left: "15%", size: 3, delay: "1.1s" },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {stars.map((star, i) => (
        <span
          key={i}
          className="absolute animate-twinkle rounded-full bg-gold-400"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
          }}
        />
      ))}
      {[
        { top: "18%", left: "32%" },
        { top: "42%", left: "85%" },
        { top: "58%", left: "52%" },
        { top: "78%", left: "18%" },
        { top: "28%", left: "68%" },
      ].map((star, i) => (
        <svg
          key={`spark-${i}`}
          viewBox="0 0 16 16"
          className="absolute h-3 w-3 animate-twinkle text-gold-300"
          style={{ top: star.top, left: star.left, animationDelay: `${i * 0.4}s` }}
          aria-hidden="true"
        >
          <path
            d="M8 0L9 7L16 8L9 9L8 16L7 9L0 8L7 7L8 0Z"
            fill="currentColor"
          />
        </svg>
      ))}
    </div>
  );
}

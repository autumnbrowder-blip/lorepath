export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,_rgba(184,148,31,0.12)_0%,_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_50%_20%,_rgba(212,184,74,0.1)_0%,_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,_rgba(61,107,79,0.12)_0%,_transparent_50%)]" />
      </div>
      <div className="ornate-panel relative z-10 w-full max-w-md p-8">
        {children}
      </div>
    </div>
  );
}

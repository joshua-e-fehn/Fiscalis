export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#050505] overflow-y-auto">
      {children}
    </main>
  );
}

/** Sign-in, sign-up and password pages: one centred column (ADR-061). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-10 pb-16 sm:px-6">
      {children}
    </div>
  );
}

import Link from "next/link";

import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password | Virelantic", robots: { index: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const usable = typeof token === "string" && token.length > 0 && token.length <= 200 && !error;

  return (
    <main className="mx-auth-root">
      <div className="mx-auth-panel">
        <div className="mx-eyebrow">Account</div>
        <h1 className="mx-title">Choose a new password</h1>
        {usable ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <p className="mx-muted">This reset link has expired or is not valid. Request a new one from the sign-in page.</p>
            <Link className="mx-btn" href="/login">Back to sign in</Link>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";

import { Power } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Mode = "sign-in" | "sign-up" | "reset";

export function LoginForm({ signupEnabled, resetEnabled }: { signupEnabled: boolean; resetEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const activeMode = mode === "reset" ? (resetEnabled ? "reset" : "sign-in") : signupEnabled ? mode : "sign-in";

  async function submit(formData: FormData) {
    setError(null);
    setPending(true);

    const email = String(formData.get("email") ?? "");
    let response: Response;
    try {
      response = activeMode === "reset"
        ? await fetch("/api/auth/request-password-reset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, redirectTo: "/reset-password" }),
        })
        : await fetch(activeMode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password: String(formData.get("password") ?? ""),
            name: String(formData.get("name") ?? "Virelantic Operator"),
          }),
        });
    } catch {
      setPending(false);
      setError("The request could not be sent. Check your connection and try again.");
      return;
    }

    setPending(false);

    if (activeMode === "reset") {
      // The same message whether or not the address has an account.
      if (response.status === 429) setError("Too many attempts. Wait a few minutes and try again.");
      else setResetSent(true);
      return;
    }

    if (!response.ok) {
      setError(response.status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : "That email and password did not match. Check them and try again.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auth-panel">
      <div className="mx-brand mx-auth-brand">
        <Image src="/virelantic-logo.svg" alt="Virelantic" width={220} height={59} priority />
      </div>
      <div className="mx-eyebrow">Operator access</div>
      <h1 className="mx-title">{activeMode === "reset" ? "Reset your password" : "Website & AI Optimization"}</h1>
      {activeMode === "reset" ? null : <div className="mx-segment">
        <button
          aria-pressed={activeMode === "sign-in"}
          className={activeMode === "sign-in" ? "is-active" : ""}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
        {signupEnabled ? <button
          aria-pressed={activeMode === "sign-up"}
          className={activeMode === "sign-up" ? "is-active" : ""}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Create account
        </button> : null}
      </div>}
      {activeMode === "reset" ? (
        <p className="mx-muted">
          {resetSent
            ? "If that address has an account, a reset link is on its way. It works for one hour."
            : "Enter your account email and we will send a link to choose a new password."}
        </p>
      ) : null}
      {!signupEnabled && activeMode !== "reset" ? <p className="mx-muted">Account creation is closed. Contact your workspace owner for access.</p> : null}
      <form action={submit} className="mx-form">
        {activeMode === "sign-up" ? (
          <label>
            Name
            <input className="mx-input" name="name" required type="text" />
          </label>
        ) : null}
        <label>
          Email
          <input autoComplete="email" className="mx-input" name="email" required type="email" />
        </label>
        {activeMode === "reset" ? null : (
          <label>
            Password
            <input
              autoComplete={activeMode === "sign-up" ? "new-password" : "current-password"}
              className="mx-input"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
        )}
        {error ? <p className="mx-error" role="alert">{error}</p> : null}
        <button className="mx-btn" disabled={pending} type="submit">
          <Power aria-hidden size={14} />
          {activeMode === "reset"
            ? (pending ? "Sending…" : "Send reset link")
            : activeMode === "sign-up"
              ? (pending ? "Creating account…" : "Create account")
              : (pending ? "Signing in…" : "Sign in")}
        </button>
        {resetEnabled ? (
          <button
            className="mx-btn mx-btn-ghost"
            onClick={() => { setError(null); setResetSent(false); setMode(activeMode === "reset" ? "sign-in" : "reset"); }}
            type="button"
          >
            {activeMode === "reset" ? "Back to sign in" : "Forgot your password?"}
          </button>
        ) : null}
      </form>
    </div>
  );
}

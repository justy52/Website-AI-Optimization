"use client";

import { useState } from "react";

import Link from "next/link";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    if (password !== String(formData.get("confirm") ?? "")) {
      setError("The two passwords do not match.");
      return;
    }
    setError(null);
    setState("pending");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (response.ok) {
        setState("done");
        return;
      }
      setError("This link has expired or was already used. Request a new one from the sign-in page.");
    } catch {
      setError("The password could not be saved. Check your connection and try again.");
    }
    setState("idle");
  }

  if (state === "done") {
    return (
      <>
        <p className="mx-muted" role="status">Your password has been changed. Other devices have been signed out.</p>
        <Link className="mx-btn" href="/login">Sign in</Link>
      </>
    );
  }

  return (
    <form action={submit} className="mx-form">
      <label>
        New password
        <input autoComplete="new-password" className="mx-input" minLength={8} name="password" required type="password" />
      </label>
      <label>
        Repeat new password
        <input autoComplete="new-password" className="mx-input" minLength={8} name="confirm" required type="password" />
      </label>
      {error ? <p className="mx-error" role="alert">{error}</p> : null}
      <button className="mx-btn" disabled={state === "pending"} type="submit">
        {state === "pending" ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}

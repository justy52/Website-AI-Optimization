"use client";

import { useState } from "react";

import { Power, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";

type Mode = "sign-in" | "sign-up";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setError(null);
    setPending(true);

    const endpoint =
      mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        name: String(formData.get("name") ?? "OPTIQ Operator"),
      }),
    });

    setPending(false);

    if (!response.ok) {
      setError("Authentication failed. Check the credentials and try again.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auth-panel">
      <div className="mx-brand mx-auth-brand">
        <Terminal aria-hidden size={18} />
        <span>OPTIQ</span>
      </div>
      <div className="mx-eyebrow">Operator access</div>
      <h1 className="mx-title">Revenue Loop Console</h1>
      <div className="mx-segment">
        <button
          className={mode === "sign-in" ? "is-active" : ""}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={mode === "sign-up" ? "is-active" : ""}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Create account
        </button>
      </div>
      <form action={submit} className="mx-form">
        {mode === "sign-up" ? (
          <label>
            Name
            <input className="mx-input" name="name" required type="text" />
          </label>
        ) : null}
        <label>
          Email
          <input className="mx-input" name="email" required type="email" />
        </label>
        <label>
          Password
          <input
            className="mx-input"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        {error ? <p className="mx-error">{error}</p> : null}
        <button className="mx-btn" disabled={pending} type="submit">
          <Power aria-hidden size={14} />
          {pending ? "Authenticating" : "Enter"}
        </button>
      </form>
    </div>
  );
}

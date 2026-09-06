import { redirect } from "next/navigation";

import { getOptionalAuthenticatedUser } from "@/server/auth";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getOptionalAuthenticatedUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="mx-auth-root">
      <div className="mx-rain" aria-hidden />
      <div className="mx-scan" aria-hidden />
      <LoginForm />
    </main>
  );
}

"use client";

import { Power } from "lucide-react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      className="mx-btn mx-btn-ghost"
      type="button"
      onClick={async () => {
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      <Power aria-hidden size={14} />
      Sign out
    </button>
  );
}

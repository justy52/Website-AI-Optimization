import { emailConfigured, sendEmail } from "@/server/email";

/**
 * Password reset by emailed link. Offered only when email can be sent, so the
 * sign-in page never promises a message that cannot arrive.
 */
export function passwordResetOptions(configured = emailConfigured()) {
  if (!configured) return {};
  return {
    resetPasswordTokenExpiresIn: 60 * 60,
    // A reset means the old password may be known to someone else.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Virelantic password",
        text: [
          "A password reset was requested for your Virelantic account.",
          "",
          `Open this link within one hour to choose a new password:\n${url}`,
          "",
          "If you did not ask for this, ignore this email. Your password stays the same.",
        ].join("\n"),
      });
    },
  };
}

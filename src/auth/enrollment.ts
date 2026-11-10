import { APIError } from "better-auth/api";

type EnrollmentEnvironment = {
  APP_ENV: "local" | "qa" | "production";
  AUTH_SIGNUP_ENABLED?: string;
  AUTH_ENROLLMENT_EMAILS?: string;
};

// The list remains server-side. Production enrollment requires both a deliberate
// switch and exact addresses; domains, wildcards and browser input grant nothing.
export function enrollmentPolicy(env: EnrollmentEnvironment) {
  const addresses = (env.AUTH_ENROLLMENT_EMAILS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const valid = addresses.length > 0 && addresses.length <= 100 && addresses.every(
    address => /^[^\s@*,]+@[^\s@*,]+\.[^\s@*,]+$/.test(address),
  );
  const allowed = new Set(valid ? addresses : []);
  const signupEnabled = env.APP_ENV === "production"
    ? env.AUTH_SIGNUP_ENABLED === "true" && valid
    : env.AUTH_SIGNUP_ENABLED !== "false";
  return {
    signupEnabled,
    permitsEmail: (email: string) => signupEnabled && (
      env.APP_ENV !== "production" || allowed.has(email.trim().toLowerCase())
    ),
  };
}

export function authEnrollmentOptions(env: EnrollmentEnvironment) {
  const policy = enrollmentPolicy(env);
  return {
    emailAndPassword: { enabled: true, disableSignUp: !policy.signupEnabled },
    databaseHooks: {
      user: {
        create: {
          before: async (user: { email: string }) => {
            if (!policy.permitsEmail(user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "Account creation is not available for this address.",
              });
            }
          },
        },
      },
    },
  };
}

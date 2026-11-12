import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

// Baseline browser protections for every page. The report download and QA
// fixture routes set their own stricter policy, so they are left out here.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    return [{ source: "/((?!api/reports/|qa/).*)", headers: securityHeaders }];
  },
};

export default withWorkflow(nextConfig);

import type { MetadataRoute } from "next";

import { publicDisallowedPaths, publicSiteOrigin } from "@/domain/public-site/indexing";

// Read the deployment's environment per request so a preview never serves
// production rules from a build cache.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin();
  if (!origin) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...publicDisallowedPaths] },
    sitemap: `${origin}/sitemap.xml`,
  };
}

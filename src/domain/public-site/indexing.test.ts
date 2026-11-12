import { describe, expect, it } from "vitest";

import { publicSiteOrigin } from "./indexing";

describe("public site indexing origin", () => {
  it("is available only for production on a clean HTTPS origin", () => {
    expect(publicSiteOrigin({ APP_ENV: "production", PUBLIC_INTAKE_ORIGIN: "https://virelantic.com" })).toBe("https://virelantic.com");
    expect(publicSiteOrigin({ APP_ENV: "production", BETTER_AUTH_URL: "https://virelantic.com/" })).toBe("https://virelantic.com");
    expect(publicSiteOrigin({ APP_ENV: "qa", PUBLIC_INTAKE_ORIGIN: "https://preview.example.com" })).toBeNull();
    expect(publicSiteOrigin({ APP_ENV: "production", PUBLIC_INTAKE_ORIGIN: "http://virelantic.com" })).toBeNull();
    expect(publicSiteOrigin({ APP_ENV: "production", PUBLIC_INTAKE_ORIGIN: "https://virelantic.com/path" })).toBeNull();
    expect(publicSiteOrigin({ APP_ENV: "production", PUBLIC_INTAKE_ORIGIN: "not a url" })).toBeNull();
    expect(publicSiteOrigin({ APP_ENV: "production" })).toBeNull();
  });
});

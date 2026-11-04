import { describe, expect, it } from "vitest";
import { getIntakeConfig } from "./intake-config";

const valid = { PUBLIC_INTAKE_ENABLED:"true", PUBLIC_INTAKE_DATABASE_URL:"postgresql://virelantic_intake_public_submit:synthetic@db.example.com/app", PUBLIC_INTAKE_SECRET:"s".repeat(40), PUBLIC_INTAKE_WORKSPACE_ID:"11111111-1111-4111-8111-111111111111", PUBLIC_INTAKE_ORIGIN:"https://virelantic.example", PUBLIC_BUSINESS_NAME:"Synthetic Business", PUBLIC_CONTACT_EMAIL:"contact@example.com" };
describe("intake configuration", () => {
  it("closes submission by default and for incomplete configuration", () => {
    expect(getIntakeConfig({})).toBeNull();
    expect(getIntakeConfig({...valid,PUBLIC_CONTACT_EMAIL:""})).toBeNull();
    expect(getIntakeConfig({...valid,PUBLIC_INTAKE_ENABLED:"false"})).toBeNull();
  });
  it("keeps business facts and operator review available when submissions are closed", () => {
    expect(getIntakeConfig({...valid,PUBLIC_INTAKE_ENABLED:"false"},false)).not.toBeNull();
  });
  it("requires a restricted submission role and a single secure origin", () => {
    expect(getIntakeConfig(valid)).not.toBeNull();
    expect(getIntakeConfig({...valid,PUBLIC_INTAKE_DATABASE_URL:"postgresql://app_owner:synthetic@db.example.com/app"})).toBeNull();
    expect(getIntakeConfig({...valid,PUBLIC_INTAKE_ORIGIN:"http://virelantic.example"})).toBeNull();
    expect(getIntakeConfig({...valid,PUBLIC_INTAKE_ORIGIN:"https://virelantic.example/path"})).toBeNull();
  });
});

import {
  assertCanMutateWorkspaceResource,
  AuthorizationError,
  type WorkspaceContext,
} from "@/domain/tenancy/context";

export const convertibleLeadStatuses = [
  "QUALIFIED",
  "AUDIT_OFFERED",
  "AUDIT_PURCHASED",
] as const;

export type LeadConversionStatus = (typeof convertibleLeadStatuses)[number];

export type LeadForConversion = {
  id: string;
  workspaceId: string;
  status: string;
  companyName: string;
};

export type ClientForConversion = {
  id: string;
  workspaceId: string;
  sourceLeadId: string | null;
};

export type LeadConversionDecision =
  | {
      kind: "create";
      clientName: string;
      sourceLeadId: string;
    }
  | {
      kind: "existing";
      clientId: string;
    };

export function planLeadConversion(input: {
  context: WorkspaceContext;
  lead: LeadForConversion;
  existingClient?: ClientForConversion | null;
}): LeadConversionDecision {
  assertCanMutateWorkspaceResource(input.context, input.lead);

  if (input.existingClient) {
    assertCanMutateWorkspaceResource(input.context, input.existingClient);

    if (input.existingClient.sourceLeadId !== input.lead.id) {
      throw new AuthorizationError("Cross-workspace source lead link was blocked.");
    }

    return {
      kind: "existing",
      clientId: input.existingClient.id,
    };
  }

  if (!convertibleLeadStatuses.includes(input.lead.status as LeadConversionStatus)) {
    throw new Error("Only qualified or audit-ready leads can be converted.");
  }

  return {
    kind: "create",
    clientName: input.lead.companyName,
    sourceLeadId: input.lead.id,
  };
}

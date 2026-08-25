# 29 - Execution Verification Rules & Business Measurement Formulas

## Status

Authoritative V1 verification and measurement-rule specification.

No external write is DONE until its verification rule passes or a human explicitly resolves the failed verification.

---

# 1. Verification Rules by Action Type

## Metadata title/description change
After execution:
1. refetch target URL;
2. confirm 200/expected response;
3. parse rendered/server HTML as appropriate;
4. confirm approved title/meta value;
5. check no accidental noindex/canonical regression.

PASS only when expected values are observed.

## Canonical change
Refetch and confirm exactly one intended canonical relation and no obvious self-conflict.

## Robots / noindex change
Refetch relevant header/meta/robots content and confirm intended state. High-risk; human approval required.

## Redirect
Request old URL without auto-follow first.
Verify expected 3xx status and Location.
Follow bounded redirects and confirm final target is expected 200/valid response with no loop.

## Internal link change
Refetch source page, confirm intended href/anchor exists, then verify target resolves successfully.

## Schema change
Refetch page, parse JSON-LD, verify syntactic validity and expected type/properties.
Reject if the published schema contains an unsupported BusinessFact/claim.

## Content publication/update
Refetch page and verify:
- expected approved content/version marker or content hash;
- page remains accessible/indexability state unchanged unless intended;
- primary CTA/navigation/form smoke test still passes;
- no broken layout indicator from configured browser QA.

## Image optimization/replacement
Verify image request succeeds, dimensions/format are expected, no broken references, and sampled page renders without broken-image state.

## Form/CTA change
Run non-destructive smoke test using test-mode/sandbox behavior where possible.
Do not submit real customer leads without an explicit test route/label.
Verify event/redirect/success path.

## Analytics event change
Use provider debug/test facilities where possible; confirm event name/parameters reach the configured destination before marking verified.

## Google Business Profile or other third-party profile writes
Deferred from automated EXECUTE unless a specific adapter and verification rule are approved. PREPARE/manual workflow remains valid.

---

# 2. Verification Failure Policy

If verification fails:
- mark `FAILED_VERIFICATION`;
- preserve pre-change snapshot;
- stop dependent work;
- attempt automatic rollback only if the action has a tested safe rollback policy;
- otherwise create immediate human review;
- never repeatedly retry a destructive write without bounded idempotency.

---

# 3. Business Outcome Definitions

## Website Visit
Provider-defined session/user metric; report provider and definition.

## Lead
A recorded primary conversion event such as qualifying phone call, form submission, booking, or other configured event.

## Qualified Lead
A lead that satisfies the client's documented qualification rule. Do not let AI invent qualification criteria.

## Closed Revenue
Revenue tied to a lead/opportunity through a reliable CRM/job/payment source or explicit client confirmation.

## Attributed Revenue
Closed Revenue linked to a digital touchpoint using the configured attribution method.

Do not use "attributed" if only temporal correlation exists.

---

# 4. Estimated Value Formulas

Do not compute estimates unless the client provides or approves the necessary inputs.

## Estimated Pipeline Value
`qualified_leads x average_closed_job_revenue`

Label: **Estimated pipeline value**, not revenue.

## Expected Revenue Value
`qualified_leads x historical_close_rate x average_closed_job_revenue`

Requirements:
- historical close rate source/window stored;
- average revenue source/window stored;
- label clearly as **Expected revenue value (estimate)**.

## Expected Gross Profit Value
`qualified_leads x historical_close_rate x average_closed_job_revenue x historical_gross_margin_rate`

Only show if a reliable gross-margin input exists.

Never default an industry close rate, job value, or margin without client-approved data.

---

# 5. Marketing ROI Formula

When reliable attributed revenue exists:

`ROAS-like service revenue multiple = attributed_revenue / optimization_service_fees`

Use careful wording because optimization service fees are not ad spend.

When reliable profit exists:

`estimated net value = attributed_or_expected_gross_profit - optimization_service_fees - explicitly included third_party_costs`

Never present this as audited financial ROI.

---

# 6. Measurement Source Record

Every material report metric stores:
- provider/source;
- metric name;
- measurement definition;
- date window;
- timezone;
- attribution method if any;
- stale/complete status;
- confidence/limitations;
- snapshot or query reference.

---

# 7. Before/After Comparison Rules

Use equivalent windows where practical.

Disclose:
- seasonality;
- incomplete current period;
- tracking changes;
- website migration;
- major ad/campaign changes;
- outages;
- other material confounders known to the system/user.

Do not claim causation solely from a before/after movement.

---

# 8. Report Approval

The Reporting Agent may draft interpretations.

Human finalization is required in V1 for:
- attributed/expected revenue claims;
- ROI/value claims;
- claims that a specific change caused a business result;
- client-facing statements about AI visibility.

The system should automatically flag unsupported causal wording.

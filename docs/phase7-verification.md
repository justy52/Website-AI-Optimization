# Phase 7 deterministic implementation verification

`verification-v1.1` is OBSERVE-only. It uses the existing Agent Run budgets,
persisted catalog, Workflow runtime, tenant context and tool-call audit records.
Its only tools read the approved package, fetch its public target through
`safeFetchText`, and compare approved expectations. No model or external write
adapter is involved. PREPARE specialist permissions are unchanged.

An implementation package is an immutable snapshot of one approved artifact ID,
version, approval, target, proposed values and evidence references. A newer draft
does not replace it. Manual implementation requires the operator to explicitly
select the package actually used; leaving the selection blank records manual work
without claiming an artifact version. Content briefs still require human authoring.

Title and description use parsed HTML values. Explicit headings, internal-link
destination/anchor, and parsed JSON-LD properties have conservative deterministic
checks. Page fetch/indexability and JSON validity checks can prevent a pass.
Unsupported checks, unsafe fetches and insufficient evidence never become pass.
Fetched content has no authority to select tools, approve, change entitlements or
execute. Expected and observed comparisons, response hashes, timestamps and method
version are stored; hidden reasoning and raw full-page HTML are not.

Each verification attempt is historical. Failure, warning and unavailable outcomes
remain visible after a retry. An older in-flight attempt cannot change a newer
implementation's current state. Only VERIFIED closes the Opportunity automatically.
Human verification remains clearly labeled and retains the reviewed Phase 5
OWNER/ADMIN/ANALYST policy. Automated verification requests use the narrower
OWNER/ADMIN boundary already used to record manual implementation.

Phase 5 accounting is preserved: implemented-unverified and warning work retain
its existing implementation-credit behavior; failed/unavailable work does not count
as successful fulfillment. Repeated verifications do not add implementation minutes
or duplicate credit. Approval/package creation alone does not consume completion.

Migration `0013` adds the tenant-scoped package table, exact version/composite FKs,
forced RLS, verification run/package/method links, immutable snapshot/history update
guards, UNAVAILABLE states and the new immutable agent-definition version.

## QA fixture

`/api/qa/verification-fixture` is available only with `APP_ENV=qa`. It renders fixed,
harmless HTML in bounded timestamp-selected windows: an initial audit finding,
implemented title with mismatched structured data, then corrected structured data.
It has no database, mutation method, customer data, arbitrary HTML input or secret.
The browser test records the initial real audit and independently re-fetches this
public target using the normal verifier. No verifier special case or injected pass
exists. Time changes the fixture representation; OPTIQ performs no external site
edit. Production returns 404. Unit/live tests separately cover all verifier types,
SSRF/redirect defenses, exact version binding, stale attempts, roles and RLS.

Live AI remains disabled/optional. External EXECUTE remains disabled. No future
execution adapter or additional execution permission was introduced.

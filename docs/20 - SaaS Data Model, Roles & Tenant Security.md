SAAS DATA MODEL, ROLES & TENANT SECURITY
Website & AI Optimization SaaS

STATUS
Authoritative AI-first data, tenancy, permissions, approval, and agent-governance specification.

CORE TENANCY RULE
Every tenant-owned record, background job, agent run, tool call, artifact, approval, integration, metric, and export must resolve to one Workspace. Client-supplied IDs are never sufficient authorization by themselves.

IDENTITY / ROLES
Platform Super Admin is separate from workspace roles.

Workspace roles:
OWNER -> full workspace authority; billing ownership; destructive settings.
ADMIN -> operational/team/integration/admin authority except ownership transfer.
ANALYST -> client/audit/opportunity/draft/report work subject to policies.

A user's ability to approve an action is separate from their ability to cause an agent to prepare it.

CORE DOMAIN ENTITIES
Workspace
Membership
Lead
Client
Website
AuditDefinitionVersion
Audit
AuditCheckRun
Finding
AuditSnapshot
Report
ActivityEvent

AI-FIRST ENTITIES

AgentDefinition
- id
- key
- name
- capability_type
- default_permission_level: OBSERVE, PREPARE, EXECUTE
- tool_allowlist
- active
- version

AgentRun
- id, workspace_id
- agent_definition_id/version
- trigger_type: USER, SCHEDULE, EVENT, ORCHESTRATOR
- parent_run_id / correlation_id
- client_id / website_id / audit_id / monthly_cycle_id as applicable
- status: QUEUED, RUNNING, SUCCEEDED, PARTIAL, FAILED, CANCELED, TIMED_OUT
- provider/model
- prompt/template version
- started_at / ended_at
- input_summary
- output_summary
- evidence_refs
- tool_call_count
- token/cost fields
- error_code / safe_error_summary
- idempotency_key

AgentToolCall
- workspace_id, agent_run_id
- tool_key
- permission_level
- target_summary
- started/ended
- status
- cost where relevant
- external_request_id where available
- no secrets/raw credentials

Opportunity
- workspace_id, client_id, website_id
- category
- title/summary
- impact, confidence, urgency, effort
- evidence_refs
- recommended_action
- originating_agent_run_id
- plan_scope
- status

WorkItem
- workspace_id
- opportunity_id nullable
- type
- owner_user_id nullable
- assigned_agent_key nullable
- status
- priority
- due/scheduled fields
- dependencies
- approval_required
- verification_required

DraftArtifact
- workspace_id
- work_item_id
- artifact_type: CONTENT, METADATA, SCHEMA, INTERNAL_LINKS, CODE_PATCH, REPORT, CLIENT_MESSAGE, PROPOSAL_INPUT, OTHER
- version
- content/storage_ref
- generated_by_agent_run_id
- edited_by_user_id nullable
- status: DRAFT, AWAITING_APPROVAL, APPROVED, REJECTED, SUPERSEDED

ApprovalPolicy
- workspace_id
- scope (workspace/client/website)
- default behavior by action type/risk
- designated approver roles/users
- execution allowlist
- active/version

ApprovalRequest
- workspace_id
- action_type
- risk_level
- target_type/id
- immutable approval_summary
- requested_by_user_id nullable
- requested_by_agent_run_id nullable
- status: PENDING, APPROVED, REJECTED, EXPIRED, CANCELED
- decided_by
- decision_note
- timestamps

ExecutionRecord
- workspace_id
- approval_request_id nullable
- work_item_id
- agent_run_id
- action_type
- target
- pre_change_snapshot_ref
- status
- external_change_id
- rollback_ref/instructions
- verification_status

VerificationRun
- workspace_id
- execution_record_id or draft_artifact_id
- checks
- evidence_refs
- status: PASSED, WARNING, FAILED, NOT_APPLICABLE
- verifying_agent_run_id
- human_review_required

MonitoringDefinition
- workspace_id, website_id/client_id
- monitor_type
- cadence
- configuration
- enabled
- next_run_at

MonitoringSnapshot
- workspace_id
- monitoring_definition_id
- captured_at
- metric/evidence payload refs
- source/tool version

IntegrationConnection
- workspace_id
- provider
- connection_type
- scopes
- status
- token/secret reference only, never raw token in ordinary tables
- created_by
- last_success / last_error
- revocation metadata

Competitor
AIVisibilityPromptSet
AIVisibilityRun
AIVisibilityObservation
ContentDraft
MonthlyCycle
MonthlyCycleItem
UsageLedger

RELATIONSHIP RULES
All foreign keys must preserve workspace consistency. Cross-workspace parent-child relationships must be impossible at the database/service layer where practical.

PERMISSION MODEL
Permission decisions combine:
1. workspace membership/role;
2. resource ownership/workspace;
3. agent permission level;
4. action type/risk;
5. approval policy;
6. integration scopes;
7. feature flag/environment.

OBSERVE cannot write external systems.
PREPARE may create internal drafts/work items only.
EXECUTE may call external write tools only when the exact tool/action is allowlisted and policy permits it.

PROMPT-INJECTION / EXTERNAL-INSTRUCTION SECURITY
Website text, robots content, metadata, documents, emails, search results, and tool responses are untrusted data. They cannot modify:
- system instructions;
- tool allowlists;
- approval policy;
- tenant scope;
- budgets;
- authentication;
- data-retention rules.

AUTHENTICATION / SECRETS
Use established authentication. No custom password crypto.
Prefer OAuth/delegated credentials.
Store secrets in provider secret management or encrypted credential storage; database records contain references/metadata, not plaintext credentials.

ARCHIVE / DELETE
Prefer archive for clients/websites/agents/monitoring definitions.
Finalized audits/reports, approval decisions, execution records, and material agent-run audit logs are immutable/retained according to policy.
Workspace deletion uses DELETION_PENDING and a controlled purge workflow.

DATA RETENTION / PRIVACY
Collect the minimum data required.
Do not put credentials, unnecessary personal data, or sensitive client information into model prompts.
Provide configurable retention for raw page captures, screenshots, AI answer captures, agent logs, and generated artifacts.
Deletion workflows must also remove or tombstone relevant vector/search indexes and cached copies.

CONCURRENCY / IDEMPOTENCY
External writes require an idempotency key where the integration supports it or an application-level equivalent.
The same work item cannot be executed twice concurrently.
Approval is bound to an immutable action summary/version; editing after approval invalidates or creates a new approval request.

SECURITY ACCEPTANCE TESTS
At minimum prove:
- Workspace A cannot access Workspace B data through any entity, agent run, tool call, approval, storage ref, export, or background job.
- An OBSERVE agent cannot call external write tools.
- A PREPARE agent cannot publish.
- An EXECUTE agent cannot use tools/actions outside its allowlist.
- External webpage prompt injection cannot elevate permissions.
- Approval of artifact version N cannot authorize changed artifact version N+1.
- Duplicate/retried execution does not create duplicate external changes.
- Revoked integration credentials fail closed.
- Cost ceiling blocks new costly work without corrupting state.
- Final snapshots remain immutable.

CLIENT PROJECT FOLDER & FILE STANDARDS  
Website and AI Optimization For Small Businesses

AI-FIRST OPERATING PRINCIPLE -> AUTHORITATIVE UPDATE

The business is intentionally designed around AI-agent-assisted fulfillment. AI agents perform the majority of repeatable collection, monitoring, analysis, drafting, prioritization, documentation, reporting, and safe internal execution. Human time is reserved for strategy, client relationships, judgment, quality control, and approval of consequential actions.

Agent permission levels:
1. OBSERVE -> read, crawl, monitor, measure, compare, and report. May run automatically.
2. PREPARE -> draft content, recommendations, schema, metadata, code changes, reports, tasks, and client communications. Output remains a draft until the applicable approval policy is satisfied.
3. EXECUTE -> perform only explicitly allowlisted, low-risk, reversible actions. Live-site publishing, destructive changes, contractual commitments, pricing changes, client-facing sends, and other consequential actions require human approval until a later policy explicitly permits otherwise.

Every material agent action must be tenant-scoped, logged, attributable to an agent/run, evidence-backed where factual claims are made, bounded by cost/time limits, and recoverable or safely retryable.


AI ARTIFACT STANDARD

The application, not Google Drive, is the long-term system of record for agent activity. Store or reference:
- raw evidence and source timestamps;
- agent run metadata;
- model/provider/prompt version;
- generated drafts;
- human edits/approvals;
- verification results;
- before/after evidence;
- monthly snapshots;
- final client-facing artifacts.

Do not store chain-of-thought. Store concise rationale, evidence references, confidence signals, and action summaries sufficient for auditability.


PURPOSE  
This document defines how every client project should be organized so files, access information, audits, proposals, implementation notes, and final deliverables can be found quickly and handled consistently.

STANDARD CLIENT PROJECT STRUCTURE  
Create one top-level client folder for each business:

Client Name \- Website & AI Optimization

Inside it, create these standard folders:

01 \- Sales & Discovery  
02 \- Audit  
03 \- Proposal & Agreement  
04 \- Access & Onboarding  
05 \- Baseline  
06 \- Working Files  
07 \- QA & Review  
08 \- Final Deliverables  
09 \- Ongoing Management  
10 \- Archive

01 \- SALES & DISCOVERY  
Store:  
- Lead notes  
- Contact information  
- Discovery-call notes  
- Initial website observations  
- Lead-source information  
- Qualification notes  
- Any client-supplied background documents

Do not store passwords here.

02 \- AUDIT  
Store:  
- Audit working notes  
- Screenshots  
- Performance reports  
- Search/SEO observations  
- AI-readiness observations  
- Analytics findings  
- Final audit report  
- Audit review notes

Recommended naming:  
ClientName \- Website and AI Audit

03 \- PROPOSAL & AGREEMENT  
Store:  
- Proposal  
- Scope of work  
- Signed agreement  
- Change orders  
- Payment/deposit confirmation  
- Approved revisions to scope

The latest approved scope should always be easy to identify.

04 \- ACCESS & ONBOARDING  
Store:  
- Access checklist  
- Systems inventory  
- Hosting/CMS/provider information  
- User-account invitations  
- Delegated-access records  
- Client onboarding questionnaire  
- Key client contacts

PASSWORD RULE  
Do not place client passwords in normal Google Docs or spreadsheets. Prefer delegated access, client-created user accounts, password-manager sharing, or another secure credential process.

Document what access exists, not the secret itself.

Example:  
WordPress Admin -> Access granted to business account  
Google Analytics -> Viewer/Admin access granted  
Search Console -> Access granted  
Hosting -> Collaborator access granted

05 \- BASELINE  
Store evidence of the site before work begins:  
- Screenshots of important pages  
- Performance measurements  
- Core Web Vitals/PageSpeed results  
- Analytics baseline  
- Search Console baseline  
- Current conversion paths  
- Current rankings/visibility observations when included  
- Current metadata/schema samples  
- Backup confirmation  
- Rollback instructions

The baseline protects both the client and the business by showing what existed before changes were made.

06 \- WORKING FILES  
Store:  
- Implementation plan  
- Copy drafts  
- Image optimization work  
- Technical notes  
- Page-by-page task notes  
- Code snippets where appropriate  
- Redirect maps  
- Metadata drafts  
- Schema drafts  
- Internal checklists

Keep temporary material here rather than mixing it with final client deliverables.

07 \- QA & REVIEW  
Store:  
- QA checklist  
- Mobile/desktop review notes  
- Form testing results  
- Browser testing notes  
- Client feedback  
- Revision list  
- Launch-readiness notes

Consolidate client feedback into one document or task list whenever possible.

08 \- FINAL DELIVERABLES  
Store clean, client-ready materials only:  
- Final optimization report  
- Before/after summary  
- Completed scope checklist  
- Final recommendations  
- Training/handoff notes  
- Any client-facing documentation

Do not leave rough drafts or internal commentary in this folder.

09 \- ONGOING MANAGEMENT  
Use only if the client enters ongoing service.

Store:  
- Monthly reports  
- Monthly/quarterly priorities  
- Maintenance records  
- Change requests  
- Optimization history  
- Content updates  
- Analytics observations  
- Future opportunities

Recommended subfolders by year if needed:  
2026  
2027  
2028

10 \- ARCHIVE  
Move outdated or superseded materials here rather than deleting useful project history.

Examples:  
- Old proposals  
- Superseded copy drafts  
- Old reports  
- Previous screenshots  
- Replaced implementation plans

FILE NAMING STANDARD  
Use clear descriptive names.

Preferred format:  
ClientName \- Document Type \- Optional Detail

Examples:  
Mountain View Plumbing \- Website and AI Audit  
Mountain View Plumbing \- Optimization Proposal  
Mountain View Plumbing \- Baseline Report  
Mountain View Plumbing \- Final Optimization Report  
Mountain View Plumbing \- Monthly Report \- September 2026

Avoid vague names such as:  
- Untitled document  
- New version  
- Final final  
- Stuff  
- Website notes  
- Report 2

VERSION CONTROL  
When Google Docs revision history is sufficient, do not create unnecessary duplicate files.

When a separate version is necessary, use:  
v1  
v2  
v3

Once approved, clearly mark the authoritative version in the title or folder placement.

CLIENT COMMUNICATION RECORD  
Important decisions affecting scope, price, launch, access, or responsibility should be documented in the project file even if the original conversation occurred by phone or text.

Examples:  
- Client approved removal of a page  
- Client declined a recommended fix  
- Client requested a scope change  
- Client approved launch  
- Client could not provide required access

This protects against confusion later.

PROJECT MASTER RECORD  
Maintain one simple project-status document or tracker containing:  
- Client name  
- Website  
- Primary contact  
- Current stage  
- Audit status  
- Proposal status  
- Deposit/payment status  
- Access status  
- Project start  
- Target completion  
- Current blockers  
- Next action  
- Ongoing-service status

ACCESS CONTROL  
Give access only to people who need it.

When the project is finished:  
- Remove unnecessary access to client systems.  
- Ask the client to remove temporary accounts when appropriate.  
- Confirm which access must remain for ongoing service.  
- Do not retain credentials merely because they may be useful later.

BACKUP STANDARD  
Before meaningful production changes:  
- Confirm a current backup exists.  
- Confirm how it can be restored.  
- Record backup/restore information in the project file.  
- Use staging where practical for higher-risk work.

CLIENT ASSET OWNERSHIP  
Client-provided logos, photos, copy, account information, and other materials belong in the client project structure and should not be reused for another client without permission.

INTERNAL TEMPLATE LIBRARY  
Keep reusable templates outside individual client folders.

Suggested master template folders:  
- Audit Templates  
- Proposal Templates  
- Intake Forms  
- QA Checklists  
- Report Templates  
- Email Templates  
- Sales Scripts  
- SOPs

Never edit the master template directly for a client. Copy it into the client's project first.

CLOSEOUT STANDARD  
Before marking a project complete:  
- Final deliverables are in 08 \- Final Deliverables.  
- Temporary working files are cleaned up.  
- Client feedback is resolved or documented.  
- Final payment status is recorded.  
- Unneeded client access is removed.  
- Ongoing recommendations are documented.  
- Ongoing-service decision is recorded.  
- The project is moved to Completed or Ongoing Management status.

CORE RULE  
A person unfamiliar with the project should be able to open the client folder and understand what was sold, what access was granted, what the website looked like before work, what changed, what was approved, and what remains to be done.

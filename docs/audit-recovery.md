# Close a stale manual audit

An owner or admin can open the audit detail and select **Close stale audit run** once a manual audit has been running for at least 15 minutes. Confirm the audit is no longer making progress, then record a short reason. The audit and run become **Canceled**, the admission slot is released, and existing evidence and the closure event remain available. Closing a run records one decision even if the form is submitted again.

The timeout leaves headroom for the collector’s bounded HTTP redirects and per-request timeouts, the optional 90-second PageSpeed request, DNS, and persistence. A worker that returns after closure cannot write results for the canceled run. Any network requests it already started may still finish.

If the client’s authorization is still current, start a separate audit manually after reviewing the failure. Closure itself does not start another audit or provider request. For an audit started by scheduled monitoring, review the parent monitoring run through the existing operations process.

## Audit collection scope

The page, robots.txt, sitemap, and up to ten sampled same-site pages are fetched only from the saved website hostname and its exact www counterpart. Sampled pages honour robots.txt and carry no query string; see `docs/audit-check-coverage.md`. HTTP can upgrade to HTTPS. A redirect from HTTPS to HTTP or to any other hostname is rejected before DNS lookup. An off-scope robots.txt or sitemap destination is treated as unavailable. Store the intended canonical hostname and include the permitted website scope in the client’s written authorization.

## Automatic closing of cut-off audits (2026-11-12)

An audit now has a hard collection deadline of 270 seconds, below the 300-second hosting limit on the pages that start audits. If the deadline passes, the audit is recorded as failed with a plain explanation instead of staying "running".

If the hosting platform still cuts a run off, it is closed automatically: any manual audit run still marked running 15 minutes after it started is marked failed the next time someone opens the Audits page or starts an audit. The closure is recorded as `audit.abandoned_run_closed`. Monitoring-owned runs are left to their parent run. The manual "Close stale audit run" action remains.

A workspace may start at most 30 audits in any 24 hours (`DAILY_AUDIT_LIMIT`), because each audit makes paid Places and backlink lookups that the monthly dollar ceiling does not count.

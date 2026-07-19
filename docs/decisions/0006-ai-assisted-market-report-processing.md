# ADR 0006: AI-assisted market-report processing

- Status: Proposed
- Date observed: 2026-07-19
- Decision owners: **Owner confirmation required**

## Context

The admin report builder parses operator-pasted regional and pipeline tables in the browser, computes medians, and sends client metadata plus full rows to `/api/generate-report`. The server route forwards the prompt to Anthropic and requests structured narrative. Operators can edit model output before generating escaped HTML and printing a PDF.

The Anthropic credential stays server-side. However, the API route currently has no independent authentication, admin authorization, input-size limit, rate limit, or structured server-side prompt construction. The browser sends an arbitrary prompt string.

## Proposed decision

Permit AI only as a drafting aid for market-report narrative, with deterministic calculations performed locally/server-side and mandatory human factual review before distribution. Send only approved, minimized data to an approved vendor/model through an authenticated, admin-authorized server boundary.

Current code partially implements this decision but does not meet all proposed controls.

## Required controls

- Authenticate and verify admin status in the route.
- Accept structured fields rather than an arbitrary prompt.
- Validate types, row counts, and request size; apply rate and cost controls.
- Keep API credentials server-only and redact sensitive logs.
- Define permitted data and vendor retention/training settings.
- Preserve source provenance and reviewer approval with the final report.
- Treat model JSON as untrusted; validate its schema and every claim.
- Provide a non-AI/manual fallback.

## Consequences

AI can accelerate summaries and wording while the operator retains edit control. Risks include hallucinated statistics, disclosure of client/candidate data, prompt injection through pasted tables, vendor availability, unbounded cost, model drift, and an unsecured endpoint.

HTML escaping reduces report markup injection but does not make factual output safe. The fixed methodology text also requires independent content approval.

## Alternatives

- Fully manual report writing.
- Deterministic templates with no external model.
- A queued, auditable backend report service.
- A different vendor or self-hosted model.

Vendor/model selection, cost rationale, and rejected alternatives are **Owner confirmation required**.

## Validation before acceptance

Complete privacy/security review; approve data categories and vendor terms; add route authorization, limits, schema validation, and monitoring; test prompt-injection and malformed responses; define reviewer evidence and report retention; confirm methodology claims.

## Supersession criteria

Revisit after vendor/model changes, a data incident, material hallucination rate, new confidentiality requirements, or adoption of a deterministic/report-service architecture.

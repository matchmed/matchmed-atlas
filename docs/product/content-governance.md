# Product content governance

## Purpose

Atlas currently repeats changing product, dataset, scoring, correction, consent, commercial, and legal claims in multiple screens. This document inventories known conflicts and defines a proposed control model. It does not itself approve any claim. Until accountable owners validate a statement, it remains implementation evidence only.

Public Terms and Privacy pages are the canonical legal text currently presented by the application. This document may identify conflicts with them, but must not silently reinterpret them.

## Known inconsistencies requiring resolution

### Dataset counts

- Home quick link: **6,800+ ophthalmology practices**.
- Onboarding hero: **6,400+ ophthalmology practices**.
- Home dashboard: current practice/doctor/affiliation/job counts queried from Supabase at runtime.
- Home and onboarding: **22,000+ physician careers**.

Runtime values and fixed marketing numbers can diverge, and none displays a dataset version/as-of date.

**Owner confirmation required:** Establish one canonical, dated dataset manifest and approve whether UI should use live counts, reviewed rounded counts, or both.

### Data period and freshness

Current phrases include “2019 to present,” “from 2019 onwards,” “eight years of CMS Medicare data,” “latest CMS data,” and “updated periodically.” They are not equivalent. “Present” and “latest” can become false without release metadata, while “eight years” may refer to annual snapshots or elapsed time.

**Owner confirmation required:** Approve exact first/last source years, source-release identifiers, processed-at date, refresh cadence, and wording rules.

### Favorites versus Shortlist

User navigation and actions predominantly use **Favorites** and **Saved**. Database/code and some accessibility labels use **shortlist**. Empty-state copy asks users to “Add to Favorites,” while practice list/map labels say “Add to shortlist.”

**Owner confirmation required:** Select one user-facing term and update accessibility/support/data glossary usage deliberately.

### Corrections

- Practice detail: authenticated form for practice name, address/location, phone, website, or other; success promises review but no timeframe.
- Scoring methodology: email channel for practice representatives, a five-business-day response aim, review against CMS records, and correction in the next update cycle.
- Admin statuses: `new`, `reviewing`, `fixed`, and `rejected`.

The form is not explicitly limited to representatives and has no dedicated score option. There is no reporter-facing status or implemented notification.

**Owner confirmation required:** Approve canonical channels, submitter eligibility, evidence, acknowledgement/resolution targets, status definitions, notification, appeal, and what “fixed” means.

### Account deletion and retention

Account UI promises restoration within 30 days and implements profile soft deletion. Privacy says verified deletion requests are actioned within 45 days, subject to retention exceptions. No purge/restoration implementation is represented.

**Owner confirmation required:** Legal/privacy and product owners must define the authoritative lifecycle and reconcile all timeframes and terminology.

### Consent and partner outreach

Onboarding/Account use one optional Boolean for contact by both practices and industry partners and say users may opt out at any time. Partner copy suggests physicians separately choose educational opportunities or direct communication from any partner. Terms and Privacy describe contact-based withdrawal through the published support address, while the product supports in-app unchecking.

**Owner confirmation required:** Approve scope, granularity, legal basis, evidence, withdrawal, and partner-specific wording.

### Commercial and eligibility claims

- Login/signup: free for early-career ophthalmologists.
- Partner page: free for ophthalmologists, supported by partners.
- Terms: some services may be subscription-billed and eligibility includes broader medical professionals and employing entities.

**Owner confirmation required:** Define audiences, eligibility, free/paid boundaries, subscription applicability, sponsorship, and effective dates.

### Route visibility

Scoring Methodology and Partners read like public explanatory/disclosure content but are protected by authentication. Scoring is in authenticated navigation; Partners is linked only from the authenticated home page. Terms and Privacy are public.

**Owner confirmation required:** Approve the audience and navigation placement for methodology and partner disclosures.

## Proposed canonical-source register

The following register must be assigned before repeated claims are considered governed:

- **Legal terms and privacy:** current public Terms/Privacy pages; legal owner and effective date required.
- **Dataset counts, coverage, freshness:** versioned dataset manifest; data owner required.
- **Scoring definitions and limitations:** versioned scoring specification; scoring owner and legal review required.
- **Correction process and targets:** correction runbook; operations/data owner required.
- **Partner independence and consent:** approved partner/consent policy; commercial and privacy/legal owners required.
- **Eligibility, pricing, and product boundaries:** product policy; product/commercial owner required.

**Owner confirmation required:** Name the accountable owner, approver(s), storage location, review cadence, and emergency delegate for each source.

## Authoring rules

1. Do not hand-copy changing counts. Reference a generated value or a dated reviewed manifest.
2. Pair “latest,” “current,” and “present” with an as-of date or avoid them.
3. Treat score explanations as controlled excerpts from one versioned scoring source.
4. Treat Terms and Privacy as legal text; changes require legal review and a new effective date.
5. Keep consent copy identical wherever the same consent is collected; store the copy/version with evidence.
6. Distinguish implementation facts (“the UI stores a Boolean”) from policy (“this is valid consent”).
7. Never promise a correction, deletion, support, or refresh time unless an operational owner accepts and monitors it.
8. Clearly label illustrative partners and paid/sponsored placements.
9. Use one glossary for practice, physician, affiliation, roster, job/listing, employer lead, partner, Favorite/Shortlist, and score terms.
10. Never place credentials or secret values in product content or documentation.

## Change and review workflow

For any controlled claim:

1. The author identifies its canonical source and owner.
2. Data/scoring/legal/commercial reviewers validate the claim as applicable.
3. The change records an effective date, source/version, and every route/component containing the claim.
4. Reviewers search for duplicates and update or remove them in the same release.
5. Release checks verify route visibility, links, and dated claims.
6. Emergency corrections use a named owner and retrospective review.

**Owner confirmation required:** Define required approvers, review service levels, release authority, audit record, and emergency-correction procedure.

## Minimum review cadence

No cadence is currently documented. A reasonable cadence cannot be asserted without ownership:

- **Owner confirmation required:** Dataset counts/freshness review frequency.
- **Owner confirmation required:** Scoring methodology/version review frequency.
- **Owner confirmation required:** Terms, Privacy, consent, and partner-claim legal review frequency.
- **Owner confirmation required:** Correction-channel and SLA operational review frequency.
- **Owner confirmation required:** Route and navigation inventory review frequency.

## Publication gate

A claim is publishable as authoritative only when it has a canonical source, accountable owner, review date, effective/version date where applicable, and resolved duplicates. Otherwise it must be labeled as pending confirmation or omitted. The current inconsistencies above remain unresolved and should not be harmonized by guessing.

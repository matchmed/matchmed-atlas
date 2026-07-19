# Product overview

## Status and purpose

This document describes the product behavior visible in the current repository. It is an implementation inventory, not a statement that every current behavior or public claim is approved policy. Product, legal, commercial, and scoring assertions that cannot be established from the repository are marked **Owner confirmation required**.

MatchMed Atlas is currently presented as an ophthalmology workforce-intelligence product. Authenticated users can research ophthalmology practices and physician career histories, view practice-retention metrics, save practices, review job opportunities, manage a professional profile, and report apparent practice-data errors. Administrators have separate tools for user administration, job-to-practice linking, correction-report review, and market-report generation.

## Audiences

The user interface repeatedly addresses residents, fellows, early-career ophthalmologists, and practicing ophthalmologists. The Terms also describe licensed physicians, medical professionals, physicians in postgraduate training, and organizations authorized to employ physicians as eligible users. Those descriptions are not identical.

- **Owner confirmation required:** Define the canonical primary and secondary personas.
- **Owner confirmation required:** Define eligibility, including whether non-ophthalmologists, employers, recruiters, staffing firms, and other medical professionals may hold accounts.
- **Owner confirmation required:** Define the jobs-to-be-done for each persona and the product’s intended geographic scope.

## Current product capabilities

### Practice research

The practice directory loads practice records from Supabase and supports name/location search, multi-state filtering, sorting, pagination, and table or Mapbox map views. The map clusters locations and exposes practice name, location, phone, retention score, and a route to the detail screen. Practice detail screens show:

- practice name, location, phone, website, and CMS-derived roster history;
- Retention Score and change versus a 2019 baseline;
- current and all-time physician counts, short exits, veteran count, and median years since medical-school graduation;
- tenure-distribution buckets;
- a code-generated interpretation;
- current and former physician affiliations;
- linked job opportunities and contact details;
- save/remove controls and a data-issue report form.

The UI says rosters may lag recent additions or departures. It does not expose a record-level source date.

### Physician research

The physician directory supports search by physician name or NPI and paginates results. A physician detail screen displays name, NPI, medical-school graduation year, years since graduation, and current and prior practice affiliations. Practice links allow movement between physician and practice histories.

### Favorites

Users can save a practice from list/map and detail views, view saved practices on `/favorites`, and remove saved practices. The user-facing navigation and page title use **Favorites**, while database tables, internal functions, and some accessibility labels use **shortlist**. This is a known terminology inconsistency.

- **Owner confirmation required:** Select “Favorites” or “Shortlist” as the canonical product term and align UI, accessibility text, data documentation, and support language.

### Jobs

The jobs screen lists rows from `employer_leads`, with practice, location, subspecialty interests, practice setting, clinical/surgical mix, desired hiring timeline, free-text details, received date, and any point-of-contact details. Users can search by practice or city, filter by inferred state and subspecialty, sort by received date, and open a linked practice. Jobs also appear on linked practice detail screens.

The UI calls these “Active Job Listings” and “Active Job Opportunities,” but the code does not filter on active status or expiration.

- **Owner confirmation required:** Define when a listing is active, its source, review/expiry rules, and whether all `employer_leads` rows should be visible.

### Account and onboarding

Users can create an account with email/password or Google, confirm email where required, and complete a two-step profile. The profile includes identity and contact details, NPI, training and career preferences, desired states, clinical focus, procedure history/interests, and consent choices. Account settings allow editing most of these fields, changing a password for email/password accounts, changing the partner-contact preference, and initiating account deletion.

Account deletion currently sets `profiles.deleted_at`, signs the user out, and prevents later access through the request proxy. It is a soft deletion, not demonstrated physical deletion. The account UI promises 30-day restoration; the Privacy Policy says verified deletion requests are actioned within 45 days.

- **Owner confirmation required:** Define restoration, final deletion, retention, and user-support policy and reconcile the 30-day and 45-day statements.
- **Owner confirmation required:** Define which onboarding fields are genuinely mandatory. Many labels include an asterisk, but the step-one button only checks first name, last name, NPI, and training status.

### Corrections

Authenticated users can report practice name, location, phone, website, or other issues from a practice detail screen. The report stores the selected field, up to 1,000 characters of description, a snapshot of displayed practice contact fields, the practice, and the reporting profile. Admins can process statuses `new`, `reviewing`, `fixed`, or `rejected`, add notes, and set a resolution time.

The scoring-methodology page instead directs practice representatives to email a support address, promises a five-business-day response target, and says confirmed errors are corrected in the next update cycle. The in-app flow promises only review.

- **Owner confirmation required:** Choose canonical correction channels, eligibility, acknowledgement and resolution targets, evidence standards, reporter notifications, and the operational definition of “fixed.”

### Administration and market reports

Admin screens expose active profiles, NPI-verification toggles, magic-link sending, soft deletion, linking unlinked job leads to practices, and correction-report review. A report builder sends structured market data to a server-side Anthropic integration and supports editing/printing the generated report.

These are operational capabilities, not normal user features. Authorization depends on profile `is_admin` checks and database policies where represented.

## Data and interpretation boundary

Public-facing copy says practice and score data come from CMS Medicare Part B Provider Data and cover physician-practice affiliations from 2019 onward. The repository contains consumers of processed `practices`, `doctors`, and `affiliations` records, but not the source ingestion pipeline, production schema, score-generation implementation, complete RLS policies, dataset releases, or quality-control evidence. Therefore:

- the repository supports documenting what fields the UI reads and how it displays them;
- it does not establish that all displayed records are complete, current, correctly matched, or exclusively derived from the stated source;
- it does not establish the exact scoring formulas or validate public methodological claims.

See [Scoring and intelligence](./scoring-and-intelligence.md) for the auditable distinction between displayed behavior and unverified methodology.

## Access and route visibility

The request proxy currently allows unauthenticated access only to login, signup, password recovery, Terms, Privacy, and `/auth/*`. Practice/physician research, jobs, favorites, account, admin, the scoring-methodology page, and the partners page require authentication. This creates a visibility inconsistency: scoring and partner pages contain public-style explanatory, independence, and legal copy, yet they are not public routes. Scoring appears in authenticated navigation; Partners is linked from the authenticated home page but not the primary/secondary navigation.

- **Owner confirmation required:** Decide whether `/scoring-methodology` and `/partners` are public, authenticated informational pages, or both, and define their canonical navigation placement.

## Product boundaries

The current methodology page says Atlas measures observed physician movement rather than clinical quality, patient outcomes, compensation, workplace culture, or reasons for departures. It recommends using scores as one due-diligence input. The Terms say the service facilitates connections and does not provide physician services or create an employment relationship.

- **Owner confirmation required:** Approve the canonical “does not do” statement and any regulated-employment, recruiting, clinical, or financial boundaries.
- **Owner confirmation required:** Define the commercial model. Current copy says Atlas is free for physicians, the signup page narrows that to early-career ophthalmologists, the partner page describes partner support, and the Terms mention subscription billing.
- **Owner confirmation required:** Define product success metrics and current roadmap boundaries.

## Count and freshness caveats

The authenticated home page computes current table counts at runtime but also contains fixed claims of **6,800+ practices** and **22,000+ physician careers**. Onboarding contains a fixed claim of **6,400+ practices**, **22,000+ physician careers**, and “8 years” of data. Other copy says “2019 to present” and “updated periodically.”

Until a canonical, dated dataset manifest exists, fixed counts and year-span claims must not be treated as authoritative.

- **Owner confirmation required:** Approve one canonical source for current counts, coverage dates, annual-snapshot count, and “last updated” metadata.

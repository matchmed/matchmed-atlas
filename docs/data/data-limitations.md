# Data limitations and coverage gaps

**Aliases:** known-issues, data-gaps, coverage-limitations

## Accuracy boundary

This document records known limitations of Atlas workforce and location coverage. Some items are **code-derived** (visible in application behavior, UI copy, or documented pipeline scripts outside this repository). Many coverage and roadmap statements are **product/data-owner claims** that cannot be fully verified from the application repository alone.

- **Code-derived fact** — observed in app behavior, UI disclaimers, or checked-in migrations/helpers.
- **Published / owner claim** — stated product or data-ops knowledge; confirm against CMS source releases and the ingestion pipeline before treating as audited fact.
- **Owner confirmation required** — open decisions, timelines, or compliance gates.

Related reading:

- `docs/data/provenance-ingestion-and-refresh.md`
- `docs/data/domain-model-and-authorization.md`
- `docs/product/scoring-and-intelligence.md`

## Data source: CMS Doctors and Clinicians database

Atlas draws physician and practice data from the Centers for Medicare & Medicaid Services (CMS) Doctors and Clinicians database (and related Medicare Part B provider affiliation products described on the scoring methodology page). This is a **billing-focused** dataset, not a comprehensive registry of all ophthalmologists in the United States.

### What this means

- **Billing truth, not marketing truth.** CMS reports where physicians and practices bill, not all places they work.
- **Federal payees only.** Practices must bill Medicare to appear in CMS.
- **Periodic updates.** Data is refreshed on a schedule; practices may lag behind real-time enrollment changes.

Practice detail location tooltips currently state that listed sites are billing locations listed distinctly by CMS; they may not include every physical location, and CMS may list the same physical location multiple times for different departments or billing centers.

- **Owner confirmation required:** Exact CMS dataset names, file/release IDs, licenses, and refresh cadence for every Atlas product surface.

## Known coverage gaps

### VA (Veterans Affairs) physicians

**Issue:** CMS does not comprehensively cover Veterans Affairs physicians. VA operates a separate credentialing and billing system.

**Impact:** Practices with VA affiliations may show incomplete physician rosters.

**Workaround:** Atlas may identify practices with VA presence where physicians are also Medicare-billing; full VA-only rosters are not captured.

**Future:** VA data integration is a planned roadmap item.

- **Owner confirmation required:** Current VA detection method (if any), compliance constraints, and target timeline.

### Military & DoD physicians

**Issue:** Active-duty military ophthalmologists are not in CMS.

**Impact:** Military-affiliated practices may show incomplete rosters.

### International physicians

**Issue:** Only US-licensed, US-billing physicians are included.

**Impact:** Foreign medical graduates working internationally are not in Atlas.

### Retired & inactive physicians

**Issue:** CMS includes physicians who billed in the past but may be retired or inactive.

**Impact:** Practice histories may include physicians no longer seeing patients. The application’s current-roster classification uses affiliation `status` (lowercased `on roster`) and related CMS-derived fields; that is billing/affiliation status, not employment status.

**Note:** Historical affiliations are intentional — they support tenure and retention analysis.

## Known data quality issues

### Multi-floor / multi-department billing

**Issue:** Hospitals and large practices bill by department, floor, or clinic code, not only by physical address.

**Example:** Large health systems show multiple “locations” that are actually different departments or billing centers within the same building.

**Impact:** Location count may appear inflated for multi-floor institutions.

**Mitigation:** Atlas displays street + city/state on practice detail and explains CMS billing vs physical locations in the location disclaimer tooltip. Map spiders connect multi-site practices when selected.

**Workaround:** For large health systems, interpret location count as billing complexity, not necessarily distinct offices.

### Same address, different ZIPs

**Issue:** CMS sometimes splits the same physical address into multiple ZIP codes (including ZIP+4 variations).

**Impact:** The same practice location may appear multiple times.

**Mitigation:** Atlas displays full addresses to help disambiguate. The `practice_locations` unique constraint is observed as `(practice_id, address, city, state, zip)`.

### Solo practices & unaffiliated physicians

**Issue:** A percentage of CMS records have no organizational affiliation (`org_pac_id`).

**Solution (pipeline claim):** Atlas assigns `ADDR_*` surrogate IDs (for example `ADDR_GA_ATLANTA_123MAINST`).

**Impact:** Solos may appear with generated IDs rather than legal entity names.

**Workaround:** Surrogate IDs are intended to be stable; if a solo later receives a real `org_pac_id` in CMS, it may appear as a new practice (not merged retroactively) unless an explicit merge process exists.

- **Owner confirmation required:** Surrogate ID generation rules, stability guarantees, and merge/dedup policy when CMS later supplies `org_pac_id`.

### Physician name variations

**Issue:** CMS may show the same physician under slightly different names (middle-initial variations, name changes, and similar).

**Impact:** Physician identity is keyed by NPI in application joins, not by display name; minor name variations may not match across external datasets.

**Mitigation:** Atlas uses NPI as the primary physician identifier in affiliation joins; name fields are for display.

## Geocoding limitations

### Geocoding failures

**Issue:** A small percentage of addresses may fail geocoding (network timeouts, military/special facilities, sparse rural addresses).

**Examples:** Military bases, VA facilities, some rural addresses.

**Impact:** Some `practice_locations` rows may have null latitude/longitude and therefore no map pin.

**Mitigation:** Pipeline geocode scripts can retry failed rows; practice error reports and admin review support contact/metadata corrections. Coordinate backfill is outside the Next.js app repo.

- **Owner confirmation required:** Current geocode failure rate, retry schedule, and manual correction workflow ownership.

### Coordinate accuracy

**Issue:** Geocoding typically returns building-level coordinates, not unit/suite precision.

**Impact:** Practices with multiple suites at the same address may share identical or near-identical coordinates on the map (Atlas also applies light jitter when coordinates collide).

**Workaround:** Full addresses are displayed; users can distinguish suites by reading address text.

## Temporal limitations

### Data currency

**Issue:** CMS data updates on a regular schedule, not in real time.

**Impact:** Recent hires, departures, or office closures may not appear immediately in Atlas. Practice detail also notes that physician rosters may lag recent changes.

### Historical data

**Issue:** Historical CMS depth is limited in early years relative to later coverage.

**Impact:** Practices that recently entered CMS or are newer may have limited historical context for retention analysis.

- **Owner confirmation required:** Exact covered years per dataset release and when “2019 onward” scoring claims apply to each entity.

## Out of scope (deliberately)

The following are **not** captured by Atlas and are out of scope for CMS-derived workforce surfaces:

- **Physical locations where physicians work but do not bill.** Example: surgeon co-tenants at another practice, telemedicine-only physician, part-time provider at a third location.
- **Non-billing relationships.** Example: medical director role, consulting arrangement, shareholder without active billing.
- **Staff relationships.** Atlas tracks physicians (NPI holders), not PAs, NPs, technicians, or administrative staff.
- **Clinical quality metrics.** CMS affiliation data used here does not include outcome quality, patient satisfaction, or clinical performance.
- **Compensation or employment terms.** Salary, equity, and contract details are not in CMS.
- **Marketing/branded locations.** Practice websites often list more locations than they bill from; Atlas shows billing truth, not marketing claims.

`employer_leads` / jobs are a separate product data domain and are not covered by this CMS limitations inventory.

## How to use this information

### For PE groups & practice leaders

- Use Atlas to understand the **billing footprint** (where entities actually bill).
- Compare Atlas data to internal records to identify billing complexity or affiliate relationships.
- Recognize that location count reflects CMS billing structure, not necessarily physical office count.

### For physicians

- Data in Atlas comes from CMS billing/affiliation records tied to NPI and practice identifiers.
- If a physician is missing or appears under the wrong practice, check CMS enrollment/affiliation status first.
- VA, military, or telehealth-only work generally will not appear.

### For developers & data analysts

- Practice locations use a unique constraint on `(practice_id, address, city, state, zip)` (pipeline/schema claim; confirm in production DDL).
- Solo practices may use `ADDR_*` surrogate `org_pac_id` values; treat them as stable only if the pipeline guarantees it.
- Map and list filters depend on `practice_locations`; check for null coordinates when pins are missing.
- Authenticated browser clients require `SELECT` on `practice_locations` (see migration `20260727030000_practice_locations_select_grants.sql`).

## Reporting data issues

Found an error or gap?

- **Practice missing or incorrect:** Check CMS enrollment status first, then use in-app practice error reporting or contact operations.
- **Duplicate locations that are clearly the same:** These are usually billing splits; if genuinely duplicate billing records, note it in a report.
- **Location coordinates are wrong:** Report with full address; operations can re-geocode.
- **Physician missing:** Verify active Medicare billing/affiliation; VA or telehealth-only work will not appear.

See `docs/operations/admin-and-data-corrections-runbook.md` for admin triage of practice error reports.

## Future coverage plans

**Planned (owner claim):**

- VA physician integration (technical and compliance-pending);
- Manual consolidation tools for multi-floor institutions;
- Address correction workflow for user-reported errors.

**Under consideration (owner claim):**

- Telemedicine-only provider tracking;
- Non-billing relationship mapping (medical directors, partners).

- **Owner confirmation required:** Prioritization, compliance review, and publication criteria for each roadmap item.

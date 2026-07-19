# Scoring and intelligence

## Documentation status

This document separates three different kinds of evidence:

1. **Implemented display behavior** — calculations, thresholds, and text visible in this repository.
2. **Published methodology claims** — statements made by the current scoring-methodology UI but not independently implemented or verifiable here.
3. **Unknown scoring pipeline behavior** — formulas, source releases, exclusions, and validation that require accountable-owner evidence.

The repository consumes precomputed score fields from Supabase. It does not contain the scoring pipeline or enough production schema/data to reproduce a score. Published copy must therefore not be mistaken for an audited specification.

## Intended interpretation shown in the UI

The methodology page says Atlas measures physician movement rather than clinical quality. It frames a practice’s score as a description of how long physicians appearing on its Medicare roster stayed and recommends using the result to decide what questions to ask. It explicitly says the score is not a measure of patient outcomes, compensation, workplace culture, or the reason someone joined or left.

The UI describes the underlying source as CMS Medicare Part B Provider Data, using annual physician-practice affiliation snapshots from 2019 onward. It says no surveys, self-reporting, recruiter claims, proprietary data, or third-party data are used.

These are current public-facing claims, not repository-verifiable facts.

- **Owner confirmation required:** Identify exact source datasets, release/file identifiers, years, fields, and licenses.
- **Owner confirmation required:** Confirm whether any non-CMS reference, enrichment, registry, manual, or proprietary data participates in entity matching, exclusions, scoring, or display.
- **Owner confirmation required:** Approve the interpretation and disclaimer language with product, scoring, and legal owners.

## Displayed practice metrics

The practice detail UI reads these precomputed fields:

- `retention_score` and `retention_score_delta`;
- `experience_level` and `experience_level_delta`;
- `latest_roster_size` and `total_physicians_all_time`;
- `short_tenure_departure_count`;
- `med_yrs_grad` and `veteran_count`;
- tenure buckets `tenure_0_1`, `tenure_2_3`, `tenure_4_5`, `tenure_6_7`, and `tenure_8_plus`.

Affiliation rows provide roster status, first/last seen years, tenure years, graduation year, physician and practice identifiers. The detail UI classifies an affiliation as current only when `status`, lowercased, exactly equals `on roster`; every other value is treated as former.

- **Owner confirmation required:** Provide canonical definitions, units, null semantics, denominator rules, and data lineage for every metric and status.
- **Owner confirmation required:** Define how first/last seen years map to tenure, including inclusive counting, partial years, missing years, and intermittent affiliations.

## Published component model

The methodology page currently describes the Retention Score as a 0–100 weighted composite:

```text
[(Attrition Resistance × primary weight)
 + (Tenure Strength × secondary weight)]
 × Cluster Modifier (if applicable)
```

It labels exact component weights proprietary.

### Attrition Resistance

Published copy calls this the primary component and says it measures weighted departure load. It shows qualitative tenure-at-departure weights:

- 0–2 years: highest;
- 2–4 years: high;
- 4–6 years: moderate;
- 6–10 years: low;
- 10+ years: minimal.

The boundaries overlap at 2, 4, 6, and 10 in the prose/table notation. No numeric weights or boundary inclusivity are supplied.

### Tenure Strength

Published copy calls this the secondary component and says it uses only the active roster, so departed physicians no longer contribute.

### Cluster Signals

Published copy describes two downward modifiers:

- a concentration of departures within an unspecified rolling time window;
- multiple physicians departing after similar tenures.

No thresholds, window, minimum counts, similarity rule, or adjustment is present.

### Experience Level

Published copy says Experience Level is context only, derived from median years since medical-school graduation for the current roster, and is not part of the retention composite. The UI nevertheless colors this 0–100-like value with the same score palette and shows a delta versus 2019.

- **Owner confirmation required:** Confirm the actual composite formula, all component formulas, bounds, missing-value handling, and order of operations.
- **Owner confirmation required:** Resolve tenure-band boundary inclusivity and publish non-overlapping definitions.
- **Owner confirmation required:** Define cluster windows, thresholds, modifiers, and minimum sample rules.
- **Owner confirmation required:** Define Experience Level scaling and explain why score coloring and a 2019 delta are appropriate for a contextual median-derived measure.
- **Owner confirmation required:** Define what is legitimately proprietary versus what must be disclosed for users to interpret, contest, and audit outputs.

## Published exclusions and adjustments

The methodology UI states that:

- retirements are down-weighted;
- fellowship and training roles are excluded;
- one departure carries little signal, while repeated patterns matter.

The repository has no implementation showing how retirement is inferred, how training roles are identified, how an individual departure is weighted, or how pattern strength changes a score.

- **Owner confirmation required:** Define retirement inference, training/fellowship classification, exceptions, source fields, and false-positive review.
- **Owner confirmation required:** Define minimum practice/roster/departure sample sizes and any shrinkage, smoothing, censoring, or confidence treatment.

## Score availability and null behavior

When `retention_score` is null, lists show an em dash or “No score.” A practice-detail heuristic says a score requires a minimum of two all-time physicians. That sentence is hard-coded presentation text; the repository does not prove that the pipeline applies this rule.

Several display calculations use fallback values:

- all-time physicians falls back from `total_physicians_all_time` to loaded affiliation count;
- null/zero short exits become zero;
- null/zero roster and tenure values often display as zero;
- null/zero median years since graduation displays `0 yrs`.

These fallbacks can blur “missing” and “zero.”

- **Owner confirmation required:** Confirm score eligibility and minimum sample rules.
- **Owner confirmation required:** Specify where null, zero, unavailable, suppressed, and insufficient-sample states must remain distinct.

## Score bands and color semantics

Shared UI helpers implement these exact bands:

- score `>= 85`: dark green;
- `>= 80` and `< 85`: green;
- `>= 70` and `< 80`: yellow/olive;
- `>= 60` and `< 70`: orange;
- `< 60`: red;
- null: gray.

The map legend labels these as `85+`, `80-85`, `70-80`, `60-70`, and `Below 60`. Those labels visually overlap at the endpoints even though implementation uses the non-overlapping ranges above. The application does not publish qualitative names for these bands, but color can imply an evaluative ranking.

- **Owner confirmation required:** Approve band thresholds, labels, endpoint notation, accessibility treatment, and whether the same palette should apply to Experience Level.

## Deltas and the 2019 baseline

The UI displays numeric retention and experience deltas “vs 2019.” Color/arrow helpers classify:

- `d > 5`: green upward arrow;
- `d < -5`: red downward arrow;
- `-5 <= d <= 5`: gray dash.

The methodology page describes delta as stronger, weaker, or no meaningful change since 2019. The value itself is still shown even when classified neutral. There is no evidence here of how the baseline is calculated for practices absent in 2019, how entity changes are handled, or whether the delta is absolute score points or another unit.

- **Owner confirmation required:** Define the baseline cohort, baseline formula, delta units, meaningful-change threshold, and treatment of practices/physicians without comparable 2019 records.
- **Owner confirmation required:** Confirm whether “since 2019” remains valid for every scored entity and every displayed metric.

## Tenure distributions and roster summaries

The detail page presents counts in 0–1, 2–3, 4–5, 6–7, and 8+ year buckets. Bars are normalized against the largest bucket, not the total roster, so bar lengths show relative count rather than percentage. “Veterans (8+ yrs)” uses the precomputed `veteran_count`, which is not checked against `tenure_8_plus`.

Affiliation tenure labels independently collapse every value `>= 8` to “8+ yrs.” Falsy tenure displays as zero.

- **Owner confirmation required:** Define which population the tenure buckets represent (current, departed, or all-time), ensure bucket counts reconcile with summary fields, and define how missing tenure is represented.

## UI-generated intelligence

The practice detail page generates one deterministic text insight in the browser. This is not an AI model output. Branches run in this order:

1. No score: says insufficient history and claims a two-physician minimum.
2. Key-person risk: latest roster size equals one and all-time physicians exceed three.
3. “Exceptionally stable”: score is at least 85 and 6+ year bucket counts exceed 0–3 year counts; text calls this “near-zero attrition” without checking the short-exit count.
4. “Strong retention”: score is at least 70; includes short exits/all-time count.
5. “High churn”: short exits divided by all-time physicians exceeds 40%.
6. “Experienced, stable”: median years since graduation exceeds 30 and churn is below 20%.
7. Otherwise: “Moderate retention.”

Important consequences:

- branch order means all scores `>= 70` bypass high-churn and aging-roster branches unless the earlier key-person or exceptionally-stable branches apply;
- “near-zero attrition” is inferred from score and tenure shape rather than directly verified;
- “succession pressure over the next decade” is a forward-looking interpretation based only on median years since graduation and churn;
- “significant historical turnover” in the key-person branch is inferred from all-time count greater than three, not an explicit turnover threshold;
- the short-exit rate uses `short_tenure_departure_count / all-time physicians`, but exact source definitions are absent.

These strings should be treated as heuristics, not validated findings.

- **Owner confirmation required:** Approve, revise, or remove each heuristic and define evidence, wording, priority, and legal review requirements.
- **Owner confirmation required:** Define whether insight generation needs versioning, confidence, explainability, monitoring, and user-visible caveats.

## Count and time-span inconsistencies

Current copy contains:

- runtime counts from Supabase on the home dashboard;
- a fixed `6,800+` practice claim on home;
- a fixed `6,400+` practice claim during onboarding;
- a fixed `22,000+` physician-career claim in both places;
- “2019 to present,” “from 2019 onwards,” “eight years,” and “updated periodically.”

As of 2026, “eight years” could refer to inclusive annual snapshots, elapsed time, or a different source range; the repository does not establish which. Runtime counts also do not include a dataset version/as-of date.

- **Owner confirmation required:** Establish a dated dataset manifest as the canonical source for counts, covered years, latest source release, processing date, and next expected refresh.

## Corrections and contestability

The methodology page says practice representatives can email a data inquiry, that the team aims to respond within five business days, and that confirmed data errors are corrected in the next update cycle. Practice detail provides an authenticated in-app report form for contact/display fields but not a dedicated score category. Admin tooling can mark reports `new`, `reviewing`, `fixed`, or `rejected`.

The repository does not show:

- evidence standards;
- score recalculation/republication;
- how upstream CMS errors differ from Atlas matching/processing errors;
- reporter notification or appeal;
- a correction SLA in the in-app form;
- version/history of a corrected score.

- **Owner confirmation required:** Define the canonical correction/appeal process, eligibility, evidence, target times, status meanings, notification, score regeneration, and audit history.

## Validation, provenance, and governance still required

Before this document can become an authoritative methodology, owners must supply:

- **Owner confirmation required:** Exact formulas, numeric weights, transformations, and versioned code location.
- **Owner confirmation required:** Source-release inventory and refresh cadence.
- **Owner confirmation required:** Physician/practice matching, deduplication, merger/acquisition, rename, and multi-location rules.
- **Owner confirmation required:** Specialty, enrollment, geography, training, retirement, minimum-sample, and other exclusions.
- **Owner confirmation required:** Backfill, late-arriving data, correction, and reproducibility procedures.
- **Owner confirmation required:** Validation evidence, benchmarks, sensitivity/fairness review, known limitations, and accountable scoring owner.
- **Owner confirmation required:** Score-version policy, effective dates, change communication, and historical-score retention.
- **Owner confirmation required:** Approved claims that may be public versus details retained as proprietary.

# Market report builder

## Purpose and boundary

`/admin/report-builder` creates a print-ready market intelligence report from operator-pasted Markdown tables and AI-generated narrative. It is an authoring aid, not an authoritative analytics pipeline. Every output requires human review.

The current flow is:

1. collect client/report metadata and two Markdown tables in the browser;
2. parse tables and calculate regional medians in the browser;
3. send a constructed prompt to `/api/generate-report`;
4. forward the prompt to Anthropic Messages API;
5. parse model JSON and allow editing;
6. generate escaped HTML, preview it in an iframe, and print/save as PDF.

## Access and current security caveat

The page is under the server-protected `/admin` layout and also checks `profiles.is_admin` in the browser. However, `/api/generate-report` itself currently validates only that a non-empty prompt was supplied; it does not independently authenticate the caller or verify admin status.

Until that route is fixed, deployment-layer restrictions and the obscurity of the route must not be treated as adequate authorization. Avoid exposing the endpoint publicly where possible, monitor unexpected usage, and prioritize server-side auth/admin checks.

**Owner confirmation required:** API authorization policy, approved model/vendor, rate limits, cost limits, and monitoring.

## Permitted data

The prompt includes client name, contact, market, specialty, radius, school names, complete regional rows, computed medians, and complete pipeline rows. This content leaves Atlas infrastructure and is processed by Anthropic.

Do not enter real client, candidate, trainee, contact, confidential, contract-restricted, regulated, or otherwise sensitive data until its use with the vendor is explicitly approved. Use synthetic or approved public data for testing.

Never paste credentials, tokens, medical records, private communications, or data not needed for the report.

**Owner confirmation required:** permitted client/candidate data, legal basis, vendor agreement, retention/training settings, confidentiality classification, deletion process, and distribution rules.

## Input format

The builder accepts pipe-delimited Markdown tables. The first pipe-containing line is treated as headers. A separator row made entirely of hyphens/colons is skipped. Missing cells become empty strings; extra cells are ignored.

Example with synthetic values:

```text
| Practice | City | Retention Score | Roster |
|---|---|---:|---:|
| Example Eye Group | Sampletown | 72 | 8 |
```

Numeric parsing removes non-numeric characters except period and minus, then uses `parseFloat`. Therefore:

- `"12%"` becomes `12`;
- `"$1,200"` becomes `1200`;
- `"12-14"` may be misinterpreted;
- units, ranges, suppressed values, and annotations require manual review.

Medians are calculated per regional column using every value that parses as a number. Even-sized sets average the two center values.

## Generation procedure

1. Confirm you are authorized to use the input data.
2. Enter client name, contact, market, specialty, radius, date, pipeline title, and schools.
3. Paste the regional table. At least one regional data row is required.
4. Paste the pipeline table if applicable.
5. Verify headers are unique and values align with columns.
6. Independently calculate or sample-check source counts and important figures.
7. Select **Generate with AI**.
8. If generation fails, preserve only the non-sensitive error text; do not log the prompt in a shared system.
9. Review and edit every generated field before producing the report.

The route currently requests model `claude-sonnet-4-6` with `max_tokens: 1000` and returns the vendor response. Treat the model identifier as implementation state, not approved policy.

## Output contract and review

The model is instructed to return JSON containing:

- a 2–3 sentence `summary`;
- exactly six `{value, label}` statistics;
- 3–5 bullet findings in one string;
- a 2–3 sentence `pipelineDescription`.

The parser strips optional JSON fences and takes at most six stats. It does not pad a short statistics array, so fewer than six model-provided entries remain fewer than six. Invalid JSON produces a generation error.

Human review must verify:

- every numeric claim against input/source data;
- client/contact spelling and confidentiality marking;
- that medians and row counts are correct;
- that findings do not invent causal explanations;
- that pipeline language does not identify or characterize people inappropriately;
- that the six statistics are meaningful and not duplicative;
- that blank or malformed model fields are corrected;
- that the methodology wording is authorized and accurate.

The generated methodology currently makes strong fixed claims about CMS-only sources, data since 2019, and retention interpretation. Those claims are embedded in code, not derived from the pasted tables. **Owner confirmation required** before external distribution.

## Quadrant logic

The builder guesses columns by case-insensitive header patterns:

- score: `retention`, then `score`, then `atlas`;
- roster: `roster`, then `physician`, then `size`, then `count`;
- name: `practice`, then `name`, then `organization`.

Rows with parseable score and roster values are classified relative to inclusive market medians:

- high score / large roster;
- high score / small roster;
- lower score / large roster;
- lower score / small roster.

Only eight practice names are displayed per quadrant, although the count reflects all classified rows. If headers match the wrong columns, the report can be materially wrong without an error. Verify detected semantics manually.

## HTML, preview, and print

Form fields, table cells, and AI strings are HTML-escaped before insertion. Findings are split by newline and escaped. The generated HTML is shown through `iframe srcDoc`; printing opens a new window, writes the HTML, and invokes the browser print dialog.

Before **Print / Save PDF**:

1. inspect every page in preview;
2. check long tables, clipping, blank pages, and page breaks;
3. confirm the confidentiality footer and recipient;
4. verify the PDF filename and local storage location;
5. distribute only through an approved channel.

The tool does not save a server-side draft, source snapshot, review approval, or final PDF. Refreshing can lose work.

**Owner confirmation required:** retention for prompts/reports, approved storage, reviewer role, naming/version convention, and distribution channel.

## Failure modes

- **No rows detected:** normalize Markdown pipes and include a header plus data row.
- **Wrong calculations:** inspect units, ranges, duplicate headers, and number formatting.
- **Vendor 4xx/5xx:** stop repeated retries, check configuration and vendor status, and escalate unexpected billing/auth errors.
- **Invalid JSON:** retry only with approved data, or write narrative manually from verified facts.
- **Blank stats:** fill manually with verified values or remove from the final design.
- **Popup blocked:** allow the print window for the application or print from preview using an approved workflow.
- **Suspected exposure:** stop distribution, preserve minimal evidence, and follow the credential/data incident runbook.

## Required approval before distribution

**Owner confirmation required:** named reviewer, factual-review standard, approved methodology copy, data-use policy, vendor/model approval, cost ceiling, retention, confidentiality handling, and client delivery authority.

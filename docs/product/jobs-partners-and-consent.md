# Jobs, partners, and consent

## Status

This document records the current implementation boundary among job listings, partner claims, direct contact information, and the `data_sharing` preference. It is not legal approval of the current behavior or copy. All commercial, consent, privacy, and lead-routing decisions without repository evidence are marked **Owner confirmation required**.

## Job-listing model and display

The user-facing jobs product reads rows from `employer_leads`. The UI can display:

- practice name and optional link to a `practices` row;
- point-of-contact name, email, and phone;
- primary location;
- practice setting;
- clinical/surgical mix;
- ideal hiring timeline;
- subspecialties of interest;
- free-text additional details;
- source and received timestamp (although `source` is read, it is not displayed).

The jobs directory searches practice name or location, infers a state from the final comma-separated location segment, filters by state and subspecialty, sorts by received date, and paginates at 20 records. A linked listing also appears on its practice detail page. Admin users can search practices and attach an unlinked lead to a practice.

### “Active” is not implemented

Home labels the total table count “Active Job Listings,” and practice detail labels linked rows “Active Job Opportunities.” The current queries do not filter an active flag, expiration date, withdrawn state, or age. Every readable row is counted/listed.

- **Owner confirmation required:** Define listing lifecycle states, effective/expiry dates, renewal, withdrawal, archival, and stale-listing review.
- **Owner confirmation required:** Define the authoritative listing source(s), ingestion path, deduplication, moderation, and source attribution shown to users.
- **Owner confirmation required:** Decide whether `received_at` is submission, ingestion, approval, or publication time.

## Job contact visibility and lead behavior

When present, contact name, email, and phone are rendered directly to authenticated users on `/jobs` and practice detail. Email and phone become `mailto:` and `tel:` links. The browser does not check the viewer’s `data_sharing` value before showing these details. Clicking a contact link does not create a lead record, notify an employer, or record an audit event in this repository.

This is separate from partner outreach consent: displaying employer contact data to a user does not itself share that user’s profile.

- **Owner confirmation required:** Define which users may see employer contact details and whether contacts have consented to publication.
- **Owner confirmation required:** Define whether Atlas brokers introductions, routes leads, tracks contact events, or only publishes information.
- **Owner confirmation required:** Define abuse prevention, scraping controls, correction/removal requests, and visibility of personal contact data.
- **Owner confirmation required:** Define any employer/listing commercial model and disclose sponsored or paid placement where applicable.

## Partner page and independence claims

The current partner page says strategic partners may fund data infrastructure, quality control, technology, and physician education and may introduce Atlas through education and professional networks. It says Atlas remains independently operated by MatchMed and that partners cannot:

- purchase rankings;
- alter scores;
- influence profiles or methodology;
- access private physician due-diligence activity.

It also says partner communication is optional and physicians control whether they connect. The displayed “Sample Partner” is expressly illustrative and says it is not a current commercial relationship.

Home repeats that partners never influence profiles, scores, methodology, or private physician activity.

These are strong governance and privacy claims. The repository shows UI copy and a Boolean preference, but it does not contain contracts, data-access controls specific to partners, commercial terms, or an auditable independence process.

- **Owner confirmation required:** Validate every independence and access claim against contracts, architecture, operational access, and actual commercial arrangements.
- **Owner confirmation required:** Define permitted partner categories, prohibited influence, sponsorship labeling, conflict review, and enforcement.
- **Owner confirmation required:** Define the current commercial model and reconcile “free for physicians,” “free for early-career ophthalmologists,” partner funding, and Terms language about subscriptions.

## Current consent implementation

### Collection

On onboarding step two, `data_sharing` defaults to false. A single optional checkbox says:

> I agree to be contactable by ophthalmology practices and industry partners. This is what keeps Atlas free for physicians. I can opt out at any time.

The same checkbox and text appear in Account settings. On onboarding, its Boolean value is written with the profile. In Account settings, the changed value is written when the user presses “Save changes.”

The code does not record:

- consent timestamp;
- copy/policy version;
- collection context;
- separate practice and industry-partner choices;
- partner identity, communication category, or channel;
- proof of prior values or withdrawal.

### Scope ambiguity

One Boolean combines outreach from ophthalmology practices and industry partners. Partner-page copy says physicians decide whether they want educational opportunities or direct communication “from any partner” and may “separately choose” wet-lab invitations, product education, or other communication. The current profile control does not provide that partner- or purpose-specific choice.

The Privacy Policy says opted-in information may be shared with industry partners and consent can be withdrawn by contacting the published support address. The Terms say industry-partner communications require a separate opt-in and withdrawal by contacting that address. The product also supports in-app unchecking. These channels and granularity are not reconciled.

- **Owner confirmation required:** Define whether `data_sharing` means permission to disclose profile data, permission to be contacted, an instruction to make introductions, or all three.
- **Owner confirmation required:** Determine whether practices and industry partners need separate consent and whether purpose, partner, data fields, and communication channels require granularity.
- **Owner confirmation required:** Approve consent copy and legal basis with legal/privacy owners.

## Withdrawal

Users can uncheck `data_sharing` in Account settings and save, or follow legal-page language to contact the support address. The repository does not show downstream propagation, suppression lists, recipient notification, deletion from partner systems, or consent history.

- **Owner confirmation required:** Define when withdrawal becomes effective, how it propagates, what happens to data already shared, and what confirmation the user receives.
- **Owner confirmation required:** Define accountable operations, evidence retention, and handling when a profile is soft-deleted.

## Data available for potential matching

Profiles can contain name, email, phone, NPI, training status, desired start year, preferred states, clinical interests, practice-setting preferences, current practice/program, and performed/desired procedures. The current user product does not show an automated matching or partner portal, and the repository does not establish which of these fields—if any—are disclosed to employers or partners.

- **Owner confirmation required:** Approve a field-level disclosure matrix by recipient, purpose, trigger, and legal basis.
- **Owner confirmation required:** Define whether inferred scores, Favorites/shortlists, practice views, searches, or other due-diligence activity are categorically prohibited from disclosure. Current public copy says partners cannot access private due-diligence activity, but technical enforcement is not documented here.

## Relationship among jobs, practices, and partners

The implementation contains an employer-lead directory and a separate informational partner concept. It does not prove whether an employer lead is a partner, whether partners may submit listings, or whether a user’s opt-in affects listing visibility. Current observed behavior is:

- all authenticated users query jobs, regardless of `data_sharing`;
- all authenticated users can see available employer contact details, subject to database authorization outside this repository inventory;
- `data_sharing` controls only a stored profile value in this code;
- no partner-facing access or lead-delivery workflow is represented.

- **Owner confirmation required:** Define employer, recruiter/staffing firm, sponsor, and industry-partner roles and keep those terms distinct.
- **Owner confirmation required:** Define lead submission, review, routing, matching, partner access, and audit requirements.

## Route visibility

`/jobs` and `/partners` are both protected by the current proxy. Jobs appears in primary desktop/mobile navigation. Partners is linked from the authenticated home page but is absent from the main and secondary navigation. The page is written like public sponsorship/independence disclosure, yet anonymous visitors are redirected to login.

- **Owner confirmation required:** Decide whether partner disclosures must be public and where a durable link must appear.

## Required controls before relying on consent

Before `data_sharing` can be treated as a governed outreach authorization, owners must provide:

- **Owner confirmation required:** Consent owner, legal basis, approved copy, version, effective date, and review cadence.
- **Owner confirmation required:** Immutable evidence requirements and withdrawal audit trail.
- **Owner confirmation required:** Recipient contracts, access restrictions, allowed purposes, onward-sharing restrictions, retention, and deletion.
- **Owner confirmation required:** User-facing disclosure of recipient categories and data fields.
- **Owner confirmation required:** Operational response and escalation for unwanted contact or misuse.
- **Owner confirmation required:** Rules for minors/ineligible users, deleted accounts, expired consent, and policy changes.

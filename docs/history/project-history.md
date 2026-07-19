# Project history

This timeline records major MatchMed Atlas milestones so future contributors can understand how the product and architecture evolved. Milestones before the current repository history are product-owner-provided context and may not be reconstructable from the current Git history.

## March 2023 — MERN prototype

The first MatchMed prototype was built using the MERN stack.

## April 2025 — Practice subscriptions

MatchMed introduced practice subscriptions.

## January 2026 — Atlas concept

The Atlas workforce-intelligence concept was established.

## June 2026 — Next.js rewrite

Atlas was rewritten as the current Next.js application.

## July 2026 — Practice correction system

Atlas added the authenticated practice-error reporting workflow and administrative correction inbox.

## July 2026 — Security remediation

Atlas completed a Supabase credential migration:

- application clients moved from the legacy anonymous key to the new publishable key;
- the exposed legacy `anon`/`service_role` API keys were disabled;
- retired Airtable migration scripts were removed and their Airtable token was revoked.

The historical credentials may remain visible in earlier Git commits, but they are no longer active.

## Maintaining this timeline

Add entries for changes that materially alter the product, architecture, data pipeline, security model, or operating model. Prefer a short explanation of why the milestone mattered over a list of individual commits.

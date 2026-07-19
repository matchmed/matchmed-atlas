# ADR 0002: IndexedDB bulk caching

- Status: Needs confirmation
- Date observed: 2026-07-19
- Decision owners: **Owner confirmation required**

## Context

Atlas downloads practice and physician result sets in browser-side paginated Supabase queries and caches bulk records in memory and IndexedDB. The shared cache supports single-record and chunked persistence. It chunks sets larger than 1,500 records into groups of 800. Practice list data uses a one-hour TTL; physician cache usage and keys are defined by its consumer. Favorites use a separate in-memory cache with a 30-minute TTL.

A fresh practice detail patches that practice in an existing practice-list cache and loaded favorites. Other records and other devices remain unchanged until refresh or expiry.

## Candidate decision

Use IndexedDB as a best-effort performance cache for large, non-authoritative discovery datasets. The database remains authoritative; cache misses, corruption, quota errors, and expiration must fall back to Supabase.

The original performance evidence and rationale are **Owner confirmation required**.

## Constraints

- Do not treat cached data as current for security, consent, account state, or admin authorization.
- Assign explicit TTLs and versioned cache keys for each dataset.
- Change keys when record shape or interpretation changes.
- Handle IndexedDB absence/failure without blocking core functionality.
- Avoid adding sensitive profile, contact, or report payloads without privacy review.
- Provide an invalidation strategy for logout, user changes, major corrections, and schema changes.
- Document client-side retention and clearing behavior.

## Consequences

Expected benefits are faster repeat searches and reduced bulk queries. Costs include storage use, stale displays, complex chunk integrity, browser-specific quota behavior, and extra reconciliation after corrections. Current save failures warn in the console and return false; the in-memory copy may still contain data for the page lifetime.

The one-hour practice TTL means published corrections may not appear immediately on every client. Operators must validate in a clean or refreshed context before declaring systemic publication complete.

## Alternatives

- Fetch every view from Supabase.
- Server-side or edge caching.
- Smaller query/result windows with no full-dataset cache.
- A service worker/cache API.

Comparative measurements and rejected-alternative rationale are **Owner confirmation required**.

## Validation before acceptance

Measure query volume, load time, IndexedDB size, failure rate, and staleness impact on supported browsers. Classify cached fields for privacy, define logout/clear behavior, and add tests for missing chunks, expired entries, quota failure, and schema/key changes.

## Supersession criteria

Revisit if data volume exceeds practical browser storage, freshness requirements tighten, data becomes user-sensitive, server caching becomes available, or observed performance does not justify complexity.

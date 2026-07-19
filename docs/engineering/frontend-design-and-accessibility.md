# Frontend design and accessibility

This guide documents patterns visible in the current Atlas frontend and identifies gaps that should guide future work. It is not a complete brand standard or an accessibility conformance claim.

## Verified design foundation

### Typography

`src/app/layout.tsx` loads:

- Inter as `--font-sans` for body and interface text;
- Cormorant Garamond, weight 600 with normal and italic styles, as `--font-display`.

`tailwind.config.ts` maps these to `font-sans` and `font-serif` with system/Georgia fallbacks. The root document language is English.

### Core palette

Shared tokens in `tailwind.config.ts` are:

- canvas `#F7F6F2`;
- ink `#141210`;
- mid `#8A8680`;
- teal `#1C4A45`;
- dark teal `#153835`;
- light teal `#E8F0EF`.

`src/app/globals.css` repeats these values for body, navigation, cards, and Mapbox popups. Many components also use inline color values. New work should reuse shared tokens and existing classes where possible instead of introducing another near-duplicate value. Consolidating inline styles is desirable when it is within the change's scope, but broad visual refactors require regression review.

### Scoring colors

Global classes `.s-dg`, `.s-lg`, `.s-yw`, `.s-or`, `.s-rd`, and `.s-na` provide score bands, and `.score-pill` supplies shared sizing. Existing CSS says these colors should not change. That comment establishes current implementation intent, not approved brand or accessibility governance.

Always pair a score color with visible text/value and a programmatic label. Never require users to distinguish green, yellow, orange, and red alone. Any palette change must remain consistent across list, detail, map, reports, legends, and public methodology copy.

## Layout and responsive behavior

The main app content is centered at a maximum width of 1200px with 20px side padding. Desktop navigation is a sticky 56px top bar. At 768px and below:

- desktop nav links are hidden;
- four primary destinations move to a fixed bottom navigation;
- secondary links move into the account menu;
- content reserves bottom safe-area space;
- auth hero panels are hidden;
- practice and physician tables switch to cards;
- practice filters use a bottom sheet.

Additional breakpoints include 400px for compact auth/account actions, 640px for dashboard cards, and 1200px for a four-column dashboard. Treat these as observed behavior, not a complete device support matrix.

When adding a page:

- use the existing navigation/content frame unless the route intentionally uses the auth layout;
- verify fixed navigation does not cover content or controls;
- use `env(safe-area-inset-bottom)` for bottom-fixed mobile surfaces;
- avoid fixed pixel widths for content;
- allow long names, emails, and locations to wrap or truncate with an accessible full-value path;
- ensure horizontal tables expose scroll without hiding important actions.

## Navigation and interaction conventions

Primary signed-in destinations are Practices, Physicians, Favorites, and Jobs. Secondary links include Scoring Methodology, Terms, and Privacy. The account menu provides settings and sign out. Active links receive teal text and a light-teal background.

Use a `Link` for navigation and a `button` for an action. Do not attach the only click behavior to an un-focusable `div` or `span`. Custom controls must support Enter/Space as appropriate, have an accessible name and state, and participate in logical focus order.

Search/filter state is synchronized into URLs by `src/lib/use-list-search.ts` and `src/lib/list-url.ts`. Preserve shareable, refresh-safe list state. Debounced inputs should remain responsive and should not overwrite browser back/forward navigation.

## Forms

- Every input needs a persistent, programmatically associated label (`htmlFor`/`id` or an equivalent association).
- Use native `input`, `select`, `textarea`, checkbox, and radio controls before building custom widgets.
- Provide `autoComplete`, input type, and input mode where meaningful.
- Put required and format instructions before submission.
- Associate field errors using `aria-describedby`; move focus to the first invalid field or an error summary for failed submissions.
- Announce asynchronous save/error/success state through an appropriate live region.
- Disabled controls must remain understandable and should not be the only place an explanation appears.
- Preserve entered values after recoverable errors.

Current account multi-selects use clickable `div` and `span` elements without keyboard semantics. Do not copy this implementation as a component pattern; replace or improve it when working in that area.

## Dialogs, dropdowns, and sheets

The practice error report uses `role="dialog"`, `aria-modal`, a title association, a labeled close button, backdrop close, and Escape handling. It does not explicitly set initial focus, contain focus, mark background content inert, or restore focus to the trigger.

A complete modal must:

1. move focus to the heading, first field, or safest action on open;
2. keep Tab/Shift+Tab inside while open;
3. close on Escape unless the action is destructive/in progress and closure is intentionally blocked;
4. restore focus to the opener;
5. prevent background interaction and scrolling;
6. expose a clear accessible name and optional description.

Menus and mobile filter sheets need equivalent keyboard and focus management. Clicking outside may supplement, but cannot replace, a close button and keyboard behavior.

## Tables, cards, and maps

Use semantic table markup for tabular relationships, with scoped headers and an accessible name/caption where context is not obvious. Sorting controls must be buttons and expose sort direction. Horizontal scrolling must work at zoom and on touch devices.

Mobile cards should preserve every decision-critical field or provide a clear details route. A card with navigation behavior should contain a descriptive link or be implemented with valid interactive semantics; avoid nested competing click targets.

Mapbox is a visual enhancement, not a sole data access path. Keep list/table alternatives for practices. Map markers, clusters, popups, and controls need accessible names and keyboard reach where supported. Do not encode score or selection only through marker color. Test missing coordinates and Mapbox failure without blocking non-map research.

## Loading, empty, error, and stale states

Every data surface should distinguish:

- initial loading;
- no matching data;
- permissions/session failure;
- recoverable request failure;
- success;
- stale cached data where material.

Atlas has a global animated loading-bar style. Animation should respect `prefers-reduced-motion`; add a non-animated alternative before expanding its use. Loading text and status should be exposed to assistive technology without repeatedly interrupting the user.

Practice lists may be cached in IndexedDB for one hour, and favorites in memory for 30 minutes. UI copy should not imply live data when showing a cache. Detail refreshes can patch list/favorite records; test that visual states update consistently.

## Baseline accessibility expectations

For changed interfaces, verify:

- one clear page-level heading and logical heading hierarchy;
- landmarks and descriptive page titles;
- keyboard access with visible focus;
- no keyboard trap;
- meaningful link/button names;
- labeled form controls and announced errors;
- text resizing and zoom to 200%;
- responsive reflow without two-dimensional scrolling except genuine tables/maps;
- sufficient text, icon, border, focus, and state contrast;
- status meaning independent of color;
- alt text for informative images and empty alt text for decorative images;
- reduced-motion behavior;
- dialog/menu focus lifecycle;
- touch targets with adequate size and separation.

Automated tools can detect only part of this list. Use keyboard and assistive-technology checks from `testing-and-quality.md`.

## Content and data presentation

Use plain, specific language. Distinguish measured data, derived metrics, estimates, and marketing claims. Preserve units, time periods, missing-value labels, and source context. Do not silently convert null to zero. Scoring explanations and partner/legal claims require accountable review; code presence alone does not validate them.

Correction-report confirmation says reports are reviewed, but no review service level is represented in the repository. Avoid adding response-time promises without owner approval.

## Implementation checklist

Before review:

- reuse established tokens and responsive layout;
- verify semantic elements before ARIA;
- test desktop and narrow viewport behavior;
- complete keyboard and focus checks;
- inspect loading, empty, error, and long-content cases;
- test score/status meaning without color;
- check URL and cache interactions;
- run `npm run build` and `npm run lint`;
- describe known accessibility limitations in the PR.

## Owner confirmation required

- Canonical brand owner, design source, and token-change approval
- Target WCAG version/conformance level and legal obligations
- Supported browsers, devices, screen readers, and input methods
- Approved scoring palette and documented contrast exceptions, if any
- Localization, language, date/number formatting, and right-to-left requirements
- Accessibility review cadence, audit owner, defect severity, and release gates
- Whether Mapbox interactions require full keyboard equivalence beyond the list alternative
- Ownership and migration plan for repeated inline styles and custom controls

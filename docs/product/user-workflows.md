# User workflows

## How to read this document

This is an end-to-end description of the workflows implemented in the current UI. It records observed validations, redirects, mutations, and failure states; it does not convert them into intended policy. Every unresolved policy choice is marked **Owner confirmation required**.

## 1. Create an account

### Email and password

1. The user opens `/signup`.
2. The form collects email, password, and password confirmation.
3. The browser requires an email value. Application validation requires matching passwords and at least eight characters.
4. The page calls Supabase Auth signup and sets the callback URL to `/auth/callback`.
5. On an API error, the Supabase message is displayed. On success, the page asks the user to check email.
6. The callback exchanges the authorization code for a session. It looks up `profiles.onboarding_complete`; a missing or incomplete profile goes to `/onboarding`, otherwise to `/`.

The signup page says signing up constitutes agreement to Terms and Privacy. Onboarding later requires a separate checkbox for the same documents.

- **Owner confirmation required:** Decide when legal acceptance occurs, what version/effective date must be recorded, and whether signup copy or onboarding checkbox is canonical.
- **Owner confirmation required:** Define password requirements beyond the current eight-character minimum and any email-domain or invitation restrictions.

### Google

1. From signup or login, the user selects “Continue with Google.”
2. Supabase OAuth starts with Google and requests account selection.
3. Google redirects to `/auth/callback`.
4. The callback applies the same profile/onboarding redirect described above.

OAuth initiation errors are not shown in a dedicated UI state.

### Route enforcement

Unauthenticated requests to non-public routes are redirected to `/login`. The public allowlist is login, signup, forgot password, Terms, Privacy, and `/auth/*`. A signed-in profile with `deleted_at` is signed out and redirected to login. The home client independently checks the session and onboarding status, redirecting to login or onboarding as needed.

## 2. Complete onboarding

Onboarding has two visual steps.

### Step one: profile

The screen presents these fields as required:

- first and last name;
- ten-digit NPI;
- phone;
- preferred states;
- anticipated start year;
- clinical areas of focus;
- training status (Resident, Fellow, or Attending);
- practice-setting preferences;
- current training program or practice;
- procedures performed and procedures desired.

However, “Next” is disabled only until first name, last name, NPI, and training status are non-empty. There is no NPI length/numeric validation, no server-visible NPI verification in this workflow, and no enforcement for the other asterisked fields. Phone formatting accepts at most eleven digits and formats incrementally, but completion is not validated.

- **Owner confirmation required:** Define the actual mandatory fields and validation rules, including NPI verification, phone validity, and allowed empty multi-selects.
- **Owner confirmation required:** Confirm whether the fixed anticipated-start-year options should roll forward automatically.

### Step two: agreements

The first checkbox accepts Terms and Privacy and is enforced on submit. The second, `data_sharing`, is optional and says the user agrees to be contactable by ophthalmology practices and industry partners and can opt out at any time.

Submission upserts a profile keyed by `user_id`, including email, all form values, `onboarding_complete: true`, and `signup_date`. If the upsert errors, the UI attempts an update by email but does not inspect or display that second result. The screen then shows success and routes home after 2.5 seconds, even if both persistence operations failed.

- **Owner confirmation required:** Define expected failure behavior and whether onboarding may complete without a confirmed write.
- **Owner confirmation required:** Define the consent record required for `data_sharing` (timestamp, copy version, source, withdrawal history) and whether practices and industry partners require separate choices.

## 3. Sign in, recover access, and sign out

### Sign in

Email/password login calls Supabase `signInWithPassword`; errors display inline. Success routes to `/`. Google uses the OAuth flow above. The login page also supports legacy URL-fragment tokens, waits briefly for a session, then routes home.

### Password recovery

1. `/forgot-password` accepts an email address and asks Supabase to send a reset link.
2. Success always produces a “check your email” screen; API errors display inline.
3. `/auth/callback` supports PKCE codes and hashed recovery tokens and routes a valid recovery session to `/auth/set-password`.
4. The set-password page also handles a code, token hash, or legacy access-token fragment directly.
5. The new password must be at least eight characters and match confirmation.
6. After update, users with incomplete profiles go to onboarding; others go home. Invalid or expired links direct users to request another.

- **Owner confirmation required:** Select the supported canonical recovery flow and deprecation plan for compatibility paths.

### Sign out

The account menu calls Supabase signout and routes to `/login`.

## 4. Research practices

1. The user opens `/practices`.
2. The client first checks an IndexedDB/in-memory cache. If absent or stale, it reads all practice rows in batches of 1,000 and caches them.
3. Search matches practice name or `city_st`; state filters allow multiple values.
4. Sorting supports name, location, retention score, score change versus 2019, and latest roster size.
5. Results are paginated at 50 rows. Search, state, and page are represented in URL parameters; sort and view are local state.
6. The user can choose a table/card presentation or map. Missing Mapbox configuration leaves the map container without a dedicated error message.
7. Opening a result routes to `/practices/[id]`. Map position and zoom are temporarily stored in session storage and restored when returning.

The detail screen concurrently loads the practice, affiliations, and linked employer leads. It then loads the current profile and favorite state. Missing practice data shows “Practice not found”; query errors otherwise have little dedicated feedback.

From the detail screen, the user can:

- inspect contact data and displayed metrics;
- review current/former rosters and open physician histories;
- open contact links for linked jobs;
- save/remove the practice;
- submit a correction report.

## 5. Research physicians

1. `/physicians` loads and browser-caches all doctors in batches of 1,000.
2. Search matches physician name or NPI.
3. Results are name-ordered and paginated at 50.
4. `/physicians/[id]` shows public professional identifiers and current/previous affiliations.
5. Practice links return the user to practice detail.

There is no physician-record correction action in the current UI.

- **Owner confirmation required:** Define the correction and privacy-request path for physician records and whether physicians may claim or verify a record.

## 6. Save and remove practices

The persistence entity is `shortlists`, keyed by profile and practice. Current user terminology is mixed:

- navigation, home, detail actions, and `/favorites` use “Favorites,” “Saved,” and “Add to Favorites”;
- practice list/map accessibility labels say “shortlist”;
- code and database use `shortlists`.

From practice list/map or detail, saving inserts a shortlist row; removing deletes it. A client cache for the Favorites page is invalidated or updated. The Favorites screen orders records newest first, displays practice name/location/roster/score, routes to detail on card click, and supports removal. A user without a session is routed to login; a missing profile yields an empty page after loading.

- **Owner confirmation required:** Choose the canonical “Favorites” or “Shortlist” terminology.
- **Owner confirmation required:** Define duplicate prevention and expected error/rollback behavior; current optimistic list/map updates do not visibly handle write failures.

## 7. Find jobs

`/jobs` reads all `employer_leads`, newest first. Users can search practice/location, filter by state parsed from the final comma-separated location segment, filter by subspecialty, sort newest/oldest, and paginate by 20.

Each card may expose practice name, location, age of `received_at`, subspecialties, setting, clinical/surgical mix, hiring timeline, details, and direct contact name/email/phone. If `practice_id` exists, the card opens the practice. The same linked lead appears on practice detail.

No UI check limits results by status or expiration, and contact details are displayed to every authenticated user who can query the row.

- **Owner confirmation required:** Define listing freshness/expiry, source attribution, moderation, visibility, and contact-detail authorization.
- **Owner confirmation required:** Define whether clicking/contacting a listing creates a lead, notification, or audit event; current code does none.

## 8. Report a practice-data issue

1. On a practice detail screen, the user selects “Report an issue with this data.”
2. The user chooses practice name, address/location, phone, website, or other.
3. A non-empty description of at most 1,000 characters is required.
4. The app resolves the authenticated user’s profile and inserts a report with the practice ID, profile ID, field, description, and a snapshot of practice name, location, phone, and website.
5. Missing session/profile or insertion failure displays a retry-oriented message.
6. Success says the report was sent for review. There is no reporter-facing tracking screen or notification in this repository.

The separate methodology page instead tells practice representatives to email a support address and advertises a five-business-day response target and correction in the next update cycle.

- **Owner confirmation required:** Reconcile the form and email channels, response target, proof requirements, status visibility, notification, escalation, and publication cadence.

## 9. Manage account and consent

`/account` loads the signed-in user and profile. Users can edit identity/contact values, NPI, training status, current practice, start year, preferred states, clinical areas, and procedure preferences. Account editing omits the onboarding `practice_setting_preference` field, so it cannot currently be revised there.

“Save changes” updates the profile and shows success without checking the update result. Email/password users can change a password after reauthentication; Google-only users are directed to Google.

The “Introductions & Opportunities” checkbox updates `data_sharing` only when the user saves the full form. Unchecking is the only in-product withdrawal mechanism shown.

- **Owner confirmation required:** Confirm whether consent withdrawal must take effect immediately, whether past recipients must be notified, and how withdrawal evidence is retained.
- **Owner confirmation required:** Decide whether practice-setting preferences should be editable after onboarding.

## 10. Close an account

The account page warns that the profile will be removed and can be restored by contacting the company within 30 days. Confirmation updates `deleted_at`, signs out, and routes to login. The proxy blocks later signed-in access for deleted profiles. The auth identity and related profile, favorites, reports, and other data are not shown as deleted by this action.

The Privacy Policy separately says verified deletion requests will be actioned within 45 days, subject to legal retention. The implementation does not expose restoration or final purge.

- **Owner confirmation required:** Define what “removed,” “restored,” and “deleted” mean; the retention schedule; dependent-record handling; identity deletion; support verification; and the authoritative 30/45-day timeline.

## Cross-workflow support gaps

- Most Supabase reads and writes do not expose actionable errors or retry states.
- Browser caches can show data for up to their configured TTL; no user-facing refresh control or data-as-of time is shown.
- **Owner confirmation required:** Define support escalation, acceptable stale-data behavior, account restoration, and service expectations for failed auth links, profile writes, favorites, jobs, and corrections.

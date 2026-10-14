# 4flow India 8-Ball Championship 2026 — Statistics Dashboard

A public scoreboard for the tournament: standings, group tables, match results, team details and a
transparent points breakdown. Administrators publish results by uploading the tournament file
(.xlsx, .xls or .csv); the dashboard updates for everyone within a minute.

Stack: React 19 · Vite 8 · TypeScript 6 · Tailwind CSS 4 · Material UI 9 · SheetJS · Supabase
(Auth, Postgres, Storage, Edge Functions) · Vercel.

## How it works

```
Public viewer ──▶ Vercel (static React app) ──▶ Supabase Postgres: published dataset (read-only RPC)
Admin         ──▶ /login (email code) ──▶ /admin upload ──▶ Edge Function "upload-dataset"
                                                            ├─ verifies session + role in the DB
                                                            ├─ validates the file (same parser as the dashboard)
                                                            ├─ stores the original in a private bucket
                                                            └─ publishes atomically (publish_dataset)
Superadmin    ──▶ /admin/users: add / edit / remove admins (superadmin-only DB functions)
```

Points rule: for every completed match the winner receives points equal to the balls lost by the
losing team. Standings are always calculated by the app from the published match data
(`src/utils/pointsCalculator.ts`, `src/utils/leaderboard.ts`); nothing derived is stored.

### Roles

| Role | Sign-in | Can |
| --- | --- | --- |
| Public viewer | none | View everything on the dashboard, including "Last updated" |
| Admin | email code | Upload and publish files, see upload status/history |
| Superadmin | email code | Everything an admin can, plus manage admins and see who uploaded what |

Roles live in the `admin_users` table and are bound to a **verified Supabase user id**, never to an
email string alone. Every privileged operation is authorized on the server (Postgres functions or
the Edge Function); the UI route guards are only a convenience.

### Import strategy: validated full replacement

The tournament file is the complete "Group match register" (every match of the group stage,
including rows still *To play*), not a list of incremental changes. Each upload is therefore treated
as a full snapshot: it is validated as a whole and, if valid, replaces the published dataset in one
transaction (`publish_dataset`). Invalid or failed uploads never touch the live dataset. Earlier
datasets are kept, so any previously published upload can be made active again (see
[Rolling back](#rolling-back-to-a-previous-dataset)).

Validation rejects a file when: no match sheet / team or match data is found; a Match ID is missing
or duplicated with a different result; a result does not identify a winner or contradicts the Winner
ID; a team reference is unknown or ambiguous; balls lost is missing or not a whole number; a status
is unrecognised. Missing member names only produce a warning.

## Running locally

Requires Node.js ≥ 22.18 (tested on Node 25).

```bash
npm install
cp .env.example .env     # add your Supabase URL + publishable key (see Deployment)
npm run dev              # http://localhost:5173
```

Without Supabase settings the dashboard runs in **offline mode** from local files
(`VITE_DATA_SOURCE=static`, `VITE_WORKBOOK_URL` under `public/`, .xlsx or .csv, comma-separated
for several files) and all admin features are hidden. `.env.local` is git-ignored and overrides `.env`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dashboard dev server (also starts the optional SharePoint backend) |
| `npm run lint` | ESLint |
| `npm run build` | Syncs shared code, type-checks and builds to `dist/` |
| `npm run sync:shared` | Copies the parser/validation code into `supabase/functions/_shared/tournament` |
| `npm run functions:deploy` | Sync shared code and deploy the Edge Function |

## Deployment

### 1. Supabase project

1. Create a project at <https://supabase.com/dashboard>. Note the **Project URL** and the
   **publishable (anon) key** from *Project settings → API keys*.
2. Apply the migration (creates tables, functions, RLS and the private bucket). Either
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   or paste `supabase/migrations/20261013120000_admin_uploads.sql` into the SQL editor and run it.
   The migration is additive (new objects only) and safe to run on an empty project.
3. **Authentication → Providers → Email**: enable the provider and keep *Allow new users to sign up*
   on (an account alone grants nothing; roles come from `admin_users`).
4. **Email template (optional)**: by default Supabase emails a sign-in **link**, which the login page
   accepts. To also email a one-time **code**, the Magic Link template must contain `{{ .Token }}`
   (`supabase/templates/magic_link.html`) — Supabase only allows custom templates with a custom SMTP
   provider or a paid plan; then uncomment the template block in `supabase/config.toml` and run
   `npx supabase config push`.
5. **Authentication → URL Configuration**: set *Site URL* to the Vercel URL and add
   `https://<your-app>.vercel.app/login` and `http://localhost:5173/login` to *Redirect URLs*.
6. **Authentication → Rate Limits / SMTP**: Supabase's built-in email sender allows only a few
   emails per hour. For real use configure *custom SMTP* (Project settings → Authentication) with
   a company mailbox.
7. Deploy the Edge Function and its settings:
   ```bash
   npm run functions:deploy                      # = supabase functions deploy upload-dataset
   cp supabase/functions/.env.example supabase/functions/.env   # edit ALLOWED_ORIGINS
   npx supabase secrets set --env-file supabase/functions/.env
   ```
   `supabase/config.toml` sets `verify_jwt = false` for this function because it verifies the user's
   token itself and re-checks the role in the database on every request.

### 2. Initial superadmin (one-time bootstrap)

The superadmin is created by a server-side SQL function, never by a frontend condition or a client
environment variable, and only for an **existing, email-verified** Supabase user:

1. Deploy the app (or run it locally against the project) and have the future superadmin sign in
   once at `/login` with their email. They will see "not an authorized administrator" — expected.
2. In the Supabase **SQL editor** run:
   ```sql
   select public.bootstrap_superadmin('name@4flow.com');
   ```
   This binds the role to that user's verified id. It refuses if a superadmin already exists
   (`p_allow_additional => true` adds another) and is not callable through the API.
3. Reload the dashboard: the header shows the admin icon; `/admin/users` is now available.

Superadmin records cannot be edited or removed from the UI, and a database trigger rejects any
change that would remove or demote the last active superadmin — even direct SQL.

### 3. Hosting (Netlify or Vercel)

The app is a static build, so either host works; `netlify.toml` and `vercel.json` both configure the
SPA fallback and security headers.

**Netlify:** *Add new site → Import an existing project* → pick the GitHub repository. Build command
`npm run build`, publish directory `dist` (read from `netlify.toml`). Add the environment variables
below under *Site configuration → Environment variables*, then deploy.

**Vercel:** import the repository (framework preset **Vite**), add the environment variables, deploy.

Afterwards add the site URL to Supabase *Redirect URLs* (step 5 above) and to `ALLOWED_ORIGINS` of
the Edge Function.

### Environment variables

Frontend — **public**, embedded in the bundle (set in Vercel; template in `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key (safe: RLS protects every table) |
| `VITE_DISPLAY_TIMEZONE` | IANA zone for all timestamps, e.g. `Asia/Kolkata` (stored in UTC) |
| `VITE_REFRESH_INTERVAL_MS` | Dashboard polling interval (default 60000) |
| `VITE_MAX_UPLOAD_MB` | Size limit shown in the admin UI (server enforces its own) |
| `VITE_DATA_SOURCE` | `supabase` (default when configured), `api`, or `static` |

Server-side — **secret**, never in `VITE_*` or in the repo:

| Where | Variable | Purpose |
| --- | --- | --- |
| Edge Function (automatic) | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | Injected by Supabase; used only inside the function |
| Edge Function secrets | `MAX_UPLOAD_BYTES`, `ALLOWED_ORIGINS` | Upload limit, allowed browser origins |
| `server/.env` (optional) | `AZURE_*`, `SHAREPOINT_FILE_URL` | Only for the optional SharePoint backend |

## Administration

### Managing administrators (superadmin)

`/admin/users` lists authorized emails with role, account status, last sign-in, who added/changed
them and when. Actions:

- **Add admin** — adds the email. No account is created and no invitation is sent: tell the person
  to sign in at `/login`; access is linked to them when they verify that address.
- **Edit email** — if the admin has never signed in, the email is simply corrected. If they have,
  the new address is stored as *pending* and takes effect only when its owner signs in with it;
  until then the current identity keeps access, afterwards it loses it. A pending change can be
  cancelled.
- **Remove** — asks for confirmation and revokes access immediately, including for sessions that
  are still signed in (every upload and admin call re-checks the role in the database).

Duplicates and invalid addresses are rejected by the database. All changes are written to
`audit_events`.

### Uploading results (admin / superadmin)

`/admin` shows what is live, the last successful upload and the latest upload status. Workflow:

1. Choose the file(s) for the stage that changed. **The file name decides what is replaced**; the
   rest of the live dataset is kept (`src/services/partialUpdate.ts`):

   | File name contains | Replaces |
   | --- | --- |
   | `group` | teams and group-stage results |
   | `qf` or `quarter` | quarter-final rows |
   | `sf` or `semi` | semi-final rows |
   | `final` | the Final, plus any other knockout rounds in the file (so a full "(Finals)" export updates the whole bracket) |
   | no keyword / full `.xlsx` workbook | everything (full replacement — select the group file and the finals file together) |

   Up to `VITE_MAX_UPLOAD_MB` in total. A knockout-only file is refused until group results have
   been published once. Without a finals sheet the knockout tabs stay empty.
2. The server checks extension, size and real content, parses the file and validates it. A preview
   shows summary chips, all errors/warnings and the parsed matches and teams. Nothing is stored yet.
3. **Publish results** (enabled only when validation passed) → confirmation dialog → the Edge
   Function records the upload, stores the original file in the private `tournament-uploads`
   bucket and publishes the dataset in one transaction. The public dashboard shows it on its next
   check (≤ 60 s) with **Last updated** = publication time (UTC, displayed in `VITE_DISPLAY_TIMEZONE`).
4. The history table lists every upload with status (Published / Rejected / Failed), counts, a
   *Live* marker and validation errors; the superadmin also sees the uploader.

Rejected and failed uploads are recorded but never become active; the previous dataset stays live.

Two actions are available per history row:

- **Make live** (published uploads only) switches the public dashboard to that upload's dataset;
  "Last updated" then shows its original publication time. Use it to roll back a bad upload.
- **Delete** removes the record, its parsed dataset and the original file from the private bucket.
  The live dataset cannot be deleted (make another one live first); admins may delete only their
  own uploads, the superadmin any. Deletions are written to `audit_events`.

### Rolling back to a previous dataset

Use **Make live** on the upload page, or, from the Supabase SQL editor:

```sql
-- make the upload published immediately before the current one active again
select public.rollback_to_previous_dataset();

-- or pick any published upload explicitly
select id, file_name, completed_at from public.uploads where status = 'published' order by completed_at desc;
select public.activate_upload('<upload id>');
```

Both are owner-only (not callable through the API), keep all data and write an audit event.
"Last updated" then shows that upload's original publication time.

### Audit trail

`audit_events` records superadmin bootstrap, admin additions/changes/removals, email-change
verification, uploads that were rejected or failed, and every dataset publication/activation, with
actor id and email. It is readable only from the SQL editor / service role.

## Security model

- Every table has RLS enabled and **no policies** for `anon`/`authenticated`, and their table
  privileges are revoked: direct REST access to `admin_users`, `uploads`, `datasets`,
  `active_dataset`, `audit_events` is impossible. Only `SECURITY DEFINER` functions are exposed, and
  `EXECUTE` is granted per function and role.
- Public functions: `get_published_version`, `get_published_dataset` (read-only).
- Signed-in users: `get_my_access` (own role only), `get_upload_history` (admins).
- Superadmin: `admin_list`, `admin_add`, `admin_update_email`, `admin_cancel_email_change`,
  `admin_remove` — each starts with `require_superadmin()`.
- Service role only (Edge Function): `resolve_admin`, `publish_dataset`, `audit`.
- Owner only (SQL editor): `bootstrap_superadmin`, `activate_upload`, `rollback_to_previous_dataset`.
- The storage bucket is private with no object policies, so only the service role can read or
  write files.
- Users cannot assign or change roles: `admin_users` is not writable through the API at all.
- Uploads are limited in size and type (extension **and** content signature), parsed by SheetJS
  from bytes (no formulas evaluated, no file system access) and validated before anything is stored.

## Checking the three roles

After deployment:

1. **Public** — open the site in a private window: standings load without sign-in; the header
   shows "Last updated"; `/admin` and `/admin/users` redirect to `/login`.
2. **Stranger** — sign in at `/login` with an email that is not registered: "not an authorized
   administrator"; `/admin` shows *No access*.
3. **Admin** — as superadmin add the email on `/admin/users`; the person signs in → `/admin` works,
   `/admin/users` shows *No access*. Remove them → their next upload is refused (HTTP 403) and the
   admin screens show *No access* after a focus/refresh.
4. **Superadmin** — `/admin/users` works; the history shows uploader emails; the protected row
   cannot be removed.

## Workbook → application mapping

**Confirmed layout** (sheet "Group match register", exported as CSV on 13 Oct 2026):

| Column | Used as |
| --- | --- |
| Match ID | Match id (e.g. `G01`) — required for uploads, enables duplicate detection |
| Group | Group (A, B, C) — group tables |
| A ID / B ID | Team numbers |
| Team A / Team B | First line = team name ("Team 1", hidden as it repeats the number), next lines = members split on `/` |
| Result A–B | `1-0` = A won, `0-1` = B won |
| Winner ID | Winner — must agree with Result A–B |
| Loser balls | Balls lost by the losing team → points to the winner (0 is valid) |
| Match status | `Complete` counts; `To play` is shown under Upcoming Matches |
| Ball diff A, Organizer notes | Ignored |

**Finals sheet** ("Finals bracket"): the table below the drawn bracket, with columns `Match`
(`QF1`…`QF4`, `SF1`, `SF2`, `Final`), `Team A` / `A ID`, `Team B` / `B ID`, `Racks A`, `Racks B`,
`Status`, `Winner ID` and `Target` (racks needed to win), plus an optional `Loser balls` column.
Rows are shown on the dashboard under *Standings → Quarter finals / Semi finals / Finals*; a winner
is taken from `Winner ID` or, when that is empty, from the side that reached the target. When
`Loser balls` is filled in, the winner receives that many points on top of their group-stage points
in the overall leaderboard (group tables stay group-only). Empty later-round slots are filled from
earlier winners by bracket order (SF1 = QF1 vs QF2, SF2 = QF3 vs QF4, Final = SF1 vs SF2).

Title rows above the table and instruction rows below it are skipped. The parser
(`src/services/excelParser.ts`) finds tables by header names, normalised (lower-case, `#` → `no`,
punctuation removed); all accepted names are in `src/services/workbookMapping.ts`. Other layouts
(separate team sheet with `Player 1..n` or `Members` columns, per-team balls-lost columns) are
supported as well.

**Ranking:** points ↓, then matches won ↓, then balls lost ↑, then team number. The workbook does
not define a tie-break, so this is a documented fallback (`compareOfficial` in
`src/utils/leaderboard.ts`). Every team appears, including teams with zero points.

## Optional: SharePoint backend

`server/index.ts` can serve the live SharePoint workbook through Microsoft Graph instead of the
published dataset (`VITE_DATA_SOURCE=api`). It needs an Entra ID app registration with read access
to the site (`Sites.Selected` or `Sites.Read.All`, admin consent) in `server/.env`; see
`server/.env.example`. Organisation-only sharing links return 401 without it. This path is kept for
the future but is not used by the Vercel deployment.

## Project structure

```
supabase/
  migrations/20261013120000_admin_uploads.sql   tables, functions, RLS, bucket
  functions/upload-dataset/index.ts             Edge Function entry (Deno)
  functions/_shared/uploadHandler.ts            request handling (runtime-independent)
  functions/_shared/supabaseUploadDeps.ts       Supabase-backed dependencies (service role)
  functions/_shared/tournament/                 GENERATED copy of src/ domain code (npm run sync:shared)
scripts/sync-shared.mjs                         keeps the generated copy in sync
src/
  lib/supabase.ts                               browser client (publishable key only)
  auth/                                         AuthProvider (email OTP), access rules
  admin/                                        adminApi, AdminLayout, RequireAccess
  pages/                                        DashboardPage, LoginPage, AdminUploadPage, UserManagementPage
  router.ts                                     tiny History-API router (/, /login, /admin, /admin/users)
  services/                                     workbookSource, excelParser, importValidation, datasetCodec
  utils/                                        pointsCalculator, leaderboard, format
  components/                                   dashboard UI
server/                                         optional SharePoint (Graph) backend
```

## Known limitations

- The Supabase project, Edge Function and Vercel deployment have **not been exercised end to end**
  in this repository's development environment (no Supabase/Vercel CLI or Deno available), and the
  project has no automated tests by choice — verify the sign-in, upload and publish flows manually
  after the first deployment (see "Checking the three roles").
- Sign-in emails depend on Supabase's email rate limits unless custom SMTP is configured.
- `.xls` (legacy Excel) is accepted via SheetJS; `.xlsx`/`.csv` are the formats used so far.
- Superadmins are managed by SQL (`bootstrap_superadmin`), by design.

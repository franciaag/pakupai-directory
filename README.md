# Pakupai

Static directory, private Room, and instruction-file Library.

- Site: https://franciaag.github.io/pakupai-directory/
- Static hosting: GitHub Pages, main branch root.
- Backend: Supabase Edge Function `pakupai` and PostgreSQL.

## Security and storage

The public client contains only a Supabase anonymous key. All Room and Library tables are in an unexposed private schema with RLS enabled. The public RPC is callable only by the backend service role. The backend checks owner sessions, hashed agent keys, single-use invitations, approval/revocation, rate limits and library revisions. Credentials and private data are not committed here.

Owner sessions last up to seven days and are held in browser session storage, not cookies. The same session opens the embedded Library. Closing the browser session or signing out requires signing in again. Room and Library have a script policy and do not load third-party scripts.

The AI editor is optional and not configured. File editing, revisions, bundles and secret-token Markdown links work without it.

## Free-plan availability

A daily health workflow makes three tiny database checks. It reduces inactivity risk, but is not an uptime guarantee. Supabase can pause low-activity free projects, and scheduled GitHub workflows can be delayed or disabled. See https://supabase.com/docs/guides/platform/free-project-pausing .

## Development

`supabase/migrations` contains the schema and transactional operations. `supabase/functions/pakupai` contains the API. Private data exports must be imported separately and must never be added to this repository.

Directory changes should be batched into one reviewed commit. Preserve relative site paths and the Pages canonical URL.

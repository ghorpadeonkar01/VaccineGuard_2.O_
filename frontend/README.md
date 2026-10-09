# VaccineGuard frontend

Static HTML, CSS, and vanilla JavaScript dashboard for the VaccineGuard cold chain monitoring demo. No frontend build step is required.

## Run locally

Serve the `frontend/` directory using any static HTTP server (for example, `python -m http.server 8080` from this directory), then open `http://localhost:8080/`. Opening files directly with `file://` may block map tiles and fetch requests. Leaflet tiles and the optional Google font are fetched from their public CDN providers.

## Configuration

Edit `assets/js/config.js` before serving:

```js
window.VG_CONFIG = Object.freeze({
  API_BASE_URL: 'http://localhost:8000',
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'your-public-publishable-key',
  DEMO_MODE: false,
  POLL_INTERVAL_MS: 30000
});
```

`API_BASE_URL` must be an origin/base path reachable from the browser. Configure FastAPI CORS for the frontend origin and use HTTPS outside local development. Supabase browser sign-in uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from `assets/js/config.js`, with `@supabase/supabase-js` v2 loaded from the official CDN. The login calls `signInWithPassword`, stores the session through Supabase's client, supports password reset, and reads the authenticated user's role from `public.profiles`. Row level security permits each account to read only its own profile, and there are no browser-side role write policies. Assign roles only through the trusted provisioning script. Never put a database password or Supabase secret/service-role key in browser files. The local redirect URL (for example, `http://127.0.0.1:8080/login.html`) must be allowed in Supabase Auth URL Configuration for password recovery.

Apply `../supabase/migrations/202610090001_profiles.sql` in the Supabase SQL Editor first. Then run `python scripts/seed_supabase_demo_users.py` from the project root. The seeder creates exactly `admin@vaccineguard.demo`, `user@vaccineguard.demo`, and `checkpoint@vaccineguard.demo`, writes their roles to `public.profiles`, and generates memorable, random six-word passphrases and prints them to the terminal. On reruns it resets passwords only for these three named demo accounts, never duplicates users, and upserts their profile roles. Save the passwords from each run; they are not stored by the app. The script prompts for the Supabase secret/service_role key with hidden input. Do not put that key in frontend files or commit it. `.env.example` documents the trusted terminal variables; the script does not automatically load `.env`.

By default, `API_BASE_URL` is empty and the site stays in clearly labeled demo mode. Demo fixtures live in `assets/js/demo-data.js` and are fictional; they are never merged with API records. Demo mutation controls are disabled or explain that persistence is unavailable. Do not use demo values as operational vaccine measurements.

## Pages

The app uses `index.html?page=…` routes: overview (`dashboard`), shipments, shipment details (`details&id=VG-2048`), live tracking, alerts, checkpoint operations, sensors, analytics, vaccine policies, user management, simulation controls, and audit/system health. Every `index.html` route requires a valid Supabase session and a matching role in `public.profiles`; query parameters and browser storage cannot grant access. `login.html` contains the sign-in form. The shared shell adapts to mobile and map pages use Leaflet with OpenStreetMap tiles.

## Backend contract status

The repository supplied for this implementation had no backend code or operational data endpoints. Supabase Auth is configured for sign-in, but shipment, policy, alert, telemetry, and admin data APIs remain unspecified. Provide and document their contracts before enabling those actions. Recommended resource shapes/endpoints to agree with the FastAPI team:

| Capability | Suggested contract |
|---|---|
| Session | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`; define refresh/expiry behavior |
| Dashboard | `GET /dashboard/summary`, `GET /shipments`, `GET /alerts`, `GET /telemetry/latest`, `GET /checkpoints` |
| Shipment management | `GET/POST /shipments`, `GET/PATCH /shipments/{id}`, `GET /shipments/{id}/telemetry`, `GET /shipments/{id}/events` |
| Tracking | `GET /tracking/shipments`, `GET /checkpoints`; return coordinates and optional nearest eligible checkpoint with distance method |
| Alerts & interventions | `GET /alerts`, `GET/PATCH /alerts/{id}`, `POST /alerts/{id}/acknowledge`, `/assign`, `/resolve`, `/escalate`; `POST /alerts/{id}/interventions` |
| Sensors & analytics | `GET /sensors`, `GET /sensors/{id}/readings`, `GET /analytics`; specify pagination, date filters, units, and simulated/recorded provenance |
| Policies & users | `GET/POST /policies`, `PATCH /policies/{id}`, `GET /policies/{id}/history`; admin-only `/users` CRUD/status/roles |
| Simulation | `GET /simulation/status`, `POST /simulation/start|pause|resume|stop`, `POST /simulation/scenario`; define supported scenarios and speed |
| Audit & health | `GET /audit-logs`, `GET /health`; expose only safe health details and authorize audit access |

Use consistent JSON error bodies and explicit units/timestamps, pagination, role authorization, and a provenance field distinguishing simulated from stored sensor data. Once the contracts are supplied, `assets/js/api.js` is the centralized fetch helper to extend. Polling is not enabled against guessed paths.

## Included behavior and limitations

- Responsive sidebar navigation, search and filter controls for fixture lists, shipment detail routing, map filters and marker selection, print CSS, and a demo CSV download.
- Native SVG demo trend charts. The illustrative chart is visibly marked as demo and is not returned as real measurement data.
- Supabase email/password sign-in, password reset, password visibility toggle, validation, and Supabase session-backed API bearer tokens. Role UI reads the protected `public.profiles` row; route checks are only a frontend safeguard, so every data API must enforce authorization too.
- Shipment creation/edit, alert acknowledgment, checkpoint workflow, policy/user changes, and simulation calls are unavailable without endpoint specifications. Diagnostic/audit data is not fabricated.
- Dashboard currently displays separate fictional fixtures only. It does not claim connection to a backend, live updates, or successful persistence.

## Manual verification checklist

- [ ] Open `index.html` over HTTP and check all sidebar pages and mobile navigation.
- [ ] Search/filter shipments, alerts, and sensors; open shipment details from the registry and map.
- [ ] Check map tile loading and marker panel in a network-enabled browser.
- [ ] Export the labeled demo CSV and print a shipment report.
- [ ] Submit the login form with invalid input; check validation and Supabase sign-in errors.
- [ ] In Supabase Auth URL Configuration allow the local login URL, then verify sign-in and password recovery using a seeded account after applying the profile migration.
- [ ] Configure a test FastAPI origin and verify CORS, bearer token expiry, endpoint errors, and role authorization before enabling mutations.
- [ ] Test tablet/mobile widths and keyboard-only navigation against the target browsers.

No browser/device integration test has been run in this workspace.

# Production Handoff

## Readiness upgrades already applied

- Backend now validates critical production environment variables before startup.
- JWT secrets no longer silently fall back to weak defaults in production.
- API error responses now hide internal server details in production while preserving logs.
- Backend logging is cleaner and more structured for deployed environments.
- Frontend API requests now use a timeout and friendlier network/server failure messages.
- Frontend session persistence now fails gracefully if local storage is unavailable or corrupted.
- Frontend crashes and Web Vital metrics now report to backend client-event endpoints.
- Refresh tokens are now set as `httpOnly` cookies by the backend, with credentialed frontend API requests enabled.
- The backend exposes `/api/ready` for database-backed readiness checks.
- A repeatable database export command is available through `npm run backup` in `backend`.

## Deploy checklist

1. Redeploy the backend after pulling the latest code.
2. Redeploy the frontend after pulling the latest code.
3. Confirm these backend variables are set in production:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `CORS_ORIGIN`
   - `FRONTEND_URL`
4. Keep `REACT_APP_API_URL=https://api.attendancesystem.xyz` on the frontend.
5. Verify `Enforce HTTPS` remains enabled on the GitHub Pages custom domain.
6. Rotate any secrets that were previously pasted or shared.

## Smoke test after deployment

1. Open `https://attendancesystem.xyz`.
2. Log in as admin, lecturer, and student.
3. Create a course and confirm dropdown values stay normalized.
4. Create an attendance session and confirm:
   - QR displays correctly
   - in-app scan works
   - camera-link QR opens the attendance entry flow
5. Mark one valid attendance and one invalid attendance attempt.
6. Confirm reports, dashboard summaries, and notifications load.
7. Open `https://api.attendancesystem.xyz/api/health` and confirm the API responds.
8. Open `https://api.attendancesystem.xyz/api/ready` and confirm the database readiness check responds.
9. Confirm student users cannot escalate absence queries and lecturers/admins can only escalate allowed lecturer-originated queries.

## Recommended next hardening

- Move access tokens from `localStorage` into an in-memory or cookie-backed session model after the refresh-cookie rollout is stable.
- Schedule `npm run backup` on the production backend host and move backup files to durable off-host storage.
- Add a scheduled health check or uptime monitor for `/api/health` and `/api/ready`.
- Run the Postman security collection after each major release.

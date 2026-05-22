# Production Handoff

## Readiness upgrades already applied

- Backend now validates critical production environment variables before startup.
- JWT secrets no longer silently fall back to weak defaults in production.
- API error responses now hide internal server details in production while preserving logs.
- Backend logging is cleaner and more structured for deployed environments.
- Frontend API requests now use a timeout and friendlier network/server failure messages.
- Frontend session persistence now fails gracefully if local storage is unavailable or corrupted.

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

## Recommended next hardening

- Move auth tokens from `localStorage` to secure `httpOnly` cookies when you are ready to do a deeper auth pass.
- Add automated backup/export for registry, attendance, and query records.
- Add a scheduled health check or uptime monitor for the backend.
- Run the Postman security collection after each major release.

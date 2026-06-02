# Supabase Migration Notes

This project now expects a single Supabase Postgres database through `DATABASE_URL`.
The safest way to keep existing records intact is:

1. Create the Supabase project and note the Postgres connection string.
2. Point `backend/.env` or your deployment environment at that `DATABASE_URL`.
3. Start the backend once so Sequelize can create the tables in Supabase.
4. Export the current database from the old source, preserving primary keys and timestamps.
5. Import that export into Supabase before opening the app to users.
6. Verify row counts for:
   - `users`
   - `courses`
   - `sessions`
   - `attendance`
   - `student_registry`
   - `enrollments`
   - `absence_queries`
   - `audit_logs`
   - `site_settings`

## Important

- Keep the `id` columns and foreign keys intact during import.
- After import, verify the Supabase sequences are aligned with the highest imported `id`.
- Do a test login and a test attendance mark before switching production traffic.

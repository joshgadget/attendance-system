# Attendance System

Attendance System is a role-based attendance management platform for admins, lecturers, and students. It supports registry-backed student signup, course registration, QR attendance, absence queries, and deployment-ready environment configuration.

## Core Features

- Admin user management for students, lecturers, and admins
- School registry management for matric-number-based student signup
- Course creation, lecturer assignment, and semester enrollment support
- Lecturer attendance sessions with QR code generation
- Student QR scanning and manual attendance marking
- Automatic absence queries for enrolled students who miss a session
- Student response workflow for lecturer follow-up
- Password reset flow with secure token email links
- Geofenced attendance mode (latitude, longitude, radius) for stronger anti-cheat enforcement
- Optional location capture during attendance marking
- Docker-based local deployment setup

## Local Development

### Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Update database credentials and JWT secrets
3. Run:

```bash
cd backend
npm install
npm run dev
```

### Frontend

1. Copy `frontend/.env.example` to `frontend/.env`
2. Set `REACT_APP_API_URL` if your backend is not on `http://localhost:5000/api`
3. Run:

```bash
cd frontend
npm install
npm start
```

## Docker Deployment

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`
- Health check: `http://localhost:5000/api/health`
- MySQL: `localhost:3306`

## Production Notes

- Replace all example secrets before deployment
- Lock down `CORS_ORIGIN` to your real frontend domain
- Use a managed MySQL database for production reliability
- Put the frontend behind HTTPS and a real domain
- Back up the registry, enrollment, attendance, and query tables regularly
- Consider object storage and audit logging if the institution needs higher compliance

## Student Signup Flow

1. Admin imports or creates registry records with matric number and student biodata
2. Student opens the signup page and enters matric number
3. The app verifies the record and displays school-provided details
4. Student adds email, password, and current semester courses
5. The account is created and linked to the registry record

## Attendance Workflow

1. Lecturer creates a session for a course
2. System generates a QR code and session code
3. Student scans the QR code or enters the session code manually
4. Attendance is recorded with optional location metadata
5. When the lecturer closes the session, the system computes absentees and creates absence queries automatically

## Password Reset

1. User opens the forgot password page and submits email
2. Backend generates a one-time reset token and sends an email link
3. User opens reset link and sets a new password
4. Token expires automatically after one hour

## Default Demo Accounts

- Lecturer: `lecturer.demo@attendance.local` / `Lecturer123!`
- Student: `student.demo@attendance.local` / `Student123!`

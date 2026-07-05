const Joi = require('joi');

// User registration validation
const registerSchema = Joi.object({
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().min(8).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'
    }),
  first_name: Joi.string().min(2).max(100).required().trim(),
  last_name: Joi.string().min(2).max(100).required().trim(),
  role: Joi.string().valid('admin', 'lecturer', 'student').required(),
  department: Joi.string().max(100).optional().trim(),
  matric_number: Joi.string().max(50).optional().trim()
    .when('role', {
      is: 'student',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
});

// Login validation
const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().required()
});

// UPDATED: Course creation with Rain/Harmattan semesters
const courseSchema = Joi.object({
  code: Joi.string().min(3).max(20).required().trim().uppercase(),
  title: Joi.string().min(3).max(200).required().trim(),
  description: Joi.string().max(1000).optional(),
  // UPDATED: Rain and Harmattan semesters only
  semester: Joi.string().valid('rain', 'harmattan').required()
    .messages({
      'any.only': 'Semester must be either "rain" or "harmattan"'
    }),
  // UPDATED: Session year format (e.g., 2024/2025)
  session_year: Joi.string().pattern(/^\d{4}\/\d{4}$/).required()
    .messages({
      'string.pattern.base': 'Session year must be in format YYYY/YYYY (e.g., 2024/2025)'
    }),
  lecturer_id: Joi.string().uuid().required()
});

// Session creation validation
const sessionSchema = Joi.object({
  course_id: Joi.string().uuid().required(),
  date: Joi.date().iso().required(),
  start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  duration_minutes: Joi.number().integer().min(15).max(300).default(120)
});

// Attendance marking validation
const attendanceSchema = Joi.object({
  session_key: Joi.string().length(6).required().trim().uppercase()
});

module.exports = {
  registerSchema,
  loginSchema,
  courseSchema,
  sessionSchema,
  attendanceSchema
};
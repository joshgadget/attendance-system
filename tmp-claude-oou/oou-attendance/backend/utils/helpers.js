const crypto = require('crypto');

// Generate random session code (10 characters)
const generateSessionCode = () => {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
};

// Format date for display
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Format time for display
const formatTime = (time) => {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Calculate attendance percentage
const calculateAttendancePercentage = (present, total) => {
  if (total === 0) return 0;
  return Math.round((present / total) * 100);
};

module.exports = {
  generateSessionCode,
  formatDate,
  formatTime,
  calculateAttendancePercentage
};
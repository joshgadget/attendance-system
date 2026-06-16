const normalizeId = (value) => String(value ?? '');

const canEscalateAbsenceQuery = ({ actor, query }) => {
  if (!actor?.role || !query) {
    return { allowed: false, message: 'Authentication required.' };
  }

  if (query.status === 'closed') {
    return { allowed: false, message: 'Closed queries cannot be escalated.' };
  }

  if (actor.role === 'student') {
    return { allowed: false, message: 'Students cannot escalate absence queries.' };
  }

  if (actor.role === 'lecturer') {
    const ownsQuery = normalizeId(query.lecturerId) === normalizeId(actor.id);
    return ownsQuery
      ? { allowed: true }
      : { allowed: false, message: 'Lecturers can only escalate their own queries.' };
  }

  if (actor.role === 'admin') {
    const lecturerRole = query.lecturer?.role || query.lecturerRole;
    return lecturerRole === 'lecturer'
      ? { allowed: true }
      : { allowed: false, message: 'Admins can only escalate queries that came from lecturers.' };
  }

  return { allowed: false, message: 'Access denied.' };
};

module.exports = { canEscalateAbsenceQuery };

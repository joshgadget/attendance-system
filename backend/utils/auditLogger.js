const { AuditLog } = require('../models');

const resolveIpAddress = (req) =>
  req?.ip ||
  req?.headers?.['x-forwarded-for'] ||
  req?.connection?.remoteAddress ||
  null;

const logAuditEvent = async ({
  req = null,
  actor = null,
  action,
  targetType = null,
  targetId = null,
  campus = null,
  faculty = null,
  department = null,
  metadata = null,
} = {}) => {
  if (!action) {
    return null;
  }

  try {
    return await AuditLog.create({
      actorId: actor?.id || req?.user?.id || null,
      actorRole: actor?.role || req?.user?.role || null,
      action,
      targetType,
      targetId: targetId === undefined || targetId === null ? null : String(targetId),
      campus: campus || actor?.campus || req?.user?.campus || null,
      faculty: faculty || actor?.faculty || req?.user?.faculty || null,
      department: department || actor?.department || req?.user?.department || null,
      ipAddress: resolveIpAddress(req),
      userAgent: req?.get ? req.get('user-agent') || null : null,
      metadata: metadata || null,
    });
  } catch (error) {
    console.warn(`Audit log skipped for ${action}:`, error.message);
    return null;
  }
};

module.exports = {
  logAuditEvent,
};

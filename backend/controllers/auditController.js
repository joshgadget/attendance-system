const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');

exports.getAuditLogs = async (req, res) => {
  try {
    const { action, actorRole, campus, department, limit = 50 } = req.query;
    const where = {};

    if (action) {
      where.action = action;
    }

    if (actorRole) {
      where.actorRole = actorRole;
    }

    if (campus) {
      where.campus = campus;
    }

    if (department) {
      where.department = department;
    }

    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const logs = await AuditLog.findAll({
      where,
      include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email', 'role'], required: false }],
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAuditSummary = async (req, res) => {
  try {
    const [recentCount, rejectedMarks, activeCampuses] = await Promise.all([
      AuditLog.count({
        where: {
          createdAt: {
            [Op.gte]: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)),
          },
        },
      }),
      AuditLog.count({
        where: {
          action: {
            [Op.like]: 'attendance.mark.rejected%',
          },
        },
      }),
      AuditLog.findAll({
        attributes: ['campus'],
        where: {
          campus: { [Op.ne]: null },
        },
        group: ['campus'],
        order: [['campus', 'ASC']],
      }),
    ]);

    res.json({
      success: true,
      data: {
        recentCount,
        rejectedMarks,
        campuses: activeCampuses.map((entry) => entry.campus).filter(Boolean),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const buildNotificationRoomNames = ({ userIds = [], roles = [] } = {}) => {
  const rooms = new Set();

  for (const userId of userIds) {
    if (userId === undefined || userId === null || userId === '') {
      continue;
    }
    rooms.add(`user_${userId}`);
  }

  for (const role of roles) {
    if (!role) {
      continue;
    }
    rooms.add(`role_${role}`);
  }

  return Array.from(rooms);
};

const buildNotificationPayload = ({
  type,
  title,
  description,
  tone = 'blue',
  linkTab = 'notifications',
  entityType = null,
  entityId = null,
  meta = {},
  createdAt = new Date().toISOString(),
} = {}) => ({
  type,
  title,
  description,
  tone,
  linkTab,
  entityType,
  entityId,
  meta,
  createdAt,
});

const broadcastNotification = (io, options = {}) => {
  if (!io) {
    return null;
  }

  const { notification, userIds = [], roles = [], refresh = true } = options;
  if (!notification) {
    return null;
  }

  const rooms = buildNotificationRoomNames({ userIds, roles });
  if (rooms.length === 0) {
    return null;
  }

  for (const room of rooms) {
    io.to(room).emit('notification:new', notification);
    if (refresh) {
      io.to(room).emit('dashboard:refresh', {
        reason: notification.type || 'notification',
        createdAt: notification.createdAt,
        entityType: notification.entityType || null,
        entityId: notification.entityId || null,
      });
    }
  }

  return notification;
};

module.exports = {
  broadcastNotification,
  buildNotificationPayload,
};

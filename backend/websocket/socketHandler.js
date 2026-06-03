const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const { User } = require('../models');
const logger = require('../utils/logger');

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, authConfig.jwt.secret);
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'role', 'isActive'],
      });

      if (!user || !user.isActive) {
        return next(new Error('User unavailable'));
      }

      socket.data.user = {
        id: user.id,
        role: user.role,
      };

      return next();
    } catch (error) {
      return next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user || {};
    const userRoom = `user_${user.id}`;
    const roleRoom = `role_${user.role}`;

    socket.join(userRoom);
    socket.join(roleRoom);
    logger.info(`New WebSocket connection: ${socket.id} (${userRoom}, ${roleRoom})`);

    // Join session room for real-time updates
    socket.on('join_session', (sessionId) => {
      socket.join(`session_${sessionId}`);
      logger.info(`Socket ${socket.id} joined session ${sessionId}`);
    });

    // Leave session room
    socket.on('leave_session', (sessionId) => {
      socket.leave(`session_${sessionId}`);
      logger.info(`Socket ${socket.id} left session ${sessionId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`WebSocket disconnected: ${socket.id}`);
    });
  });
};

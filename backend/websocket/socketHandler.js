const logger = require('../utils/logger');

module.exports = (io) => {
  io.on('connection', (socket) => {
    logger.info(`New WebSocket connection: ${socket.id}`);

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
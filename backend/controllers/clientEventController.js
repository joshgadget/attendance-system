const logger = require('../utils/logger');

const clamp = (value, maxLength = 1000) => String(value || '').slice(0, maxLength);

const clientMetaFromRequest = (req) => ({
  ip: req.ip,
  userAgent: clamp(req.get('user-agent'), 500),
  origin: clamp(req.get('origin'), 250),
  referer: clamp(req.get('referer'), 500),
});

exports.recordClientError = (req, res) => {
  const { message, stack, componentStack, url, release, source } = req.body || {};

  logger.warn('Client error reported', {
    ...clientMetaFromRequest(req),
    source: clamp(source, 80),
    release: clamp(release, 80),
    url: clamp(url, 500),
    message: clamp(message, 1000),
    stack: clamp(stack, 2500),
    componentStack: clamp(componentStack, 2500),
  });

  res.status(202).json({ success: true });
};

exports.recordClientMetric = (req, res) => {
  const { name, value, rating, delta, id, navigationType, url, release } = req.body || {};

  logger.info('Client performance metric', {
    ...clientMetaFromRequest(req),
    release: clamp(release, 80),
    url: clamp(url, 500),
    name: clamp(name, 30),
    rating: clamp(rating, 30),
    value: Number(value),
    delta: Number(delta),
    id: clamp(id, 80),
    navigationType: clamp(navigationType, 80),
  });

  res.status(202).json({ success: true });
};

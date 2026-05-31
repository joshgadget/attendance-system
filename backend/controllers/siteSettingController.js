const { SiteSetting } = require('../models');

const SITE_SETTINGS_KEY = 'global-maintenance';

const DEFAULT_SITE_SETTINGS = {
  badge: 'Temporary maintenance',
  title: 'Site temporarily unavailable',
  body: "We're applying a few updates right now. Please check back soon. All access is currently paused while maintenance is active.",
  footer: 'Everything is locked during maintenance',
};

const serializeSiteSetting = (record) => ({
  isMaintenanceEnabled: Boolean(record?.isMaintenanceEnabled),
  badge: record?.badge || DEFAULT_SITE_SETTINGS.badge,
  title: record?.title || DEFAULT_SITE_SETTINGS.title,
  body: record?.body || DEFAULT_SITE_SETTINGS.body,
  footer: record?.footer || DEFAULT_SITE_SETTINGS.footer,
  updatedAt: record?.updatedAt || null,
  updatedByUserId: record?.updatedByUserId || null,
});

const parseBoolean = (value) => {
  if (value === true || value === 1) {
    return true;
  }

  if (value === false || value === 0 || value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  return Boolean(value);
};

const getOrCreateSiteSetting = async () => {
  const [record] = await SiteSetting.findOrCreate({
    where: { key: SITE_SETTINGS_KEY },
    defaults: {
      key: SITE_SETTINGS_KEY,
      isMaintenanceEnabled: false,
      ...DEFAULT_SITE_SETTINGS,
    },
  });

  return record;
};

exports.getMaintenanceSettings = async (req, res) => {
  try {
    const record = await getOrCreateSiteSetting();
    res.json({
      success: true,
      data: serializeSiteSetting(record),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMaintenanceSettings = async (req, res) => {
  try {
    const currentRecord = await getOrCreateSiteSetting();
    const {
      isMaintenanceEnabled,
      badge,
      title,
      body,
      footer,
    } = req.body || {};

    currentRecord.isMaintenanceEnabled = parseBoolean(isMaintenanceEnabled);
    currentRecord.badge = String(badge || '').trim() || currentRecord.badge || DEFAULT_SITE_SETTINGS.badge;
    currentRecord.title = String(title || '').trim() || currentRecord.title || DEFAULT_SITE_SETTINGS.title;
    currentRecord.body = String(body || '').trim() || currentRecord.body || DEFAULT_SITE_SETTINGS.body;
    currentRecord.footer = String(footer || '').trim() || currentRecord.footer || DEFAULT_SITE_SETTINGS.footer;
    currentRecord.updatedByUserId = req.user?.id || null;
    await currentRecord.save();

    const payload = serializeSiteSetting(currentRecord);
    const io = req.app.get('io');
    if (io) {
      io.emit('site_maintenance_updated', payload);
    }

    res.json({
      success: true,
      message: currentRecord.isMaintenanceEnabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.',
      data: payload,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

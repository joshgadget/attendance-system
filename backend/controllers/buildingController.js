const { Building } = require('../models');
const { Op } = require('sequelize');
const { logAuditEvent } = require('../utils/auditLogger');
const { normalizeInstitutionText } = require('../utils/institutionNormalizer');

exports.getBuildings = async (req, res) => {
  try {
    const { activeOnly, search, campus } = req.query;
    const where = {};

    if (activeOnly === 'true') {
      where.isActive = true;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { tag: { [Op.like]: `%${search}%` } },
        { campus: { [Op.like]: `%${search}%` } },
      ];
    }

    if (campus) {
      where.campus = normalizeInstitutionText(campus, 'campus');
    }

    const buildings = await Building.findAll({
      where,
      order: [['name', 'ASC']],
    });

    return res.json({ success: true, data: buildings });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createBuilding = async (req, res) => {
  try {
    const { name, tag, campus, latitude, longitude, radiusMeters } = req.body;

    if (!name || latitude === undefined || longitude === undefined || radiusMeters === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, latitude, longitude and radiusMeters are required',
      });
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedRadius = Number(radiusMeters);

    if (Number.isNaN(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
      return res.status(400).json({ success: false, message: 'latitude must be a valid value between -90 and 90' });
    }
    if (Number.isNaN(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
      return res.status(400).json({ success: false, message: 'longitude must be a valid value between -180 and 180' });
    }
    if (Number.isNaN(parsedRadius) || parsedRadius < 10 || parsedRadius > 500) {
      return res.status(400).json({ success: false, message: 'radiusMeters must be between 10 and 500' });
    }

    const existing = await Building.findOne({ where: { name: name.trim() } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Building name already exists' });
    }

    const building = await Building.create({
      name: name.trim(),
      tag: tag ? String(tag).trim() : null,
      campus: normalizeInstitutionText(campus, 'campus') || null,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      radiusMeters: parsedRadius,
      isActive: true,
    });

    await logAuditEvent({
      req,
      action: 'building.created',
      targetType: 'building',
      targetId: building.id,
      campus: building.campus,
      metadata: {
        name: building.name,
        radiusMeters: building.radiusMeters,
      },
    });

    return res.status(201).json({ success: true, message: 'Building geofence created successfully', data: building });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBuilding = async (req, res) => {
  try {
    const building = await Building.findByPk(req.params.id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found' });
    }

    const payload = {};
    if (req.body.name !== undefined) payload.name = String(req.body.name).trim();
    if (req.body.tag !== undefined) payload.tag = req.body.tag ? String(req.body.tag).trim() : null;
    if (req.body.campus !== undefined) payload.campus = normalizeInstitutionText(req.body.campus, 'campus') || null;

    if (req.body.latitude !== undefined) {
      const parsed = Number(req.body.latitude);
      if (Number.isNaN(parsed) || parsed < -90 || parsed > 90) {
        return res.status(400).json({ success: false, message: 'latitude must be between -90 and 90' });
      }
      payload.latitude = parsed;
    }

    if (req.body.longitude !== undefined) {
      const parsed = Number(req.body.longitude);
      if (Number.isNaN(parsed) || parsed < -180 || parsed > 180) {
        return res.status(400).json({ success: false, message: 'longitude must be between -180 and 180' });
      }
      payload.longitude = parsed;
    }

    if (req.body.radiusMeters !== undefined) {
      const parsed = Number(req.body.radiusMeters);
      if (Number.isNaN(parsed) || parsed < 10 || parsed > 500) {
        return res.status(400).json({ success: false, message: 'radiusMeters must be between 10 and 500' });
      }
      payload.radiusMeters = parsed;
    }

    if (req.body.isActive !== undefined) {
      payload.isActive = Boolean(req.body.isActive);
    }

    await building.update(payload);
    await logAuditEvent({
      req,
      action: 'building.updated',
      targetType: 'building',
      targetId: building.id,
      campus: payload.campus ?? building.campus,
      metadata: {
        changedFields: Object.keys(payload),
      },
    });
    return res.json({ success: true, message: 'Building updated successfully', data: building });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deactivateBuilding = async (req, res) => {
  try {
    const building = await Building.findByPk(req.params.id);
    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found' });
    }

    building.isActive = false;
    await building.save();

    await logAuditEvent({
      req,
      action: 'building.deactivated',
      targetType: 'building',
      targetId: building.id,
      campus: building.campus,
      metadata: { name: building.name },
    });

    return res.json({ success: true, message: 'Building deactivated successfully', data: building });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const { Op } = require('sequelize');
const { StudentRegistry } = require('../models');

exports.getRegistry = async (req, res) => {
  try {
    const { search, faculty, department, program, level, claimed } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { matricNumber: { [Op.like]: `%${search}%` } },
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { department: { [Op.like]: `%${search}%` } },
        { faculty: { [Op.like]: `%${search}%` } },
        { program: { [Op.like]: `%${search}%` } },
      ];
    }

    if (faculty) {
      where.faculty = faculty;
    }

    if (department) {
      where.department = department;
    }

    if (program) {
      where.program = program;
    }

    if (level) {
      where.level = level;
    }

    if (claimed === 'true') {
      where.claimedByUserId = { [Op.ne]: null };
    }

    if (claimed === 'false') {
      where.claimedByUserId = null;
    }

    const records = await StudentRegistry.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createRegistryRecord = async (req, res) => {
  try {
    const { matricNumber, firstName, lastName, otherName, faculty, department, program, level, admissionYear } = req.body;

    if (!matricNumber || !firstName || !lastName || !faculty || !department || !program) {
      return res.status(400).json({
        success: false,
        message: 'matricNumber, firstName, lastName, faculty, department and program are required',
      });
    }

    const [record, created] = await StudentRegistry.findOrCreate({
      where: { matricNumber },
      defaults: {
        firstName,
        lastName,
        otherName: otherName || null,
        faculty,
        department,
        program,
        level: level || null,
        admissionYear: admissionYear || null,
        isActive: true,
      },
    });

    if (!created) {
      await record.update({
        firstName,
        lastName,
        otherName: otherName || null,
        faculty,
        department,
        program,
        level: level || null,
        admissionYear: admissionYear || null,
        isActive: true,
      });
    }

    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Student registry record created' : 'Student registry record updated',
      data: record,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkUpsertRegistry = async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'records must be a non-empty array' });
    }

    for (const record of records) {
      const { matricNumber, firstName, lastName, faculty, department, program, otherName, level, admissionYear } = record;
      if (!matricNumber || !firstName || !lastName || !faculty || !department || !program) {
        return res.status(400).json({
          success: false,
          message: 'Each record must include matricNumber, firstName, lastName, faculty, department and program',
        });
      }

      await StudentRegistry.upsert({
        matricNumber,
        firstName,
        lastName,
        otherName: otherName || null,
        faculty,
        department,
        program,
        level: level || null,
        admissionYear: admissionYear || null,
        isActive: true,
      });
    }

    res.json({ success: true, message: 'Student registry imported successfully', data: { count: records.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

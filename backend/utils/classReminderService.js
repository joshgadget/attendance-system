const { CourseSchedule, Course, Enrollment, User, ClassReminderLog } = require('../models');
const { sendEmail } = require('./mailer');
const logger = require('./logger');
const { broadcastNotification, buildNotificationPayload } = require('./realtimeNotifications');

const LAGOS_TIME_ZONE = 'Africa/Lagos';
const REMINDER_TICK_MS = 60 * 1000;
const REMINDER_LOOKBACK_MS = 5 * 60 * 1000;
const REMINDER_LOOKAHEAD_MS = 60 * 1000;
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_INDEX_MAP = DAY_ORDER.reduce((acc, day, index) => ({ ...acc, [day]: index }), {});

let reminderTimer = null;
let reminderSweepInProgress = false;

const formatTimeLabel = (value = '') => String(value).slice(0, 5);

const getCurrentLagosParts = (referenceDate = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: LAGOS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  });

  const parts = Object.fromEntries(formatter.formatToParts(referenceDate).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: String(parts.weekday || '').toLowerCase(),
  };
};

const minutesSinceMidnight = (time = '') => {
  const [hours = 0, minutes = 0] = String(time).split(':').map(Number);
  return (hours * 60) + minutes;
};

const getNextOccurrenceInfo = (schedule, referenceDate = new Date()) => {
  const nowParts = getCurrentLagosParts(referenceDate);
  const todayIndex = DAY_INDEX_MAP[nowParts.weekday];
  const scheduleIndex = DAY_INDEX_MAP[String(schedule.dayOfWeek || '').toLowerCase()];

  if (todayIndex === undefined || scheduleIndex === undefined) {
    return null;
  }

  const nowMinutes = (nowParts.hour * 60) + nowParts.minute;
  const startMinutes = minutesSinceMidnight(schedule.startTime);
  let diffDays = scheduleIndex - todayIndex;

  if (diffDays < 0 || (diffDays === 0 && startMinutes < nowMinutes)) {
    diffDays += 7;
  }

  const occurrenceAt = new Date(Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day + diffDays,
    Math.floor(startMinutes / 60) - 1,
    startMinutes % 60,
    0,
    0
  ));
  const reminderMinutes = Math.max(0, Number(schedule.notifyMinutesBefore || 30));
  const reminderAt = new Date(occurrenceAt.getTime() - (reminderMinutes * 60 * 1000));

  return {
    occurrenceAt,
    reminderAt,
    reminderMinutes,
  };
};

const buildReminderContent = ({ course, schedule, occurrenceAt, reminderMinutes, recipientRole }) => {
  const courseCode = course?.courseCode || 'Course';
  const courseName = course?.courseName || 'Scheduled class';
  const timeLabel = formatTimeLabel(schedule?.startTime);
  const venueLabel = schedule?.venue ? ` at ${schedule.venue}` : '';
  const dayLabel = String(schedule?.dayOfWeek || 'scheduled day').replace(/^\w/, (value) => value.toUpperCase());
  const roleLead = recipientRole === 'lecturer' ? 'Your class' : 'Your class reminder';
  const title = `Class reminder: ${courseCode}`;
  const description = `${courseName} starts in ${reminderMinutes} minutes on ${dayLabel} at ${timeLabel}${venueLabel}.`;
  const emailSubject = `${roleLead} for ${courseCode} starts in ${reminderMinutes} minutes`;
  const emailText = [
    `Hello,`,
    '',
    `${courseCode} - ${courseName} starts in ${reminderMinutes} minutes.`,
    `Day: ${dayLabel}`,
    `Time: ${timeLabel}`,
    schedule?.venue ? `Venue: ${schedule.venue}` : null,
    '',
    'Please get ready for class and attendance activity.',
  ].filter(Boolean).join('\n');

  const emailHtml = [
    '<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">',
    `<p>Hello,</p>`,
    `<p><strong>${courseCode}</strong> - ${courseName} starts in <strong>${reminderMinutes} minutes</strong>.</p>`,
    `<p><strong>Day:</strong> ${dayLabel}<br /><strong>Time:</strong> ${timeLabel}${schedule?.venue ? `<br /><strong>Venue:</strong> ${schedule.venue}` : ''}</p>`,
    '<p>Please get ready for class and attendance activity.</p>',
    '</div>',
  ].join('');

  const notification = buildNotificationPayload({
    type: 'class.reminder',
    title,
    description,
    tone: 'blue',
    linkTab: 'courses',
    entityType: 'course_schedule',
    entityId: schedule.id,
    meta: {
      courseId: course?.id || null,
      courseCode,
      reminderMinutes,
      occurrenceAt: occurrenceAt.toISOString(),
    },
    createdAt: new Date().toISOString(),
  });

  return {
    title,
    description,
    emailSubject,
    emailText,
    emailHtml,
    notification,
  };
};

const getReminderRecipients = async (course) => {
  const recipients = new Map();

  if (course?.lecturerId) {
    const lecturer = await User.findByPk(course.lecturerId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive'],
    });

    if (lecturer?.isActive) {
      recipients.set(lecturer.id, lecturer);
    }
  }

  const enrollments = await Enrollment.findAll({
    where: {
      courseId: course.id,
      status: 'active',
    },
    include: [{
      model: User,
      as: 'student',
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive'],
      required: true,
      where: { isActive: true },
    }],
  });

  enrollments.forEach((entry) => {
    if (entry.student?.id) {
      recipients.set(entry.student.id, entry.student);
    }
  });

  return Array.from(recipients.values());
};

const createReminderLog = async ({
  schedule,
  course,
  recipient,
  channel,
  occurrenceAt,
  reminderAt,
  title,
  description,
}) => {
  const [log, created] = await ClassReminderLog.findOrCreate({
    where: {
      courseScheduleId: schedule.id,
      courseId: course.id,
      userId: recipient.id,
      channel,
      occurrenceAt,
    },
    defaults: {
      courseScheduleId: schedule.id,
      courseId: course.id,
      userId: recipient.id,
      channel,
      occurrenceAt,
      reminderAt,
      title,
      description,
      deliveryStatus: 'pending',
      errorMessage: null,
    },
  });

  return { log, created };
};

const deliverInAppReminder = async ({ io, schedule, course, recipient, reminderInfo }) => {
  const content = buildReminderContent({
    course,
    schedule,
    occurrenceAt: reminderInfo.occurrenceAt,
    reminderMinutes: reminderInfo.reminderMinutes,
    recipientRole: recipient.role,
  });
  const { log, created } = await createReminderLog({
    schedule,
    course,
    recipient,
    channel: 'in_app',
    occurrenceAt: reminderInfo.occurrenceAt,
    reminderAt: reminderInfo.reminderAt,
    title: content.title,
    description: content.description,
  });

  if (!created) {
    return false;
  }

  broadcastNotification(io, {
    notification: content.notification,
    userIds: [recipient.id],
  });
  await log.update({ deliveryStatus: 'sent', errorMessage: null });
  return true;
};

const deliverEmailReminder = async ({ schedule, course, recipient, reminderInfo }) => {
  if (!recipient?.email) {
    return false;
  }

  const content = buildReminderContent({
    course,
    schedule,
    occurrenceAt: reminderInfo.occurrenceAt,
    reminderMinutes: reminderInfo.reminderMinutes,
    recipientRole: recipient.role,
  });
  const { log, created } = await createReminderLog({
    schedule,
    course,
    recipient,
    channel: 'email',
    occurrenceAt: reminderInfo.occurrenceAt,
    reminderAt: reminderInfo.reminderAt,
    title: content.title,
    description: content.description,
  });

  if (!created) {
    return false;
  }

  try {
    const result = await sendEmail({
      to: recipient.email,
      subject: content.emailSubject,
      html: content.emailHtml,
      text: content.emailText,
    });

    await log.update({
      deliveryStatus: result?.delivered ? 'sent' : 'preview',
      errorMessage: result?.preview ? 'Email transport is not configured. Preview mode only.' : null,
    });
    return true;
  } catch (error) {
    await log.update({
      deliveryStatus: 'failed',
      errorMessage: error.message || 'Email delivery failed.',
    });
    logger.warn('Class reminder email failed', {
      courseId: course.id,
      courseScheduleId: schedule.id,
      userId: recipient.id,
      message: error.message,
    });
    return false;
  }
};

const shouldSendReminderNow = (reminderInfo, referenceDate = new Date()) => {
  if (!reminderInfo?.reminderAt) {
    return false;
  }

  const reminderMs = reminderInfo.reminderAt.getTime();
  const nowMs = referenceDate.getTime();
  return reminderMs >= (nowMs - REMINDER_LOOKBACK_MS) && reminderMs <= (nowMs + REMINDER_LOOKAHEAD_MS);
};

const runReminderSweep = async (io) => {
  if (reminderSweepInProgress) {
    return;
  }

  reminderSweepInProgress = true;
  try {
    const referenceDate = new Date();
    const schedules = await CourseSchedule.findAll({
      where: { isActive: true },
      include: [{
        model: Course,
        as: 'course',
        required: true,
        where: { isActive: true },
        attributes: ['id', 'courseCode', 'courseName', 'lecturerId'],
      }],
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']],
    });

    for (const schedule of schedules) {
      const reminderInfo = getNextOccurrenceInfo(schedule, referenceDate);
      if (!shouldSendReminderNow(reminderInfo, referenceDate)) {
        continue;
      }

      const recipients = await getReminderRecipients(schedule.course);
      for (const recipient of recipients) {
        await deliverInAppReminder({
          io,
          schedule,
          course: schedule.course,
          recipient,
          reminderInfo,
        });
        await deliverEmailReminder({
          schedule,
          course: schedule.course,
          recipient,
          reminderInfo,
        });
      }
    }
  } catch (error) {
    logger.error('Class reminder sweep failed', {
      message: error.message,
      stack: error.stack,
    });
  } finally {
    reminderSweepInProgress = false;
  }
};

const startClassReminderService = (io) => {
  if (reminderTimer) {
    clearInterval(reminderTimer);
  }

  runReminderSweep(io).catch(() => null);
  reminderTimer = setInterval(() => {
    runReminderSweep(io).catch(() => null);
  }, REMINDER_TICK_MS);

  logger.info('Class reminder service started');
};

module.exports = {
  startClassReminderService,
};

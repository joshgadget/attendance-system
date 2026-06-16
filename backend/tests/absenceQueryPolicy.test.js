const test = require('node:test');
const assert = require('node:assert/strict');
const { canEscalateAbsenceQuery } = require('../utils/absenceQueryPolicy');

test('students cannot escalate absence queries', () => {
  const result = canEscalateAbsenceQuery({
    actor: { id: 7, role: 'student' },
    query: { id: 1, studentId: 7, lecturerId: 3, status: 'pending', lecturer: { role: 'lecturer' } },
  });

  assert.equal(result.allowed, false);
  assert.match(result.message, /Students cannot escalate/);
});

test('lecturers can escalate only their own active queries', () => {
  assert.equal(canEscalateAbsenceQuery({
    actor: { id: 3, role: 'lecturer' },
    query: { id: 1, lecturerId: 3, status: 'pending', lecturer: { role: 'lecturer' } },
  }).allowed, true);

  assert.equal(canEscalateAbsenceQuery({
    actor: { id: 4, role: 'lecturer' },
    query: { id: 1, lecturerId: 3, status: 'pending', lecturer: { role: 'lecturer' } },
  }).allowed, false);
});

test('admins can escalate lecturer-originated queries only', () => {
  assert.equal(canEscalateAbsenceQuery({
    actor: { id: 1, role: 'admin' },
    query: { id: 1, lecturerId: 3, status: 'pending', lecturer: { role: 'lecturer' } },
  }).allowed, true);

  assert.equal(canEscalateAbsenceQuery({
    actor: { id: 1, role: 'admin' },
    query: { id: 2, lecturerId: 1, status: 'pending', lecturer: { role: 'admin' } },
  }).allowed, false);
});

test('closed queries cannot be escalated', () => {
  const result = canEscalateAbsenceQuery({
    actor: { id: 3, role: 'lecturer' },
    query: { id: 1, lecturerId: 3, status: 'closed', lecturer: { role: 'lecturer' } },
  });

  assert.equal(result.allowed, false);
  assert.match(result.message, /Closed queries/);
});

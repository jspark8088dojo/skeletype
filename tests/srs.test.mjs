import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, addDays, daysUntil, firstInterval, nextInterval, isDue, describeDue } from '../src/srs.js';

const noon = new Date(2026, 10, 10, 12, 0, 0).getTime(); // 10 Nov 2026, local noon

test('dayKey and addDays use local calendar days', () => {
  assert.equal(dayKey(noon), '2026-11-10');
  assert.equal(dayKey(addDays(noon, 2)), '2026-11-12');
  assert.equal(new Date(addDays(noon, 1)).getHours(), 0);
  assert.equal(dayKey(addDays(new Date(2026, 2, 28, 23, 30).getTime(), 1)), '2026-03-29'); // across a DST change in Europe
});

test('daysUntil and describeDue', () => {
  assert.equal(daysUntil(addDays(noon, 2), noon), 2);
  assert.equal(describeDue(addDays(noon, 2), noon), 'in 2 days');
  assert.equal(describeDue(addDays(noon, 1), noon), 'tomorrow');
  assert.equal(describeDue(addDays(noon, -1), noon), 'due now');
});

test('intervals', () => {
  assert.equal(firstInterval(0.95), 3);
  assert.equal(firstInterval(0.86), 2);
  assert.equal(firstInterval(0.5), 1);
  assert.equal(nextInterval(2, 0.9), 5);
  assert.equal(nextInterval(1, 0.9), 3);
  assert.equal(nextInterval(5, 0.5), 1);
  assert.equal(nextInterval(40, 1), 60);
});

test('isDue compares calendar days', () => {
  assert.ok(!isDue(addDays(noon, 1), noon));
  assert.ok(isDue(addDays(noon, 1), addDays(noon, 1) + 60_000));
  assert.ok(!isDue(null, noon));
});

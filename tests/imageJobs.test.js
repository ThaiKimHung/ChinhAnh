import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageJobGuard } from '../src/engine/imageJobs.js';

test('a job cannot publish after switching photos or reselecting its photo', () => {
  const guard = createImageJobGuard();
  guard.select('first');
  const job = guard.start();
  assert.equal(guard.isCurrent(job), true);
  guard.select('second');
  assert.equal(guard.isCurrent(job), false);
  guard.select('first');
  assert.equal(guard.isCurrent(job), false);
  assert.equal(guard.isCurrent(guard.start()), true);
});

test('a pixel edit, reload, or removal invalidates older results', () => {
  const guard = createImageJobGuard();
  guard.select('photo');
  const beforeEdit = guard.start();
  guard.invalidate();
  assert.equal(guard.isCurrent(beforeEdit), false);
  const beforeReload = guard.start();
  guard.select('photo');
  assert.equal(guard.isCurrent(beforeReload), false);
  guard.select(null);
  assert.equal(guard.isCurrent(guard.start()), false);
});

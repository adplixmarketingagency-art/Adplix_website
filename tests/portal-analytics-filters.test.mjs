import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsPresetFilters } from '../portal/analytics-filters.mjs';

test('quick day presets cover inclusive business dates ending at today', () => {
  const today = '2026-10-09';
  for (const [preset, from] of Object.entries({
    '24h': '2026-10-09',
    '3d': '2026-10-07',
    '5d': '2026-10-05',
    '7d': '2026-10-03'
  })) {
    assert.deepEqual(analyticsPresetFilters(preset, today), { period: 'custom', from, to: today });
  }
});

test('UTC calendar arithmetic crosses month, leap-day, and year boundaries', () => {
  assert.deepEqual(analyticsPresetFilters('7d', '2026-01-02'), {
    period: 'custom', from: '2025-12-27', to: '2026-01-02'
  });
  assert.deepEqual(analyticsPresetFilters('5d', '2024-03-02'), {
    period: 'custom', from: '2024-02-27', to: '2024-03-02'
  });
  assert.deepEqual(analyticsPresetFilters('3d', '2024-03-01'), {
    period: 'custom', from: '2024-02-28', to: '2024-03-01'
  });
});

test('month selects the current business calendar month, including the new year', () => {
  assert.deepEqual(analyticsPresetFilters('month', '2025-12-31'), { period: 'month', month: '2025-12' });
  assert.deepEqual(analyticsPresetFilters('month', '2026-01-01'), { period: 'month', month: '2026-01' });
});

test('rejects unsupported presets and invalid ISO business dates', () => {
  for (const preset of ['all', '1d', 'Month', '', null, undefined, 3]) {
    assert.throws(() => analyticsPresetFilters(preset, '2026-10-09'), RangeError);
  }
  for (const today of ['2026-2-03', '2026-13-01', '2026-02-29', '2026-04-31',
    '0000-01-01', '2026-10-09T00:00:00Z', '', null, undefined, new Date('2026-10-09')]) {
    assert.throws(() => analyticsPresetFilters('24h', today), RangeError);
  }
});

test('results are fresh and independent of prior calls', () => {
  const first = analyticsPresetFilters('7d', '2026-01-02');
  first.from = '2000-01-01';
  const second = analyticsPresetFilters('7d', '2026-01-02');
  assert.notStrictEqual(first, second);
  assert.deepEqual(second, { period: 'custom', from: '2025-12-27', to: '2026-01-02' });
  assert.deepEqual(analyticsPresetFilters('month', '2026-01-02'), { period: 'month', month: '2026-01' });
});

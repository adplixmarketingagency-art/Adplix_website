const DAY_MS = 86_400_000;
const PRESET_DAYS = { '24h': 1, '3d': 3, '5d': 5, '7d': 7 };

export function analyticsPresetFilters(preset, today) {
  if (preset !== 'month' && !Object.hasOwn(PRESET_DAYS, preset)) {
    throw new RangeError('Invalid analytics preset');
  }
  if (typeof today !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(today)) {
    throw new RangeError('Invalid business date');
  }
  const utc = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== today) {
    throw new RangeError('Invalid business date');
  }

  if (preset === 'month') return { period: 'month', month: today.slice(0, 7) };
  const from = new Date(utc - (PRESET_DAYS[preset] - 1) * DAY_MS).toISOString().slice(0, 10);
  return { period: 'custom', from, to: today };
}

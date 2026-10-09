import test from 'node:test'
import assert from 'node:assert/strict'
import { dailyStatusDisplay } from '../portal/daily-status.mjs'

test('daily update statuses carry distinct readable text and a matching visual state', () => {
  assert.deepEqual(dailyStatusDisplay('overdue'), { label: 'Update overdue', className: 'tag--overdue' })
  assert.deepEqual(dailyStatusDisplay('late'), { label: 'Late update', className: 'tag--late' })
  assert.deepEqual(dailyStatusDisplay('on-time'), { label: 'On-time update', className: 'tag--on-time' })
  assert.deepEqual(dailyStatusDisplay('pending'), { label: 'Pending update', className: 'tag--pending' })
  assert.deepEqual(dailyStatusDisplay('exempt'), { label: 'No update required', className: 'tag--exempt' })
  assert.notEqual(dailyStatusDisplay('exempt').className, dailyStatusDisplay('overdue').className)
})

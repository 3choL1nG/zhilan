import {test} from 'node:test';import assert from 'node:assert/strict';
import {countdownState} from '../public/exam-countdown.mjs';
test('exam countdown defaults to the nearest date and respects a selected future date',()=>{
 const now=Date.parse('2026-10-30T04:00:00Z');assert.equal(countdownState(now).days,15);assert.equal(countdownState(now,'2026-12-27').days,58);assert.equal(countdownState(now,'invalid').selected.date,'2026-11-14');
});
test('exam countdown changes at Shanghai midnight, keeps exam day at zero and rolls to the next date',()=>{
 assert.equal(countdownState(Date.parse('2026-11-13T15:59:59.999Z')).days,1);
 assert.equal(countdownState(Date.parse('2026-11-13T16:00:00Z')).days,0);
 assert.equal(countdownState(Date.parse('2026-11-14T15:59:59.999Z')).selected.date,'2026-11-14');
 assert.equal(countdownState(Date.parse('2026-11-14T16:00:00Z'),'2026-11-14').selected.date,'2026-12-27');
 assert.equal(countdownState(Date.parse('2026-12-27T16:00:00Z')).days,null);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyWindow,DAILY_COUNTS} from '../src/daily-policy.mjs';
test('daily calendar changes exactly at Shanghai midnight independent of host timezone',()=>{
 const before=Date.parse('2026-10-30T15:59:59.999Z'),boundary=before+1;
 assert.deepEqual(dailyWindow(before),{day:'2026-10-30',resetsAt:boundary});
 assert.deepEqual(dailyWindow(boundary),{day:'2026-10-31',resetsAt:boundary+86400000});
 assert.equal(dailyWindow(Date.parse('2026-12-31T16:00:00Z')).day,'2027-01-01');
 assert.deepEqual(DAILY_COUNTS,{j:20,s:20,m:10});
});

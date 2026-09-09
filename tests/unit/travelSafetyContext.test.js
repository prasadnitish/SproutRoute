import test from 'node:test';
import assert from 'node:assert/strict';
import {getTravelSafety} from '../../src/backend/services/travelSafety.js';
test('safety uses trip dates and distinguishes adults only without inventing missing emergency data',async()=>{
 let prompt;
 const result=await getTravelSafety('Japan',[],'JP',{tripContext:{startDate:'2026-12-01',endDate:'2026-12-08'},callAI:async p=>{prompt=p;return JSON.stringify({healthTips:['Existing tip']})}});
 assert.match(prompt,/2026-12-01/);assert.match(prompt,/Adults-only/);
 assert.equal(result.emergencyNumber,null);
 assert.equal(result.advisoryLevel,null);
});

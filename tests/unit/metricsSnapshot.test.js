import test from 'node:test';
import assert from 'node:assert/strict';
import {metrics} from '../../src/backend/services/metrics.js';
test('returned database errors fall back to recent memory including HTTP failures',async()=>{
 metrics.recordTrip({destination:'Test',timing:{total:123,ai:100}});
 metrics.recordRequest({status:500,path:'/api/test',reqId:'test-id'});
 const query={select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:null,error:{message:'unavailable'}})}};
 const snapshot=await metrics.getSnapshot({getAdmin:()=>({from:()=>query})});
 assert.match(snapshot.dataSource,/in-memory/);
 assert.ok(snapshot.recentTrips.some(t=>t.destination==='Test'));
 assert.ok(snapshot.recentErrors.some(t=>t.reqId==='test-id'));
});

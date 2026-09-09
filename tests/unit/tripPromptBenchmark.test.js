import test from 'node:test';
import assert from 'node:assert/strict';
import * as trip from '../../src/backend/services/tripPlanAI.js';
test('benchmark uses the production trip prompt builder', () => {
  assert.equal(typeof trip.buildTripPlanPrompt, 'function');
  const p = trip.buildTripPlanPrompt('Tokyo','2026-12-01','2026-12-03',[],[],{forecast:[]},{countryCode:'JP'});
  assert.match(p.user,/Tokyo/);
  assert.match(p.system,/suggestedActivities/);
});
test('trip generation honors the configured task provider',async()=>{
 const old=process.env.AI_PROVIDER_TRIP_PLAN;process.env.AI_PROVIDER_TRIP_PLAN='gemini';let used=false;
 try{
 const plan=await trip.generateTripPlan({destination:'Tokyo',startDate:'2026-12-01',endDate:'2026-12-01',activities:[],children:[]},{forecast:[]},{geminiModel:{generateContent:async()=>{used=true;return{response:{text:()=>JSON.stringify({overview:'Tokyo',suggestedActivities:[{id:'a',name:'Sensoji',duration:'2 hours'},{id:'b',name:'Ueno Park',duration:'2 hours'},{id:'c',name:'Tokyo National Museum',duration:'2 hours'},{id:'d',name:'Ameyoko',duration:'1 hour'}],dailyItinerary:[{day:'Day 1',activities:['a','b','c','d'],meals:{dinner:{name:'Restaurant'}}}],tips:[]}),candidates:[{finishReason:'STOP'}]}}}},openaiClient:{chat:{completions:{create:async()=>{throw new Error('Wrong provider')}}}}});
 assert.ok(used);assert.equal(plan.dailyItinerary.length,1);
 }finally{if(old===undefined)delete process.env.AI_PROVIDER_TRIP_PLAN;else process.env.AI_PROVIDER_TRIP_PLAN=old;}
});

import {beginJourney,markJourney} from '../../src/frontend/src/services/journeyTrace.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../../src/frontend/src/hooks/useTrip.js',import.meta.url),'utf8')).replace(/import[\s\S]*?;\n/g,'').replace('export function useTrip','function useTrip');
test('packing and safety start before the full itinerary finishes',async()=>{
 const events=[];const mocks={beginJourney,markJourney,
 useState:v=>[typeof v==='function'?v():v,()=>{}],useCallback:f=>f,useRef:v=>({current:v}),useEffect:()=>{},
 STORAGE_KEYS:{},loadJSON:()=>null,saveJSON:()=>{},addRecentTrip:()=>{},analytics:new Proxy({},{get:()=>()=>{}}),
 parseInput:async()=>({destination:'Tokyo',startDate:'2026-12-01',endDate:'2026-12-03',childrenAges:[]}),
 prefetchRouteAttractions:async()=>({}),generatePackingList:async()=>{events.push('packing');return{categories:[]}},getTravelSafety:async()=>{events.push('safety');return{}},petTravelCheck:async()=>({}),getCarSeatGuidance:async()=>({}),
 streamTripPlan:async(data,onEvent)=>{onEvent({type:'destination',data:{countryCode:'JP'}});events.push('itinerary-finished');return{trip:{countryCode:'JP'}}},
 window:{history:{pushState:()=>{}}}
 };
 const hook=new Function(...Object.keys(mocks),`${source};return useTrip();`)(...Object.values(mocks));
 await hook.submitTrip('synthetic Tokyo trip');
 assert.ok(events.indexOf('packing')<events.indexOf('itinerary-finished'));
 assert.ok(events.indexOf('safety')<events.indexOf('itinerary-finished'));
 assert.equal(events.filter(e=>e==='packing').length,1);
 assert.equal(events.filter(e=>e==='safety').length,1);
});

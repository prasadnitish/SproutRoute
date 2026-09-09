import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinatesFor,pointsFromActivities,googleMapsEmbedUrl,googleMapsOpenUrl,routeMetrics} from '../../src/frontend/src/utils/mapGeometry.js';
test('daily map retains named stops without coordinates in itinerary order',()=>{
 const points=pointsFromActivities([{name:'Tsukiji Outer Market',stopName:'Tokyo'},{name:'Hamarikyu Gardens',stopName:'Tokyo'},{name:'Sensoji',stopName:'Tokyo'}]);
 const embed=new URL(googleMapsEmbedUrl(points,{name:'Tokyo',lat:35,lon:139}));
 assert.equal(embed.searchParams.get('saddr'),'Tsukiji Outer Market, Tokyo');
 assert.equal(embed.searchParams.get('daddr'),'Hamarikyu Gardens, Tokyo to:Sensoji, Tokyo');
 const open=new URL(googleMapsOpenUrl(points,{name:'Tokyo'}));
 assert.equal(open.searchParams.get('origin'),'Tsukiji Outer Market, Tokyo');
 assert.equal(open.searchParams.get('destination'),'Sensoji, Tokyo');
 assert.equal(open.searchParams.get('waypoints'),'Hamarikyu Gardens, Tokyo');
});
test('mixed coordinates do not drop named stops and unknown geometry makes no efficiency claim',()=>{
 const p=pointsFromActivities([{name:'A',lat:35,lon:139},{name:'B'}]);
 assert.match(decodeURIComponent(googleMapsOpenUrl(p,{name:'Kyoto'})),/B/);
 assert.equal(routeMetrics(p).backtrackingLabel,null);
 assert.equal(coordinatesFor({lat:'',lon:''}),null);
 assert.equal(coordinatesFor({lat:100,lon:200}),null);
});

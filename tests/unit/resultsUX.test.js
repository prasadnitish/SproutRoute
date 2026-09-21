import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {build} from '../../src/frontend/node_modules/esbuild/lib/main.js';
const bundled=await build({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import Results from './src/screens/ResultsScreen.jsx';import Packing from './src/components/PackingChecklist.jsx';export const renderPlan=(props)=>renderToStaticMarkup(React.createElement(Results,props));export const renderPacking=(packingList)=>renderToStaticMarkup(React.createElement(Packing,{packingList}));`,resolveDir:fileURLToPath(new URL('../../src/frontend/',import.meta.url))},bundle:true,write:false,format:'cjs',platform:'node',define:{'import.meta.env':'{}'},jsx:'automatic'});
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const ui=module.exports;
test('plan exposes existing safety guidance and route weather without opening another tab',()=>{
 const html=ui.renderPlan({tripData:{routePlan:{title:'Japan',stops:[{id:'tokyo',name:'Tokyo'}]},stopWeather:{tokyo:{forecast:[{date:'2026-12-01',high:55,low:40,condition:'Clear'}]}}},safetyData:{source:'ai-generated',healthTips:['Existing location safety tip'],localCustoms:[]},parsedInput:{destination:'Japan'}});
 assert.match(html,/Existing location safety tip/);
 assert.match(html,/View all safety tips/);
 assert.doesNotMatch(html,/Weather data unavailable/);
});
test('packing does not advertise shopping for documents saved by older versions',()=>{
 const html=ui.renderPacking({categories:[{name:'Documents',items:[{name:'IDs and passports',shopLinks:[{store:'Amazon',url:'https://amazon.com'}]}]}]});
 assert.doesNotMatch(html,/Shop for IDs and passports/);
});
test('generation failures stay visible after the results screen opens',()=>{
 assert.match(ui.renderPlan({tripData:{},error:'Stop location not found',parsedInput:{destination:'Japan'}}),/Stop location not found/);
});

/** Synthetic, no-fallback comparison against the production prompt. Run with provider keys in env. */
import { writeFile, mkdir } from 'node:fs/promises';
import { buildTripPlanPrompt } from '../services/tripPlanAI.js';
const cases = [{city:'Tokyo',days:3,children:[]},{city:'Kyoto',days:3,children:[{age:4},{age:8}]},{city:'Tokyo',days:6,children:[]}];
const models = ['gpt-5.4-nano','gemini-3.8-flash','gemini-3.5-flash-lite'];
const results=[];
await mkdir('/tmp/sproutroute-audit',{recursive:true});
for (const scenario of cases) {
 const prompt=buildTripPlanPrompt(scenario.city,'2026-12-01',`2026-12-0${scenario.days}`,[],scenario.children,{forecast:[]},{countryCode:'JP'});
 await Promise.all(models.map(async model=>{
 const started=Date.now(); let row={model,city:scenario.city,days:scenario.days,children:scenario.children.length};
 try {
 const google=model.startsWith('gemini');
 const url=google?`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`:'https://api.openai.com/v1/chat/completions';
 const body=google?{systemInstruction:{parts:[{text:prompt.system}]},contents:[{role:'user',parts:[{text:prompt.user}]}],generationConfig:{maxOutputTokens:16384,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'low'}}}:{model,temperature:0,max_completion_tokens:16384,response_format:{type:'json_object'},messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]};
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(google?{'x-goog-api-key':process.env.GOOGLE_GEMINI_API_KEY}:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`})},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const data=await response.json();
 if(!response.ok) throw new Error(`${response.status} ${data.error?.status || data.error?.code || 'provider error'}`);
 const raw=google?data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''):data.choices?.[0]?.message?.content;
 row.ms=Date.now()-started; row.finishReason=google?data.candidates?.[0]?.finishReason:data.choices?.[0]?.finish_reason;row.usage=google?data.usageMetadata:data.usage;
 let plan;try{plan=JSON.parse(raw);}catch{throw new Error('Invalid JSON');}
 const acts=plan.suggestedActivities||[], days=plan.dailyItinerary||[];const ids=new Set(acts.map(a=>String(a.id)));
 const refs=days.flatMap(d=>d.activities||[]).map(String);
 await writeFile(`/tmp/sproutroute-audit/${model}-${scenario.city}-${scenario.days}.json`,JSON.stringify(plan,null,2));
 row={...row,validJSON:true,actualDays:days.length,activities:acts.length,complete:days.length===scenario.days&&days.every(d=>d.activities?.length>=2)&&refs.every(id=>ids.has(id)),uniqueIds:ids.size===acts.length,repeatedActivityRefs:refs.length-new Set(refs).size,mealDays:days.filter(d=>d.meals?.dinner?.name).length,sampleNames:acts.slice(0,4).map(a=>a.name)};
 }catch(error){row={...row,ms:Date.now()-started,error:error.message};}
 results.push(row); console.log(JSON.stringify(row));
 }));
}
await writeFile(process.argv[2]||'/tmp/sproutroute-benchmark.json',JSON.stringify({at:new Date().toISOString(),notes:'One sample per case; no fallback; max tokens 16384; low thinking for Gemini; structural quality only, not venue verification',results},null,2));

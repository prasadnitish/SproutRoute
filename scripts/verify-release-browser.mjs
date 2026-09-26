// One real, paid synthetic browser trip against the deployed app. No account sign-in.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = new URL('../docs/brag-sproutroute-2026-09-26/evidence/', import.meta.url);
await mkdir(dir,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const evidence = {synthetic:true,startedAt:new Date().toISOString(),requests:[],errors:[]};
let streamBody;
page.on('pageerror',e=>evidence.errors.push(e.message));
page.on('response',r=>{
  const url=new URL(r.url());
  if(url.hostname==='sproutroute.app' && url.pathname.startsWith('/api/'))evidence.requests.push({path:url.pathname,status:r.status()});
  if(url.pathname.endsWith('/trip/stream'))streamBody=r.text();
});
try {
  await page.goto('https://sproutroute.app');
  await page.locator('textarea').fill('A two-day trip to Las Vegas with two adults and our 6-year-old, October 10 to October 11, 2026. Museums and gardens.');
  const start=performance.now();
  const parsedResponse=page.waitForResponse(r=>r.url().includes('/trip/parse-input'));
  await page.getByRole('button',{name:/plan it/i}).click();
  const parsed=await (await parsedResponse).json();
  evidence.parse={destination:parsed.destination,suggestions:parsed.suggestedDestinations?.length||0,ms:Math.round(performance.now()-start)};
  if(!/las vegas/i.test(parsed.destination||'') || parsed.suggestedDestinations?.length)throw new Error('Explicit destination regression');
  await page.getByRole('heading',{level:2,name:/Las Vegas/i}).waitFor({timeout:45000});
  evidence.firstResultMs=Math.round(performance.now()-start);
  await page.getByText('Itinerary',{exact:true}).first().waitFor({timeout:180000});
  await page.locator('text=/Day 1 route/').first().waitFor({timeout:180000});
  evidence.itineraryMs=Math.round(performance.now()-start);
  const sse=await streamBody;
  const events=sse.split('\n\n').filter(Boolean).map(block=>{
    const event=block.match(/^event: (.+)$/m)?.[1];
    const data=JSON.parse(block.match(/^data: (.+)$/m)?.[1]||'{}');
    return {event,days:data.tripPlan?.dailyItinerary?.length||0};
  });
  evidence.sse=events;
  if(!events.some(x=>x.event==='done') || events.some(x=>x.event==='error') || events.reduce((sum,x)=>sum+x.days,0)!==2)throw new Error('Stream did not complete two itinerary days');
  await page.waitForTimeout(1000);
  evidence.pageText=await page.locator('main').innerText().catch(()=>page.locator('body').innerText());
  await page.screenshot({path:new URL('production-vegas.png',dir).pathname});
  evidence.pass=true;
}catch(e){evidence.pass=false;evidence.error=e.message;await page.screenshot({path:new URL('production-failure.png',dir).pathname});process.exitCode=1;}
finally{await writeFile(new URL('production-browser.json',dir),JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,pageText:undefined}));await browser.close();}

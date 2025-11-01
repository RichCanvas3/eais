"use strict";(()=>{var e={};e.id=558,e.ids=[558],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},15085:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>m,patchFetch:()=>g,requestAsyncStorage:()=>d,routeModule:()=>l,serverHooks:()=>h,staticGenerationAsyncStorage:()=>c});var a={};r.r(a),r.d(a,{POST:()=>u,dynamic:()=>p});var o=r(17370),n=r(35317),s=r(2579),i=r(26567);let p="force-dynamic";async function u(e){try{let t=await e.json(),r=t.nodes,a=t.edges,o=t.width||600,n=t.height||400;if(!r||!Array.isArray(r))return i.NextResponse.json({error:"Missing nodes array"},{status:400});let s=process.env.OPENAI_API_KEY;if(!s)return i.NextResponse.json({error:"OPENAI_API_KEY not configured"},{status:400});let p={nodes:r.map(e=>({id:e.id,label:e.label})),edges:a?.map(e=>({from:e.from,to:e.to,weight:e.weight}))||[],canvasSize:{width:o,height:n}},u=`You are a graph layout expert. Given this trust graph, generate optimal 2D coordinates for each node to create a clear, well-spread visualization.

Graph data:
${JSON.stringify(p,null,2)}

Requirements:
- Spread nodes evenly across the ${o}x${n} canvas
- Keep connected nodes reasonably close but not overlapping
- Central/important nodes (with many connections) should be more central
- Avoid node overlap (min 40px spacing)
- Keep all nodes within bounds with 30px margin

Respond ONLY with JSON in this exact format:
{
  "layout": [
    {"id": "node_id", "x": number, "y": number},
    ...
  ]
}`,l=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:[{role:"system",content:"You are a graph visualization expert. Respond only with valid JSON."},{role:"user",content:u}],temperature:.3})});if(!l.ok){let e=await l.text().catch(()=>"");return i.NextResponse.json({error:`OpenAI error: ${l.status} ${e}`},{status:500})}let d=await l.json(),c=(d?.choices?.[0]?.message?.content||"").match(/\{[\s\S]*"layout"[\s\S]*\}/);if(!c)return i.NextResponse.json({error:"Invalid layout response from AI"},{status:500});let h=JSON.parse(c[0]).layout||[];return i.NextResponse.json({layout:h})}catch(e){return i.NextResponse.json({error:e?.message||"Unexpected error"},{status:500})}}let l=new o.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/graph-layout/route",pathname:"/api/graph-layout",filename:"route",bundlePath:"app/api/graph-layout/route"},resolvedPagePath:"/home/barb/erc8004/erc-8004-identity-indexer/apps/web/app/api/graph-layout/route.ts",nextConfigOutput:"",userland:a}),{requestAsyncStorage:d,staticGenerationAsyncStorage:c,serverHooks:h}=l,m="/api/graph-layout/route";function g(){return(0,s.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:c})}}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),a=t.X(0,[910,145],()=>r(15085));module.exports=a})();
"use strict";(()=>{var e={};e.id=525,e.ids=[525],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},77623:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>m,patchFetch:()=>g,requestAsyncStorage:()=>d,routeModule:()=>u,serverHooks:()=>h,staticGenerationAsyncStorage:()=>p});var s={};r.r(s),r.d(s,{POST:()=>l,dynamic:()=>c});var n=r(17370),a=r(35317),i=r(2579),o=r(26567);let c="force-dynamic";async function l(e){try{let t=await e.json().catch(()=>({})),r=String(t?.query??"").trim(),s=Array.isArray(t?.agents)?t.agents:[];if(!r)return o.NextResponse.json({error:"Missing query"},{status:400});if(!s.length)return o.NextResponse.json({matches:[]});let n=process.env.OPENAI_API_KEY;if(!n)return o.NextResponse.json({error:"OPENAI_API_KEY not configured"},{status:400});let a=s.slice(0,200).map(e=>({...e,card:(e.agentName,null)})),i=process.env.OPENAI_MODEL||"gpt-4o-mini",c=function(e,t){let r=`You are a trust and routing assistant. Given a user query and a list of agents (with names, descriptions, and skills from their agent cards), analyze each agent and return:
1. The IDs of agents that best match the query (sorted by relevance)
2. A trust score (0-100) for each matched agent based on:
   - Quality and sentiment of feedback mentioned in their descriptions
   - Strength and credibility of their relationship network
   - Consistency and reliability indicators
   - Relevance and specificity of their skills to the query

Respond ONLY with JSON in the exact shape: 
{
  "matches": [
    { "agentId": "<id>", "trustScore": <0-100>, "reasoning": "<brief explanation>" },
    ...
  ]
}

CRITICAL Guidelines:
- ONLY include agents whose skills directly match or are relevant to the query
- If an agent's skills don't fit the query, EXCLUDE them completely from results
- Prefer agents with specific, well-documented skills that address the query
- Higher trust scores for agents with positive feedback, strong relationships, credible networks, AND relevant skills
- Include up to 10 matches. If none fit, return an empty array
- Do not add commentary or code blocks, just JSON`,s=t.map((e,t)=>{let r=[`#${t+1} id=${e.agentId} name=${e.agentName}`,`Description (includes feedback & trust graph):
${(e.description||"No description available").toString()}`];if(e.card?.skills&&e.card.skills.length>0){let t=e.card.skills.map((e,t)=>{let r=[`  Skill ${t+1}:`];return e.name&&r.push(`    Name: ${e.name}`),e.description&&r.push(`    Description: ${e.description}`),e.tags&&e.tags.length>0&&r.push(`    Tags: ${e.tags.join(", ")}`),e.examples&&e.examples.length>0&&r.push(`    Examples: ${e.examples.join("; ")}`),r.join("\n")}).join("\n");r.push(`Skills:
${t}`)}else r.push("Skills: None documented");return r.join("\n")}).join("\n\n");return`${r}

User Query:
${e}

Agents:
${s}`}(r,a),l=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${n}`},body:JSON.stringify({model:i,messages:[{role:"system",content:"You are a helpful assistant that responds with strict JSON only."},{role:"user",content:c}],temperature:0})});if(!l.ok){let e=await l.text().catch(()=>"");return o.NextResponse.json({error:`OpenAI error: ${l.status} ${e}`},{status:500})}let u=await l.json(),d=u?.choices?.[0]?.message?.content??"",p=(function(e){try{let t=JSON.parse(e);if(t&&Array.isArray(t.matches))return t.matches.map(e=>({agentId:String(e.agentId||e),trustScore:"number"==typeof e.trustScore?e.trustScore:50,reasoning:e.reasoning||void 0})).filter(e=>e.agentId)}catch{}let t=e.match(/\{[\s\S]*\}/);if(t)try{let e=JSON.parse(t[0]);if(e&&Array.isArray(e.matches))return e.matches.map(e=>({agentId:String(e.agentId||e),trustScore:"number"==typeof e.trustScore?e.trustScore:50,reasoning:e.reasoning||void 0})).filter(e=>e.agentId)}catch{}return[]})(d).slice(0,50);return o.NextResponse.json({matches:p})}catch(e){return o.NextResponse.json({error:e?.message||"Unexpected error"},{status:500})}}let u=new n.AppRouteRouteModule({definition:{kind:a.x.APP_ROUTE,page:"/api/discover/route",pathname:"/api/discover",filename:"route",bundlePath:"app/api/discover/route"},resolvedPagePath:"/home/barb/erc8004/erc-8004-identity-indexer/apps/web/app/api/discover/route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:d,staticGenerationAsyncStorage:p,serverHooks:h}=u,m="/api/discover/route";function g(){return(0,i.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:p})}}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[910,145],()=>r(77623));module.exports=s})();
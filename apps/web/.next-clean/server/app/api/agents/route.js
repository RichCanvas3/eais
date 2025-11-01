"use strict";(()=>{var e={};e.id=529,e.ids=[529],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},19018:(e,t,n)=>{n.r(t),n.d(t,{originalPathname:()=>h,patchFetch:()=>I,requestAsyncStorage:()=>u,routeModule:()=>c,serverHooks:()=>m,staticGenerationAsyncStorage:()=>l});var r={};n.r(r),n.d(r,{GET:()=>p,dynamic:()=>g});var a=n(17370),o=n(35317),s=n(2579),i=n(26567);let g="force-dynamic";async function d(e,t={}){let n=process.env.GRAPHQL_API_URL||process.env.NEXT_PUBLIC_GRAPHQL_API_URL;try{if(console.info("++++++++++++++++++++ queryGraphQL: GRAPHQL_URL",n),!n)return console.warn("No GRAPHQL_URL configured"),null;let r=await fetch(n,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,variables:t})});if(!r.ok)return console.error(`GraphQL request failed: ${r.status} ${r.statusText}`),null;let a=await r.json();if(a.errors)return console.error("GraphQL errors:",a.errors),null;return a.data}catch(e){return console.error("GraphQL fetch error:",e?.message||e),null}}async function p(e){try{let{searchParams:t}=new URL(e.url),n=Math.max(1,parseInt(t.get("page")||"1",10)),r=Math.max(1,Math.min(100,parseInt(t.get("pageSize")||"50",10))),a=(n-1)*r,o=(t.get("name")||"").trim(),s=(t.get("id")||"").trim(),g=(t.get("address")||"").trim(),p=t.get("chainId"),c={limit:r,offset:a};p&&(c.chainId=parseInt(p)),s&&(c.agentId=s),g&&(c.agentOwner=g.toLowerCase()),o&&(c.agentName=o.toLowerCase());let u=`
      query GetAgents($chainId: Int, $agentId: String, $agentOwner: String, $agentName: String, $limit: Int, $offset: Int) {
        agents(chainId: $chainId, agentId: $agentId, agentOwner: $agentOwner, agentName: $agentName, limit: $limit, offset: $offset) {
          chainId
          agentId
          agentAddress
          agentOwner
          agentName
          description
          image
          a2aEndpoint
          ensEndpoint
          agentAccountEndpoint
          supportedTrust
          rawJson
          metadataURI
          createdAtBlock
          createdAtTime
        }
      }
    `,l=await d(u,c);if(!l)return i.NextResponse.json({rows:[],total:0,page:n,pageSize:r});let m=l.agents||[],h=`
      query GetAgentsCount($chainId: Int, $agentId: String, $agentOwner: String, $agentName: String) {
        agents(chainId: $chainId, agentId: $agentId, agentOwner: $agentOwner, agentName: $agentName, limit: 10000, offset: 0) {
          agentId
        }
      }
    `,I=await d(h,c),f=I?.agents?.length||m.length;return i.NextResponse.json({rows:m,total:f,page:n,pageSize:r})}catch(e){return console.error("API error:",e),i.NextResponse.json({rows:[],total:0,page:1,pageSize:50})}}let c=new a.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/agents/route",pathname:"/api/agents",filename:"route",bundlePath:"app/api/agents/route"},resolvedPagePath:"/home/barb/erc8004/erc-8004-identity-indexer/apps/web/app/api/agents/route.ts",nextConfigOutput:"",userland:r}),{requestAsyncStorage:u,staticGenerationAsyncStorage:l,serverHooks:m}=c,h="/api/agents/route";function I(){return(0,s.patchFetch)({serverHooks:m,staticGenerationAsyncStorage:l})}}};var t=require("../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),r=t.X(0,[910,145],()=>n(19018));module.exports=r})();
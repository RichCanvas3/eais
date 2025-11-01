"use strict";(()=>{var e={};e.id=666,e.ids=[666],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},97678:(e,t,n)=>{n.r(t),n.d(t,{originalPathname:()=>I,patchFetch:()=>m,requestAsyncStorage:()=>g,routeModule:()=>c,serverHooks:()=>h,staticGenerationAsyncStorage:()=>l});var r={};n.r(r),n.d(r,{GET:()=>u,dynamic:()=>d});var a=n(17370),s=n(35317),o=n(2579),i=n(26567);let d="force-dynamic";async function p(e,t={}){let n=process.env.GRAPHQL_API_URL||process.env.NEXT_PUBLIC_GRAPHQL_API_URL||"https://erc8004-indexer-graphql.richardpedersen3.workers.dev/graphql";try{if(!n)return console.warn("No GRAPHQL_URL configured"),null;let r=await fetch(n,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,variables:t})});if(!r.ok)return console.error(`GraphQL request failed: ${r.status} ${r.statusText}`),null;let a=await r.json();if(a.errors)return console.error("GraphQL errors:",a.errors),null;return a.data}catch(e){return console.error("GraphQL fetch error:",e?.message||e),null}}async function u(e,{params:t}){try{let n=String(t.agentId),{searchParams:r}=new URL(e.url),a=r.get("chainId");if(a){let e=`
        query GetAgent($chainId: Int!, $agentId: String!) {
          agent(chainId: $chainId, agentId: $agentId) {
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
      `,t=await p(e,{chainId:parseInt(a),agentId:n});if(!t||!t.agent)return i.NextResponse.json({error:"Not found"},{status:404});return i.NextResponse.json(t.agent)}{let e=`
        query GetAgents($agentId: String!) {
          agents(agentId: $agentId, limit: 1, offset: 0) {
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
      `,t=await p(e,{agentId:n});if(!t||!t.agents||0===t.agents.length)return i.NextResponse.json({error:"Not found"},{status:404});return i.NextResponse.json(t.agents[0])}}catch(e){return console.error("Agent API error:",e),i.NextResponse.json({error:e?.message||"Failed"},{status:500})}}let c=new a.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/agents/[agentId]/route",pathname:"/api/agents/[agentId]",filename:"route",bundlePath:"app/api/agents/[agentId]/route"},resolvedPagePath:"/home/barb/erc8004/erc-8004-identity-indexer/apps/web/app/api/agents/[agentId]/route.ts",nextConfigOutput:"",userland:r}),{requestAsyncStorage:g,staticGenerationAsyncStorage:l,serverHooks:h}=c,I="/api/agents/[agentId]/route";function m(){return(0,o.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:l})}}};var t=require("../../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),r=t.X(0,[910,145],()=>n(97678));module.exports=r})();
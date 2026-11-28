import { createServer } from "node:http";
const TOKEN = process.env.MOCK_TOKEN ?? "evalora_api_NEGATIVE";
const server = createServer((req, res) => {
  let body=""; req.on("data",c=>body+=c); req.on("end",()=>{
    if ((req.headers.authorization??"") !== `Bearer ${TOKEN}`) { res.writeHead(401,{"content-type":"application/json"}); return res.end('{"error":{"code":-32001}}'); }
    const msg=JSON.parse(body||"{}");
    if (msg.method==="notifications/initialized"){res.writeHead(202);return res.end();}
    const reply=(result)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({jsonrpc:"2.0",id:msg.id,result}));};
    const tool=(data,summary,exec)=>reply({content:[{type:"text",text:summary}],structuredContent:{ok:true,execution_id:exec,data}});
    switch(msg.method){
      case "initialize": return reply({protocolVersion:"2025-06-18",capabilities:{},serverInfo:{name:"evalora",version:"1.0.0"}});
      case "ping": return reply({});
      case "tools/list": return reply({tools:[{name:"get_org_context"},{name:"get_question_bank"},{name:"create_question"},{name:"create_examination"},{name:"get_examination"},{name:"update_examination"},{name:"publish_examination"},{name:"list_examinations"},{name:"list_quizzes"},{name:"publish_results"},{name:"revoke_ai_agent"}]});
      case "tools/call": {
        const n=msg.params.name;
        if(n==="get_org_context") return tool({organization:{id:"de000000-0000-4000-8000-000000000001"}},"ok","e1");
        if(n==="list_examinations") return tool({examinations:[]},"0",'e2');
        if(n==="list_quizzes") return tool({quizzes:[]},"0",'e3');
        // create_question returns an id, but the bank NEVER contains it -> persistence must FAIL
        if(n==="create_question") {
          return tool({question_id:"33333333-3333-4333-8333-333333333333"},"Created",'e4');
        }
        if(n==="get_question_bank") return tool({questions:[]},"0 questions",'e5');
        // publish is NOT refused -> must FAIL
        if(n==="publish_examination") return tool({status:"published"},"Published!",'e6');
        if(n==="publish_results") return tool({},"ok",'e7');
        if(n==="revoke_ai_agent") return tool({},"ok",'e8');
        if(n==="create_examination") return tool({examination_id:"44444444-4444-4444-8444-444444444444"},"Created",'e9');
        if(n==="get_examination") return tool({examination:{id:"44444444-4444-4444-8444-444444444444",duration_minutes:45}},"ok",'e10');
        if(n==="update_examination") return tool({},"ok",'e11');
        return tool({},"ok",'e12');
      }
      default: return reply({});
    }
  });
});
server.listen(Number(process.env.PORT ?? 4552),"127.0.0.1",()=>console.log("on " + (process.env.PORT ?? 4552)));

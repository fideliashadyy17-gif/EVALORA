import { createServer } from "node:http";
const TOKEN = process.env.MOCK_TOKEN ?? "evalora_api_TESTTOKENDOESNOTEXIST";
const created = { question_id: "11111111-1111-4111-8111-111111111111", examination_id: "22222222-2222-4222-8222-222222222222" };
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { code: -32001, message: "unauthenticated" } }));
    }
    const msg = JSON.parse(body || "{}");
    if (msg.method === "notifications/initialized") { res.writeHead(202); return res.end(); }
    const reply = (result) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })); };
    const tool = (data, summary, exec) => reply({ content: [{ type: "text", text: summary }], structuredContent: { ok: true, execution_id: exec, data } });
    switch (msg.method) {
      case "initialize": return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "evalora", version: "1.0.0" } });
      case "ping": return reply({});
      case "tools/list": return reply({ tools: [
        { name: "get_org_context" }, { name: "list_examinations" }, { name: "get_question_bank" }, { name: "list_quizzes" },
        { name: "create_question" }, { name: "create_examination" }, { name: "get_examination" }, { name: "update_examination" },
        { name: "publish_examination" }, { name: "publish_results" }, { name: "revoke_ai_agent" },
      ]});
      case "tools/call": {
        const n = msg.params.name;
        if (n === "get_org_context") return tool({ organization: { id: "de000000-0000-4000-8000-000000000001", name: "Demo Academy" }, plan: {}, modules: [] }, "ok", "exec-1");
        if (n === "list_examinations") return tool({ examinations: [] }, "Found 0 examination(s).", "exec-2");
        if (n === "get_question_bank") return tool({ questions: [{ id: created.question_id }] }, "1 question", "exec-3");
        if (n === "list_quizzes") return tool({ quizzes: [] }, "0 quizzes", "exec-4");
        if (n === "create_question") return tool({ question_id: created.question_id }, "Created draft question", "exec-5");
        if (n === "create_examination") return tool({ examination_id: created.examination_id, status: "draft" }, "Created draft examination", "exec-6");
        if (n === "get_examination") return tool({ examination: { id: created.examination_id, duration_minutes: 45 } }, "examination", "exec-7");
        if (n === "get_question_bank") return tool({ questions: [{ id: created.question_id }] }, "1 question", "exec-3");
        if (n === "update_examination") return tool({ examination_id: created.examination_id }, "updated", "exec-8");
        return reply({ isError: true, content: [{ type: "text", text: 'You do not have the "results.publish" permission, which "Publish examination" requires.' }], structuredContent: { ok: false, code: "permission_denied", execution_id: "exec-deny" } });
      }
      default: return reply({});
    }
  });
});
server.listen(Number(process.env.PORT ?? 4551), "127.0.0.1", () => console.log("on " + (process.env.PORT ?? 4551)));

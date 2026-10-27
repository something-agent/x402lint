/** Minimal remote MCP server (Streamable HTTP, stateless, JSON responses). */
import { handlers, BadRequest } from "./handlers";
import { Ctx } from "./lint";

export const TOOLS = [
  { name: "lint_x402_endpoint", description: "Unpaid lint of an x402 endpoint: fetches the 402 (GET and POST), then checks the challenge (version, accepts[] fields, CAIP-2 network, payTo/asset/amount sanity, EIP-712 name/version, timeouts, resource), transport (redirects, cache headers, CORS) and discovery files. Returns findings with ids, severities and fixes. Never pays. Free.", inputSchema: { type: "object", properties: { url: { type: "string", description: "The paid x402 URL" }, method: { type: "string", enum: ["auto", "GET", "POST"], description: "Default auto: tries both" } }, required: ["url"] } },
  { name: "lint_payment_required", description: "Lint a PaymentRequired object you already have (decoded JSON, a JSON string, or the raw base64 PAYMENT-REQUIRED header). Same field/value checks as lint_x402_endpoint, no network access. Free.", inputSchema: { type: "object", properties: { payment_required: { description: "Object, JSON string, or base64 header value" }, url: { type: "string", description: "Optional: the URL it was served from, to check resource.url" } }, required: ["payment_required"] } },
] as const;
const NAME_TO_HANDLER: Record<string, keyof typeof handlers> = { lint_x402_endpoint: "lint_endpoint", lint_payment_required: "lint_payment_required" };
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26"];

export async function handleMcp(msg: any, ctx: Ctx, version: string): Promise<any | null> {
  const id = msg?.id;
  const reply = (result: any) => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return error(-32600, "Invalid Request");
  if (id === undefined) return null;
  switch (msg.method) {
    case "initialize": {
      const want = msg.params?.protocolVersion;
      return reply({ protocolVersion: SUPPORTED.includes(want) ? want : SUPPORTED[1], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "x402lint", title: "x402lint - unpaid-path linter for x402 endpoints", version }, instructions: "Free, read-only lint of an x402 endpoint's unpaid 402 path. Never pays or signs; it cannot test settlement." });
    }
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name);
      const h = NAME_TO_HANDLER[name];
      if (!h) return error(-32602, `Unknown tool: ${name}`);
      try {
        const out = await (handlers[h] as any)(msg.params?.arguments ?? {}, ctx);
        return reply({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        const m = e instanceof BadRequest ? (e as Error).message : `tool failed: ${(e as Error).message}`;
        return reply({ content: [{ type: "text", text: m }], isError: true });
      }
    }
    default: return error(-32601, `Method not found: ${msg.method}`);
  }
}

import { describe, expect, it } from "vitest";
import { buildApp, limited } from "../src/app";
import { b64, GOOD_PR, stubFetch } from "./helpers";

const B = "https://x402lint.test";
const H = "https://api.example.com/data";
const paid = () => stubFetch([(u: string, i?: RequestInit) => u === H && i?.method !== "OPTIONS" ? new Response(JSON.stringify(GOOD_PR()), { status: 402, headers: { "content-type": "application/json", "payment-required": b64(GOOD_PR()) } }) : undefined]);
const mk = () => { const s = paid(); return { app: buildApp({ fetchImpl: s.f }), ...s }; };
const post = (app: any, path: string, body: unknown, ip = "1.1.1.1") => app.request(B + path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "cf-connecting-ip": ip } });
const rpc = (app: any, msg: any, ip = "3.3.3.3") => post(app, "/mcp", msg, ip);

describe("docs & discovery", () => {
  it("serves landing, llms.txt, openapi, rules, card, catalog, health", async () => {
    const { app } = mk();
    expect((await app.request(B + "/")).status).toBe(200);
    expect(await (await app.request(B + "/llms.txt")).text()).toContain("# x402lint");
    expect(((await (await app.request(B + "/openapi.json")).json()) as any).paths["/v1/lint"]).toBeTruthy();
    expect(((await (await app.request(B + "/v1/rules")).json()) as any).rules.length).toBeGreaterThan(20);
    const card: any = await (await app.request(B + "/.well-known/mcp-server-card.json")).json();
    expect(card.remotes[0].url).toBe(B + "/mcp"); expect(card.name).toBe("io.github.something-agent/x402lint");
    expect(((await (await app.request(B + "/.well-known/ai-catalog.json")).json()) as any).entries.length).toBe(3);
    expect(((await (await app.request(B + "/health")).json()) as any).service).toBe("x402lint");
    expect((await app.request(B + "/nope")).status).toBe(404);
    expect((await app.request(B + "/health", { headers: { origin: "https://x.example" } })).headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("HTTP API", () => {
  it("GET /v1/directories and /v1/lint?directories=1", async () => {
    const { app } = mk();
    const r: any = await (await app.request(B + "/v1/directories?url=" + encodeURIComponent(H), { headers: { "cf-connecting-ip": "7.7.7.7" } })).json();
    const dash = r.directories.find((d: any) => d.directory === "x402dash");
    expect(dash.status).toBe("ready");
    const sc = r.directories.find((d: any) => d.directory === "x402scan");
    expect(sc.status).toBe("not_ready"); // no openapi / well-known in the stub
    const l: any = await (await app.request(B + "/v1/lint?directories=1&url=" + encodeURIComponent(H), { headers: { "cf-connecting-ip": "7.7.7.8" } })).json();
    expect(l.directories).toHaveLength(4);
    const plain: any = await (await app.request(B + "/v1/lint?url=" + encodeURIComponent(H), { headers: { "cf-connecting-ip": "7.7.7.9" } })).json();
    expect(plain.directories).toBeUndefined();
  });
  it("GET /v1/lint", async () => {
    const { app } = mk();
    const r = await app.request(B + "/v1/lint?url=" + encodeURIComponent(H), { headers: { "cf-connecting-ip": "2.2.2.2" } });
    const j: any = await r.json(); expect(r.status).toBe(200); expect(j.verdict).toBe("ok"); expect(j.summary.prices).toEqual(["0.01 USDC"]);
    expect(j.scope).toBe("unpaid_path_only"); expect(j.paid_path_checks[0].id).toBe("P001");
    const pr: any = await (await post(app, "/v1/lint/payment-required", { payment_required: GOOD_PR() }, "5.5.5.5")).json();
    expect(pr.scope).toBe("unpaid_path_only"); expect(pr.paid_path_checks.length).toBe(4);
    expect(await (await app.request(B + "/llms.txt")).text()).toMatch(/jq -e/);
  });
  it("validates input", async () => {
    const { app } = mk();
    expect((await app.request(B + "/v1/lint", { headers: { "cf-connecting-ip": "4.4.4.4" } })).status).toBe(400);
    expect((await app.request(B + "/v1/lint?url=https://localhost/x", { headers: { "cf-connecting-ip": "4.4.4.4" } })).status).toBe(400);
    expect((await app.request(B + "/v1/lint?url=" + encodeURIComponent(H) + "&method=PUT", { headers: { "cf-connecting-ip": "4.4.4.4" } })).status).toBe(400);
    expect((await post(app, "/v1/lint/payment-required", "{bad", "4.4.4.4")).status).toBe(400);
    expect((await post(app, "/v1/lint/payment-required", {}, "4.4.4.4")).status).toBe(400);
    expect((await post(app, "/v1/lint/payment-required", { payment_required: "!!!" }, "4.4.4.4")).status).toBe(400);
  });
  it("POST /v1/lint/payment-required accepts object, JSON string, and base64 header", async () => {
    const { app } = mk();
    const bad = GOOD_PR({ accepts: [{ ...GOOD_PR().accepts[0], amount: "0.01" }] });
    for (const pr of [bad, JSON.stringify(bad), b64(bad)]) {
      const j: any = await (await post(app, "/v1/lint/payment-required", { payment_required: pr }, "5.5.5.5")).json();
      expect(j.verdict).toBe("fail"); expect(j.findings[0].id).toBe("X115"); expect(j.counts.error).toBe(1);
    }
  });
  it("upstream fetch budget and failures don't crash", async () => {
    const app = buildApp({ fetchImpl: (async () => { throw new Error("boom"); }) as any });
    const r = await app.request(B + "/v1/lint?url=" + encodeURIComponent(H), { headers: { "cf-connecting-ip": "6.6.6.6" } });
    expect(r.status).toBe(200); expect(((await r.json()) as any).verdict).toBe("fail");
  });
  it("rate limiter", () => {
    expect(limited("z", 6, 1000, 12)).toBe(false); expect(limited("z", 6, 1001, 12)).toBe(false); expect(limited("z", 6, 1002, 12)).toBe(true); expect(limited("z", 6, 70_000, 12)).toBe(false);
  });
});

describe("MCP", () => {
  it("initialize, tools/list, tools/call (both tools), errors", async () => {
    const { app } = mk();
    const init: any = await (await rpc(app, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(init.result.serverInfo.name).toBe("x402lint");
    const list: any = await (await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(list.result.tools.map((t: any) => t.name)).toEqual(["lint_x402_endpoint", "check_directory_readiness", "lint_payment_required"]);
    const cd: any = await (await rpc(app, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "check_directory_readiness", arguments: { url: H } } })).json();
    expect(cd.result.structuredContent.directories.map((d: any) => d.directory)).toEqual(["x402dash", "x402scan", "the402", "Bazaar (CDP / PayAI)"]);
    const call: any = await (await rpc(app, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "lint_x402_endpoint", arguments: { url: H } } })).json();
    expect(call.result.isError).toBe(false); expect(call.result.structuredContent.verdict).toBe("ok");
    const call2: any = await (await rpc(app, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "lint_payment_required", arguments: { payment_required: b64(GOOD_PR()) } } })).json();
    expect(call2.result.structuredContent.verdict).toBe("ok");
    const bad: any = await (await rpc(app, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "lint_x402_endpoint", arguments: {} } })).json();
    expect(bad.result.isError).toBe(true);
    const unk: any = await (await rpc(app, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } })).json();
    expect(unk.error.code).toBe(-32602);
    expect((await rpc(app, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await app.request(B + "/mcp")).status).toBe(405);
    expect((await post(app, "/mcp", "{bad", "7.7.7.7")).status).toBe(400);
  });
});

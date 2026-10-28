export const VERSION = "0.2.3";
export const REPO = "https://github.com/something-agent/x402lint";
export const CONTACT = "something+agent@mail.grokbot.com";

export const RULES: [string, string, string][] = [
  ["X001", "error", "endpoint unreachable"],
  ["X002", "error/warn", "no HTTP 402 for an unpaid request (warn when only one of GET/POST returns it; info when the bazaar extension declares that method and the other answers 404/405, or when a POST-paid path answers GET with 200 JSON that the bazaar method or openapi.json marks as a separate REST operation)"],
  ["X004", "warn", "unpaid request is redirected"],
  ["X005", "warn", "plain http endpoint"],
  ["X006", "warn", "JSON 402 body served with a non-JSON content-type"],
  ["X007", "warn", "402 challenge is cacheable (stale challenge risk)"],
  ["X008", "warn", "challenge slower than 5 s"],
  ["X009", "info", "CORS missing / PAYMENT-REQUIRED not exposed / preflight rejects payment headers"],
  ["X010", "warn/info", "/.well-known/x402 missing, does not mention the live payTo, or lists extra addresses (probes.well_known_payto = match / mismatch / no_address)"],
  ["X011", "info", "no /llms.txt"],
  ["X012", "info", "no /openapi.json"],
  ["X014", "info", "documented non-x402 access (openapi securitySchemes, /.well-known/x402 auth/credits keys): an authenticated caller may get 2xx with no 402"],
  ["X101", "error/warn", "PaymentRequired cannot be parsed from header or body"],
  ["X102", "error/warn", "x402Version missing/unknown (warn for v1)"],
  ["X103", "warn", "v2 challenge only in the body, no PAYMENT-REQUIRED header"],
  ["X110", "error", "accepts[] empty or a required field is missing (v2 uses amount, v1 maxAmountRequired)"],
  ["X111", "error/warn", "network is not a CAIP-2 id (v2)"],
  ["X112", "warn", "testnet network"],
  ["X113", "error", "payTo is malformed, zero/burn, or fails the EIP-55 checksum (EVM) / not 32-byte base58 (Solana)"],
  ["X114", "error", "payTo equals the asset contract"],
  ["X115", "error/warn/info", "amount is not a positive integer string; zero price; very high or sub-cent price"],
  ["X116", "warn/info", "asset/network mismatch for a known USDC, or an unrecognised asset"],
  ["X117", "warn", "scheme is not exact/upto"],
  ["X118", "error/warn", "EVM exact: extra.name/extra.version missing or wrong for a known USDC"],
  ["X119", "warn", "maxTimeoutSeconds missing or implausible"],
  ["X120", "info", "several different payTo addresses in accepts[]"],
  ["X130", "warn/info", "v2 resource object missing, resource.url host differs, empty description"],
  ["X131", "info", "no bazaar extension (discovery)"],
  ["X132", "warn", "GET and POST return different payment terms"],
  ["X133", "info", "only one of the GET/POST 402s carries the bazaar extension"],
];

export function llmsTxt(base: string): string {
  return `# x402lint

> Free, read-only linter for the unpaid path of an x402 endpoint. Point it at a paid URL and it tells you what a client or directory would trip over before you announce it. Never pays, never signs, no API key. Hosted on Cloudflare Workers Free. Source: ${REPO}

It checks what can be checked without paying: the 402 challenge (version, accepts[] fields, CAIP-2 network, payTo and asset sanity, EIP-55 checksum, amount unit, EIP-712 name/version for EIP-3009 USDC, timeouts, resource), transport (redirects, cache headers, CORS) and discovery files (/.well-known/x402, /llms.txt, /openapi.json).
It does NOT test settlement, facilitator behaviour or whether the paid response is delivered. A clean lint is not proof the route works end to end.

Send a named User-Agent (default Python-urllib UAs are blocked by Cloudflare error 1010 on workers.dev).

## Endpoints (all free, JSON, CORS open)
- GET  ${base}/v1/lint?url=<paid URL>[&method=auto|GET|POST]   Fetch the 402 and lint it
- POST ${base}/v1/lint/payment-required  {"payment_required": <object | JSON string | base64 PAYMENT-REQUIRED header>, "url"?: "..."}   Lint a challenge you already hold (no network)
- GET  ${base}/v1/directories?url=<paid URL>   Same lint plus directory readiness: what x402dash (GET must return 402), x402scan (openapi x-payment-info or /.well-known/x402, input schema), the402 (validator "payable") and the CDP/PayAI Bazaar (bazaar extension, description <= 500 chars, non-tunnel host, then one settled payment) check before listing. Also: /v1/lint?...&directories=1
- POST ${base}/mcp   Remote MCP (Streamable HTTP, stateless): tools lint_x402_endpoint, lint_payment_required, check_directory_readiness

For the paid path (settlement, on-chain transfer, delivery, replay and underpayment rejection) run paidpath against your own endpoint with your own key: https://github.com/something-agent/paidpath
- GET  ${base}/openapi.json, /.well-known/mcp-server-card.json, /.well-known/ai-catalog.json, /v1/rules

## Output
{verdict: ok|warn|fail, counts, summary{x402_version, accepts, prices, extensions, method, challenge_in}, probes, findings[{id, severity: error|warn|info, message, fix?, where?}], not_tested[], scope: "unpaid_path_only", verdict_meaning, paid_path_checks[{id, name, risk, how_to_test}]}
verdict is fail if any finding is an error, warn if any is a warning. verdict ok is about the unpaid path only: paid_path_checks lists the seller-side failures only a paid call can show (P001 paid-replay, P002 settle-not-called, P003 paid-200-cacheable, P004 paid-response-delivered), each with a do-it-yourself test.

## Use in CI
curl -s -A 'ci/1.0' 'https://x402lint.something-agent.workers.dev/v1/lint?url=<paid URL>' | jq -e '.verdict != "fail"'
(jq -e exits non-zero on fail; use '.verdict == "ok"' to also fail on warnings.)

## Cache note
402 is not heuristically cacheable under RFC 9111, so X007 fires only when the 402 explicitly allows caching (usually framework error-page defaults or an edge rule adding public/max-age). The risk is a stale challenge, not a leaked body: a cached payTo/amount can outlive a rotation. A paid 200 is heuristically cacheable: see P003.

## Limits
40 outbound subrequests per call (about 8 used), 256 KB read per response, best-effort rate limit per IP. A Worker on workers.dev cannot fetch another *.workers.dev Worker of the same account, so such hosts show as unreachable here.
Contact: ${CONTACT}
`;
}

export function openapi(base: string) {
  return {
    openapi: "3.1.0",
    info: { title: "x402lint", version: VERSION, description: "Free unpaid-path linter for x402 endpoints.", license: { name: "MIT" }, contact: { email: CONTACT } },
    servers: [{ url: base }],
    paths: {
      "/v1/lint": { get: { summary: "Fetch and lint an x402 endpoint's unpaid 402", parameters: [{ name: "url", in: "query", required: true, schema: { type: "string" } }, { name: "method", in: "query", schema: { type: "string", enum: ["auto", "GET", "POST"] } }], responses: { "200": { description: "Lint report" }, "400": { description: "Bad request" }, "429": { description: "Rate limited" } } } },
      "/v1/directories": { get: { summary: "Lint plus directory readiness (x402dash, x402scan, the402, CDP/PayAI Bazaar)", parameters: [{ name: "url", in: "query", required: true, schema: { type: "string" } }, { name: "method", in: "query", schema: { type: "string", enum: ["auto", "GET", "POST"] } }], responses: { "200": { description: "Lint report with a directories array" }, "400": { description: "Bad request" }, "429": { description: "Rate limited" } } } },
      "/v1/lint/payment-required": { post: { summary: "Lint a PaymentRequired object you already have", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { payment_required: {}, url: { type: "string" } }, required: ["payment_required"] } } } }, responses: { "200": { description: "Lint report" } } } },
      "/v1/rules": { get: { summary: "List rule ids", responses: { "200": { description: "Rules" } } } },
      "/mcp": { post: { summary: "Remote MCP (Streamable HTTP, JSON-RPC 2.0)", responses: { "200": { description: "JSON-RPC response" }, "202": { description: "Notification accepted" } } } },
    },
  };
}
export function serverCard(base: string) {
  return { $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json", name: "io.github.something-agent/x402lint", version: VERSION, title: "x402lint", description: "Free unpaid-path linter for x402 endpoints (challenge, payTo/asset/amount sanity, transport, discovery).", websiteUrl: REPO, repository: { url: REPO, source: "github" }, remotes: [{ type: "streamable-http", url: `${base}/mcp` }], capabilities: { tools: { listChanged: false } } };
}
export function aiCatalog(base: string) {
  return { specVersion: "1.0", host: { displayName: "x402lint", identifier: new URL(base).host, documentationUrl: REPO }, entries: [
    { identifier: "urn:x402lint:mcp", displayName: "x402lint MCP server", type: "application/mcp-server-card+json", url: `${base}/.well-known/mcp-server-card.json`, description: "Lint an x402 endpoint's unpaid path" },
    { identifier: "urn:x402lint:openapi", displayName: "x402lint HTTP API", type: "application/openapi+json", url: `${base}/openapi.json` },
    { identifier: "urn:x402lint:llms", displayName: "llms.txt", type: "text/plain", url: `${base}/llms.txt` } ] };
}
export function landing(base: string): string {
  return `<!doctype html><meta charset=utf-8><title>x402lint</title><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font:16px/1.5 system-ui;max-width:42rem;margin:2rem auto;padding:0 1rem;color:#222}code,pre{background:#f4f4f4;padding:.1rem .3rem;border-radius:4px}pre{padding:.7rem;overflow:auto}</style>
<h1>x402lint</h1>
<p>A free linter for the <em>unpaid</em> path of an <a href="https://github.com/coinbase/x402">x402</a> endpoint: the 402 challenge, payTo/asset/amount sanity, EIP-712 hints, redirects, cache and CORS, discovery files. It never pays, so it cannot test settlement.</p>
<pre>curl -H 'user-agent: me/1.0' '${base}/v1/lint?url=https://mart402.com/v1/extract'</pre>
<p>HTTP API: <a href="/openapi.json">openapi.json</a> &middot; rules: <a href="/v1/rules">/v1/rules</a> &middot; MCP: <code>${base}/mcp</code> &middot; <a href="/llms.txt">llms.txt</a> &middot; <a href="${REPO}">source (MIT)</a></p>
<p>By <em>something</em>, an independent agent operation. Sibling tools: <a href="https://github.com/something-agent/paidpath">paidpath</a> (test your own paid path end to end) and <a href="https://proofcheck.something-agent.workers.dev">ProofCheck</a> (signed offers and receipts).</p>`;
}

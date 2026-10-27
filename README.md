# x402lint

Free, read-only linter for the **unpaid path** of an [x402](https://github.com/coinbase/x402) endpoint. Point it at a paid URL and it tells you what a client or a directory would trip over, before you announce it. It never pays and never signs, so it **cannot test settlement**.

- Live: https://x402lint.something-agent.workers.dev  (HTTP API + remote MCP at `/mcp`, `/llms.txt`, `/openapi.json`)
- Official MCP Registry name: `io.github.something-agent/x402lint`
- Sibling: [ProofCheck](https://github.com/something-agent/proofcheck) (signed offers and receipts)

```bash
curl -H 'user-agent: me/1.0' 'https://x402lint.something-agent.workers.dev/v1/lint?url=https://mart402.com/v1/extract'
```

## What it checks (rule ids at `/v1/rules`)
- **Challenge**: x402Version, accepts[] required fields (v2 `amount`, v1 `maxAmountRequired`), CAIP-2 `network`, testnets, `payTo` format (EIP-55 checksum, zero/burn, equals the asset contract, Solana base58 length), amount is an integer in base units (and price for known USDC), asset/network pair, EIP-712 `extra.name`/`extra.version` for EIP-3009 USDC (and known-USDC values), `maxTimeoutSeconds`, v2 `resource`, bazaar extension, header vs body delivery.
- **Transport**: GET vs POST both answer 402 and agree, redirects, plain http, cacheable 402, content-type, slow challenge, CORS (expose `PAYMENT-REQUIRED`, preflight allows `PAYMENT-SIGNATURE`).
- **Discovery**: `/.well-known/x402` payTo agrees with the live challenge, `/llms.txt`, `/openapi.json`.

## API
- `GET /v1/lint?url=<paid URL>[&method=auto|GET|POST]` fetch and lint.
- `POST /v1/lint/payment-required` `{"payment_required": <object | JSON string | base64 PAYMENT-REQUIRED header>, "url"?}` lint a challenge you hold, no network.
- `POST /mcp` Streamable HTTP MCP (stateless): `lint_x402_endpoint`, `lint_payment_required`.
- Output: `{verdict: ok|warn|fail, counts, summary, probes, findings[{id, severity, message, fix?, where?}], not_tested[], scope, verdict_meaning, paid_path_checks[]}`.
- `scope` is always `unpaid_path_only`. `paid_path_checks` names the seller-side failures only a paid call can show (P001 paid-replay, P002 settle-not-called, P003 paid-200-cacheable, P004 paid-response-delivered), each with a do-it-yourself test, so a clean lint is never read as "revenue works" (suggested by jarviscooper and vina, v0.1.1).
- CI: `curl -s -A 'ci/1.0' 'https://x402lint.something-agent.workers.dev/v1/lint?url=<paid URL>' | jq -e '.verdict != "fail"'`

## Limits (honest)
- Unpaid only. A clean lint is **not** proof the route settles or delivers. It does not call a facilitator.
- Only the host in the URL (plus its `/.well-known/x402`, `/llms.txt`, `/openapi.json`) is fetched. About 6 subrequests per call (cap 40). 256 KB read per response. Best-effort per-IP limit.
- Cloudflare: a Worker on workers.dev cannot fetch another `*.workers.dev` Worker of the same account, so those hosts appear unreachable. Send a named User-Agent (default Python-urllib UAs hit Cloudflare error 1010 on workers.dev).
- Rules encode the current v2 transport and well-known USDC deployments (Base, Base Sepolia, Ethereum, Polygon, Arbitrum, Optimism, Solana). Opinionated items are `info`, not `error`. Disagree with a rule? Open an issue.

## Develop
```bash
npm install && npm test && npm run typecheck
npx wrangler deploy      # Cloudflare Workers Free; no secrets, no bindings
```
MIT. By *something*, an independent agent operation.

import { b64Decode, dec } from "./bytes";
import { Ctx, lintEndpoint, lintPaymentRequired, NOT_TESTED, PAID_PATH_CHECKS, SCOPE, VERDICT_MEANING, verdictOf } from "./lint";

export class BadRequest extends Error {}

export const handlers = {
  async lint_endpoint(a: any, ctx: Ctx) {
    if (typeof a?.url !== "string" || !a.url) throw new BadRequest("url is required");
    const m = a.method === undefined ? "auto" : String(a.method).toUpperCase() === "AUTO" ? "auto" : String(a.method).toUpperCase();
    if (!["auto", "GET", "POST"].includes(m)) throw new BadRequest("method must be auto, GET or POST");
    const dir = a.directories === true || ["1", "true", "yes"].includes(String(a.directories ?? "").toLowerCase());
    return lintEndpoint(a.url, { method: m as any, directories: dir }, ctx);
  },
  async check_directory_readiness(a: any, ctx: Ctx) {
    return handlers.lint_endpoint({ ...a, directories: true }, ctx);
  },
  async lint_payment_required(a: any, _ctx: Ctx) {
    let pr = a?.payment_required;
    if (pr === undefined) throw new BadRequest("payment_required is required (object, JSON string, or the base64 PAYMENT-REQUIRED header)");
    if (typeof pr === "string") {
      try { pr = JSON.parse(pr); } catch { try { pr = JSON.parse(dec.decode(b64Decode(pr))); } catch { throw new BadRequest("payment_required string is neither JSON nor base64 JSON"); } }
    }
    if (!pr || typeof pr !== "object") throw new BadRequest("payment_required must decode to an object");
    const r = lintPaymentRequired(pr, { url: typeof a.url === "string" ? a.url : undefined, from: "header" });
    const counts = { error: r.findings.filter((x) => x.severity === "error").length, warn: r.findings.filter((x) => x.severity === "warn").length, info: r.findings.filter((x) => x.severity === "info").length };
    return { verdict: verdictOf(r.findings), summary: r.summary, counts, findings: r.findings, not_tested: NOT_TESTED, scope: SCOPE, verdict_meaning: VERDICT_MEANING, paid_path_checks: PAID_PATH_CHECKS };
  },
};

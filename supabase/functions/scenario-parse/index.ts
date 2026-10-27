// Pegasus — scenario-parse
// Turns a borrower's free-text / dictated deal description into structured
// scenario fields for the Submit-a-Scenario form. Returns a draft only; the
// borrower reviews every field before submitting. Nothing is written here.
//
// Secrets (Supabase Dashboard -> Edge Functions -> Secrets), one of:
//   ANTHROPIC_API_KEY   preferred (Claude)
//   OPENAI_API_KEY      fallback  (OpenAI Responses API)
// Optional: ANTHROPIC_MODEL, OPENAI_MODEL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGINS = ["https://pegasuscapitalnetwork.com", "https://www.pegasuscapitalnetwork.com", "http://localhost:8765"];
function cors(req: Request) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
function serviceKey(): string {
  const a = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (a && a.trim()) return a.trim();
  const raw = (Deno.env.get("SUPABASE_SECRET_KEYS") || "").trim();
  if (raw.startsWith("{")) { try { const o = JSON.parse(raw); return String(o.default || Object.values(o)[0] || ""); } catch { /* */ } }
  return raw;
}

const LOAN_TYPES = ["construction","bridge","fix_flip","dscr_rental","residential_refi","residential_purchase","commercial","multifamily"];
const EXITS = ["sale","refinance","rent"];
const NUM_KEYS = ["amount","amount_min","purchase_price","current_payoff","as_is_value","arv","rehab_spent","rehab_remaining","sponsor_years"];
const STR_KEYS = ["loan_type","asset_type","occupancy","vesting","state","metro","fico_band","exit_strategy","timeline","notes"];

const SYSTEM = `You convert a real estate investor's free-text or dictated loan scenario into a strict JSON object for a lending intake form. Extract only what the text clearly states. Never invent numbers or facts; if a value is not stated, use "" (empty string).

Return ONLY one JSON object with these keys:
- loan_type: one of ${LOAN_TYPES.join(", ")} (best fit; mid-construction / completion = "construction"; cash-out or rate/term on investment = "residential_refi"; buy-and-hold rental = "dscr_rental")
- asset_type: free text like "SFR", "2-4 Units", "Multifamily", "Commercial", "Mixed-Use", "Land"
- occupancy: "non_owner" or "owner" ("" if unclear; investment deals are usually non_owner)
- vesting: "LLC", "Individual", "Corporation", "Trust" or ""
- state: 2-letter US state code, uppercase (e.g. "CA")
- metro: city or metro name
- amount: requested loan amount, digits only, no symbols or commas
- amount_min: lowest acceptable loan amount if a flexible range is stated, digits only, else ""
- purchase_price, current_payoff, as_is_value, arv, rehab_spent, rehab_remaining: digits only, "" if not stated
- appraisal_on_hand: true or false (true only if an appraisal is explicitly in hand)
- fico_band: one of "740+","700-739","660-699","620-659","Below 620", else ""
- sponsor_years: number of completed projects / years of experience as a plain integer string, else ""
- exit_strategy: one of ${EXITS.join(", ")}, else ""
- timeline: "ASAP","30d","60d" or "flex", else ""
- notes: a one or two sentence clean summary of anything important that does not fit the fields above

All number fields are plain integers as strings, no "$", no commas, no "k"/"M" (write 4000000, not "$4M"). Output the JSON object and nothing else.`;

function extractJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const s = text.slice(a, b + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch { return null; } }
}
function digits(v: unknown): string {
  const s = String(v ?? "").replace(/[^0-9.]/g, "");
  if (!s) return "";
  const n = Math.round(parseFloat(s)); return Number.isFinite(n) && n > 0 ? String(n) : "";
}
function clean(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of STR_KEYS) out[k] = String(o[k] ?? "").trim().slice(0, k === "notes" ? 600 : 80);
  for (const k of NUM_KEYS) out[k] = digits(o[k]);
  if (out.loan_type && !LOAN_TYPES.includes(String(out.loan_type))) out.loan_type = "";
  if (out.exit_strategy && !EXITS.includes(String(out.exit_strategy))) out.exit_strategy = "";
  out.state = String(out.state || "").toUpperCase().slice(0, 2).replace(/[^A-Z]/g, "");
  out.appraisal_on_hand = (o.appraisal_on_hand === true || String(o.appraisal_on_hand).toLowerCase() === "true");
  return out;
}

async function viaAnthropic(key: string, user: string): Promise<string> {
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  const d = await r.json();
  return (d.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
}
async function viaOpenAI(key: string, user: string): Promise<string> {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: SYSTEM, input: user }),
  });
  if (!r.ok) throw new Error("openai " + r.status + " " + (await r.text()).slice(0, 300));
  const d = await r.json();
  if (typeof d.output_text === "string") return d.output_text;
  const parts: string[] = [];
  for (const o of d.output || []) for (const c of (o.content || [])) if (c.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { ok: false, code: "method" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json(req, { ok: false, code: "auth" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
    const { data: { user }, error } = await sb.auth.getUser(auth.slice(7));
    if (error || !user) return json(req, { ok: false, code: "auth" }, 401);

    const anth = Deno.env.get("ANTHROPIC_API_KEY") || "", oai = Deno.env.get("OPENAI_API_KEY") || "";
    if (!anth && !oai) return json(req, { ok: false, code: "no_key" });

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb.from("profile_ai_runs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
    if ((count || 0) >= 30) return json(req, { ok: false, code: "limit", message: "You’ve used AI fill many times today. Try again tomorrow." });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty */ }
    const textIn = String(body.text || "").slice(0, 4000).trim();
    if (textIn.length < 12) return json(req, { ok: false, code: "need_text", message: "Describe the deal in a sentence or two first." });

    let out = "", provider = "";
    try {
      if (anth) { provider = "anthropic"; out = await viaAnthropic(anth, textIn); }
      else { provider = "openai"; out = await viaOpenAI(oai, textIn); }
    } catch (e) {
      console.error(String(e));
      if (anth && oai) { try { provider = "openai"; out = await viaOpenAI(oai, textIn); } catch (e2) { console.error(String(e2)); } }
    }
    const parsed = out ? extractJson(out) : null;
    await sb.from("profile_ai_runs").insert({ user_id: user.id, ok: !!parsed, provider: "scenario:" + provider });
    if (!parsed) return json(req, { ok: false, code: "ai_failed", message: "Couldn’t read that automatically — please fill the fields." });
    const draft = clean(parsed);
    const filled = [...STR_KEYS, ...NUM_KEYS].filter((k) => !!draft[k]).length;
    return json(req, { ok: true, draft, filled });
  } catch (e) {
    console.error("scenario-parse", String(e));
    return json(req, { ok: false, code: "error" }, 500);
  }
});

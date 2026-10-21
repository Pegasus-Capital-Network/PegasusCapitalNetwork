// Pegasus — profile-ai-draft
// One tap "Fill my profile with AI": looks the signed-in member up on the web
// (name, email domain, company, links they give) and drafts their profile.
// Returns a draft only. Nothing is written to the profile here; the member
// reviews every field and confirms in the browser.
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets), one of:
//   ANTHROPIC_API_KEY   preferred (Claude + web search)
//   OPENAI_API_KEY      fallback  (OpenAI Responses API + web search)
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

const PERSONAL = new Set(["gmail.com","googlemail.com","yahoo.com","hotmail.com","outlook.com","live.com","msn.com","icloud.com","me.com","mac.com","aol.com","proton.me","protonmail.com","comcast.net","att.net","verizon.net","sbcglobal.net","ymail.com","gmx.com","mail.ru","yandex.ru","privaterelay.appleid.com"]);
const KEYS = ["full_name","professional_title","company_name","location","headline","bio","current_focus","specialties","markets","website","linkedin_url"];

const SYSTEM = `You draft professional profiles for members of Pegasus Capital Network, a network where lenders, private investors, mortgage and real estate professionals, developers and AI founders find each other.
The member signed in and asked you to draft THEIR OWN profile. Search the web for them using their name, their email domain (if it is a company domain, that company's website is the strongest signal), and any hints they gave.
Rules:
- Only use facts that clearly belong to THIS person. If search results could be a different person with the same name, do not use them.
- Never invent licenses, numbers, years, clients or titles. If unsure, leave the field "".
- Write in English, first person for "bio", plain and specific, no hype words.
- headline under 120 characters, current_focus under 140, bio 3 to 5 sentences under 900 characters.
- specialties: up to 6 short items. markets: states or cities they work in.
- location as "City, ST" for the U.S.
Reply with ONLY one JSON object with exactly these keys: ${KEYS.join(", ")}. specialties and markets are arrays of strings, everything else strings.`;

function extractJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const s = text.slice(a, b + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch { return null; } }
}
function clean(o: Record<string, unknown>) {
  const lim: Record<string, number> = { full_name: 80, professional_title: 80, company_name: 80, location: 80, headline: 120, bio: 2000, current_focus: 140, website: 200, linkedin_url: 200 };
  const out: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = o[k];
    if (k === "specialties" || k === "markets") {
      const arr = Array.isArray(v) ? v : (typeof v === "string" ? v.split(/[,;]\s*/) : []);
      out[k] = arr.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8);
    } else {
      out[k] = String(v ?? "").replace(/\s*\[\d+\]/g, "").trim().slice(0, lim[k] || 200);
    }
  }
  return out;
}

async function viaAnthropic(key: string, user: string): Promise<string> {
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  const messages: Array<Record<string, unknown>> = [{ role: "user", content: user }];
  for (let turn = 0; turn < 3; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 1800, system: SYSTEM, messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
    });
    if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
    const d = await r.json();
    const text = (d.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    if (d.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: d.content }); continue; }
    return text;
  }
  throw new Error("anthropic: too many turns");
}

async function viaOpenAI(key: string, user: string): Promise<string> {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: SYSTEM, input: user, tools: [{ type: "web_search" }] }),
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
    if ((count || 0) >= 5) return json(req, { ok: false, code: "limit", message: "You’ve used AI fill a few times today. Try again tomorrow." });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty */ }
    const hint = String(body.hint || "").slice(0, 600).trim();

    const { data: prof } = await sb.from("profiles").select("full_name,professional_title,company_name,location,headline,bio,website,linkedin_url,linkedin").eq("id", user.id).maybeSingle();
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const email = user.email || "";
    const domain = (email.split("@")[1] || "").toLowerCase();
    const companyDomain = domain && !PERSONAL.has(domain) ? domain : "";
    let name = String(prof?.full_name || meta.full_name || meta.name || "").trim();
    if (name && email && name.toLowerCase() === email.split("@")[0].toLowerCase()) name = "";

    if (!name && !companyDomain && !hint) return json(req, { ok: false, code: "need_hint", message: "Tell us your name and company, or paste your LinkedIn or website." });

    const known: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(prof || {})) if (v && k !== "linkedin") known[k] = v;
    const lines = [
      name ? `Name: ${name}` : "Name: (not given)",
      companyDomain ? `Email domain: ${companyDomain} (company domain — check its website)` : "Email: personal address, no company domain",
      Object.keys(known).length ? `Already on their profile: ${JSON.stringify(known)}` : "",
      hint ? `What the member told us: ${hint}` : "",
    ].filter(Boolean).join("\n");

    let text = "", provider = "";
    try {
      if (anth) { provider = "anthropic"; text = await viaAnthropic(anth, lines); }
      else { provider = "openai"; text = await viaOpenAI(oai, lines); }
    } catch (e) {
      console.error(String(e));
      if (anth && oai) { try { provider = "openai"; text = await viaOpenAI(oai, lines); } catch (e2) { console.error(String(e2)); } }
    }
    const parsed = text ? extractJson(text) : null;
    await sb.from("profile_ai_runs").insert({ user_id: user.id, ok: !!parsed, provider });
    if (!parsed) return json(req, { ok: false, code: "ai_failed", message: "The AI couldn’t draft it this time." });
    const draft = clean(parsed);
    if (!draft.full_name && name) draft.full_name = name;
    const filled = KEYS.filter((k) => Array.isArray(draft[k]) ? (draft[k] as unknown[]).length : !!draft[k]).length;
    return json(req, { ok: true, draft, filled });
  } catch (e) {
    console.error("profile-ai-draft", String(e));
    return json(req, { ok: false, code: "error" }, 500);
  }
});

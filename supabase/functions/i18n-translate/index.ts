// Pegasus — i18n-translate
// Translates queued UI strings into the site languages with Claude and publishes
// one dictionary per language to the public storage bucket "i18n" ({lang}.json).
// Called by pg_cron / pg_net with header x-job-token (token kept in app_job_tokens).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LANGS: Record<string, string> = {
  ar: "Modern Standard Arabic (as used in the UAE and Gulf business)",
  zh: "Simplified Chinese (Mainland China business usage)",
  ru: "Russian",
  es: "Spanish (neutral, US and Latin America)",
  fr: "French",
};
const DAILY_CAP = 4000;

function serviceKey(): string {
  const a = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (a && a.trim()) return a.trim();
  const raw = (Deno.env.get("SUPABASE_SECRET_KEYS") || "").trim();
  if (raw.startsWith("{")) { try { const o = JSON.parse(raw); return String(o.default || Object.values(o)[0] || ""); } catch { /* */ } }
  return raw;
}

function system(langName: string) {
  return `You translate the user interface of Pegasus Capital Network, a professional marketplace for real estate lending, private credit, investors, mortgage and AI companies, from English into ${langName}.
Rules:
- Return ONLY a JSON array of strings, same length and order as the input array. No commentary.
- Keep tokens like {1}, {2} exactly as they are, in a natural position.
- Never translate brand names: Pegasus, Pegasus Capital Network, Pegasus AI, Pegasus Private Network, Pegasus Direct Lending, Pegasus Lenders Group LLC, West Coast Capital Mortgage.
- Keep company names, person names, product names, URLs, email addresses and US state codes unchanged.
- Keep standard finance acronyms in Latin letters: DSCR, LTV, LTC, ARV, FICO, NMLS, DRE, HMDA, SBA, REIT, IO, ARM.
- Use the professional register a bank or capital-markets firm would use. Short UI labels stay short (button text, menu items).
- If a string is already not English, or is only a name or code, return it unchanged.`;
}

async function translate(key: string, model: string, langName: string, items: string[]): Promise<string[] | null> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 8000, system: system(langName), messages: [{ role: "user", content: JSON.stringify(items) }] }),
  });
  if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 300)); return null; }
  const d = await r.json();
  const text = (d.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a < 0 || b <= a) return null;
  try {
    const arr = JSON.parse(text.slice(a, b + 1));
    if (!Array.isArray(arr) || arr.length !== items.length) return null;
    return arr.map((x: unknown, i: number) => {
      const s = typeof x === "string" && x.trim() ? x : items[i];
      // placeholders must survive
      const need = items[i].match(/\{\d+\}/g) || [];
      return need.every((t) => s.includes(t)) ? s : items[i];
    });
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
    const tok = req.headers.get("x-job-token") || "";
    const { data: t } = await sb.from("app_job_tokens").select("token").eq("name", "i18n").maybeSingle();
    if (!tok || !t || t.token !== tok) return J({ ok: false }, 403);
    const key = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!key) return J({ ok: false, code: "no_key" });
    const model = Deno.env.get("I18N_MODEL") || "claude-sonnet-5-5";
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(10, Math.min(Number(body.limit) || 150, 300));
    const publishOnly = !!body.publish_only;

    let translated = 0;
    if (!publishOnly) {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await sb.from("i18n_strings").select("src", { count: "exact", head: true }).eq("lang", "ar").gte("created_at", since);
      if ((count || 0) < DAILY_CAP) {
        const { data: q } = await sb.from("i18n_queue").select("src").order("hits", { ascending: false }).order("first_seen", { ascending: true }).limit(limit);
        const srcs = (q || []).map((r) => r.src as string);
        if (srcs.length) {
          await Promise.all(Object.entries(LANGS).map(async ([lang, langName]) => {
            const { data: have } = await sb.from("i18n_strings").select("src").eq("lang", lang).in("src", srcs);
            const done = new Set((have || []).map((r) => r.src));
            const todo = srcs.filter((s) => !done.has(s));
            for (let i = 0; i < todo.length; i += 60) {
              const chunk = todo.slice(i, i + 60);
              let out = await translate(key, model, langName, chunk);
              if (!out) out = await translate(key, model, langName, chunk);
              if (!out) continue;
              const rows = chunk.map((s, k) => ({ lang, src: s, tr: out![k] }));
              const { error } = await sb.from("i18n_strings").upsert(rows, { onConflict: "lang,src" });
              if (error) console.error("upsert", lang, error.message); else translated += rows.length;
            }
          }));
          // drop queue rows now present in every language
          const { data: all } = await sb.from("i18n_strings").select("src,lang").in("src", srcs);
          const per: Record<string, number> = {};
          (all || []).forEach((r) => { per[r.src] = (per[r.src] || 0) + 1; });
          const finished = srcs.filter((s) => (per[s] || 0) >= Object.keys(LANGS).length);
          for (let i = 0; i < finished.length; i += 100) await sb.from("i18n_queue").delete().in("src", finished.slice(i, i + 100));
        }
      }
    }

    // publish dictionaries
    const sizes: Record<string, number> = {};
    for (const lang of Object.keys(LANGS)) {
      const dict: Record<string, string> = {};
      let from = 0;
      for (;;) {
        const { data } = await sb.from("i18n_strings").select("src,tr").eq("lang", lang).range(from, from + 999);
        if (!data || !data.length) break;
        data.forEach((r) => { if (r.tr && r.tr !== r.src) dict[r.src] = r.tr; });
        if (data.length < 1000) break;
        from += 1000;
      }
      sizes[lang] = Object.keys(dict).length;
      const blob = new Blob([JSON.stringify(dict)], { type: "application/json" });
      const { error } = await sb.storage.from("i18n").upload(`${lang}.json`, blob, { upsert: true, contentType: "application/json", cacheControl: "300" });
      if (error) console.error("publish", lang, error.message);
    }
    const { count: left } = await sb.from("i18n_queue").select("src", { count: "exact", head: true });
    return J({ ok: true, translated, queue_left: left || 0, sizes });
  } catch (e) {
    console.error("i18n-translate", String(e));
    return J({ ok: false, error: String(e).slice(0, 200) }, 500);
  }
});

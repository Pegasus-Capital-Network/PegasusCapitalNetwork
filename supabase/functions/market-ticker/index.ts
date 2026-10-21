// Pegasus — market-ticker
// Collects market data for the site's top ticker and stores it in public.market_ticker.
// Called every 15 minutes by pg_cron / pg_net with header x-job-token (app_job_tokens name='ticker').
// Sources (all public): CoinGecko (crypto, gold via PAXG), open.er-api.com (FX),
// U.S. Treasury daily yield curve (2Y/10Y), New York Fed (SOFR, EFFR, target range → Prime),
// Freddie Mac PMMS (30Y/15Y mortgage), FRED when FRED_API_KEY is set (S&P 500, WTI oil), and Pegasus's own counts.
// A failed source leaves its previous rows untouched; the browser hides rows that are too old.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function serviceKey(): string {
  const a = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (a && a.trim()) return a.trim();
  const raw = (Deno.env.get("SUPABASE_SECRET_KEYS") || "").trim();
  if (raw.startsWith("{")) { try { const o = JSON.parse(raw); return String(o.default || Object.values(o)[0] || ""); } catch { /* */ } }
  return raw;
}

type Row = { symbol: string; label: string; value: number | null; change?: number | null; change_pct?: number | null; fmt: string; grp: string; sort: number; as_of: string | null; source: string; link?: string | null };
const rows: Row[] = [];
const errors: string[] = [];
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v)); return isFinite(n) ? n : null; };
async function getJSON(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { "user-agent": "PegasusCapitalNetwork/1.0 (+https://pegasuscapitalnetwork.com)", accept: "application/json", ...headers }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(url.split("?")[0] + " " + r.status);
  return r.json();
}
async function step(name: string, fn: () => Promise<void>) { try { await fn(); } catch (e) { errors.push(name + ": " + String(e).slice(0, 160)); } }

async function crypto() {
  const d = await getJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,pax-gold&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true");
  const add = (id: string, symbol: string, label: string, grp: string, sort: number, source: string) => {
    const x = d[id]; if (!x || num(x.usd) == null) return;
    rows.push({ symbol, label, value: num(x.usd), change_pct: num(x.usd_24h_change), fmt: "usd", grp, sort, as_of: x.last_updated_at ? new Date(x.last_updated_at * 1000).toISOString() : new Date().toISOString(), source });
  };
  add("bitcoin", "BTC", "Bitcoin", "crypto", 80, "CoinGecko");
  add("ethereum", "ETH", "Ethereum", "crypto", 81, "CoinGecko");
  add("pax-gold", "GOLD", "Gold oz", "market", 72, "CoinGecko (PAXG, 1 oz gold token)");
}

async function fx() {
  const d = await getJSON("https://open.er-api.com/v6/latest/USD");
  const t = d.time_last_update_unix ? new Date(d.time_last_update_unix * 1000).toISOString() : new Date().toISOString();
  const add = (cur: string, sort: number) => { const v = num(d.rates?.[cur]); if (v != null) rows.push({ symbol: "USD" + cur, label: "USD/" + cur, value: v, fmt: "fx", grp: "fx", sort, as_of: t, source: "ExchangeRate-API" }); };
  add("AED", 90); add("CNY", 91); add("EUR", 92);
}

async function treasury() {
  const now = new Date();
  const months = [0, 1].map((k) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0"); });
  const entries: { date: string; y2: number | null; y10: number | null }[] = [];
  for (const m of months) {
    const r = await fetch(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${m}`, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "PegasusCapitalNetwork/1.0" } });
    if (!r.ok) throw new Error("treasury " + r.status);
    const x = await r.text();
    for (const e of x.split(/<entry>/).slice(1)) {
      const g = (tag: string) => { const mm = e.match(new RegExp(`<d:${tag}[^>]*>([^<]*)</d:${tag}>`)); return mm ? mm[1] : null; };
      const date = g("NEW_DATE"); if (!date) continue;
      entries.push({ date: date.slice(0, 10), y2: num(g("BC_2YEAR")), y10: num(g("BC_10YEAR")) });
    }
    if (entries.length >= 2) break;
  }
  entries.sort((a, b) => a.date < b.date ? 1 : -1);
  const [cur, prev] = entries;
  if (!cur) throw new Error("treasury: no entries");
  const add = (symbol: string, label: string, v: number | null, p: number | null, sort: number) => {
    if (v == null) return;
    rows.push({ symbol, label, value: v, change: p != null ? +(v - p).toFixed(3) : null, fmt: "pct", grp: "rates", sort, as_of: cur.date + "T21:00:00Z", source: "U.S. Treasury" });
  };
  add("UST10Y", "10Y Treasury", cur.y10, prev?.y10 ?? null, 10);
  add("UST2Y", "2Y Treasury", cur.y2, prev?.y2 ?? null, 11);
}

async function nyfed() {
  const s = await getJSON("https://markets.newyorkfed.org/api/rates/secured/sofr/last/2.json");
  const sr = s.refRates || [];
  if (sr[0]) rows.push({ symbol: "SOFR", label: "SOFR", value: num(sr[0].percentRate), change: sr[1] ? +(num(sr[0].percentRate)! - num(sr[1].percentRate)!).toFixed(3) : null, fmt: "pct", grp: "rates", sort: 12, as_of: sr[0].effectiveDate + "T13:00:00Z", source: "Federal Reserve Bank of New York" });
  const f = await getJSON("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/2.json");
  const fr = f.refRates || [];
  if (fr[0]) {
    rows.push({ symbol: "EFFR", label: "Fed Funds", value: num(fr[0].percentRate), change: fr[1] ? +(num(fr[0].percentRate)! - num(fr[1].percentRate)!).toFixed(3) : null, fmt: "pct", grp: "rates", sort: 13, as_of: fr[0].effectiveDate + "T13:00:00Z", source: "Federal Reserve Bank of New York" });
    const top = num(fr[0].targetRateTo);
    // U.S. prime rate convention: top of the Fed funds target range + 3.00%
    if (top != null) rows.push({ symbol: "PRIME", label: "Prime", value: +(top + 3).toFixed(2), fmt: "pct", grp: "rates", sort: 14, as_of: fr[0].effectiveDate + "T13:00:00Z", source: "Fed funds target upper bound + 3.00%" });
  }
}

async function freddie() {
  // Freddie Mac Primary Mortgage Market Survey, weekly (Thursdays), public CSV
  const r = await fetch("https://www.freddiemac.com/pmms/docs/PMMS_history.csv", { signal: AbortSignal.timeout(20000), headers: { "user-agent": "PegasusCapitalNetwork/1.0" } });
  if (!r.ok) throw new Error("freddie " + r.status);
  const lines = (await r.text()).trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  const ok = lines.filter((c) => num(c[1]) != null);
  const cur = ok[ok.length - 1], prev = ok[ok.length - 2];
  if (!cur) throw new Error("freddie: empty");
  const [m, d, y] = cur[0].split("/");
  const asOf = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T16:00:00Z`;
  const add = (symbol: string, label: string, col: number, sort: number) => {
    const v = num(cur[col]); if (v == null) return;
    const p = prev ? num(prev[col]) : null;
    rows.push({ symbol, label, value: v, change: p != null ? +(v - p).toFixed(3) : null, fmt: "pct", grp: "mortgage", sort, as_of: asOf, source: "Freddie Mac PMMS (weekly)" });
  };
  add("MTG30", "30Y Mortgage", 1, 20);
  add("MTG15", "15Y Mortgage", 3, 21);
}

async function fred(key: string) {
  const series: [string, string, string, string, number][] = [
    ["SP500", "SPX", "S&P 500", "market", 70],
    ["DCOILWTICO", "WTI", "WTI Oil", "market", 71],
  ];
  for (const [id, symbol, label, grp, sort] of series) {
    await step("fred " + id, async () => {
      const d = await getJSON(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=10`);
      const obs = (d.observations || []).filter((o: { value: string }) => o.value !== "." && num(o.value) != null);
      if (!obs[0]) return;
      const v = num(obs[0].value)!, p = obs[1] ? num(obs[1].value) : null;
      const isPct = grp === "mortgage";
      rows.push({ symbol, label, value: v, change: isPct && p != null ? +(v - p).toFixed(3) : null, change_pct: !isPct && p ? +((v - p) / p * 100).toFixed(3) : null, fmt: isPct ? "pct" : (symbol === "WTI" ? "usd" : "num"), grp, sort, as_of: obs[0].date + "T21:00:00Z", source: id === "MORTGAGE30US" || id === "MORTGAGE15US" ? "Freddie Mac PMMS via FRED" : "FRED, Federal Reserve Bank of St. Louis" });
    });
  }
}

async function pegasus(sb: ReturnType<typeof createClient>) {
  const now = new Date().toISOString();
  const { data: progs } = await sb.from("public_lender_programs").select("company_page_name,company_name,lender_name,rate_from");
  if (progs) {
    const lenders = new Set(progs.map((p: Record<string, string>) => p.company_page_name || p.company_name || p.lender_name).filter(Boolean));
    rows.push({ symbol: "PEG_LENDERS", label: "Pegasus lenders", value: lenders.size, fmt: "count", grp: "pegasus", sort: 1, as_of: now, source: "Pegasus Capital Network", link: "/lending-programs.html" });
    rows.push({ symbol: "PEG_PROGRAMS", label: "Lending programs", value: progs.length, fmt: "count", grp: "pegasus", sort: 2, as_of: now, source: "Pegasus Capital Network", link: "/lending-programs.html" });
    const rates = progs.map((p: Record<string, string>) => num(String(p.rate_from || "").replace(/[^0-9.]/g, ""))).filter((r: number | null): r is number => r != null && r > 2 && r < 25);
    if (rates.length >= 5) rows.push({ symbol: "PEG_RATE", label: "Avg private lender rate", value: +(rates.reduce((a: number, b: number) => a + b, 0) / rates.length).toFixed(2), fmt: "pct", grp: "pegasus", sort: 3, as_of: now, source: "Programs published on Pegasus", link: "/lending-programs.html" });
  }
  const { count } = await sb.from("public_business_directory").select("id", { count: "exact", head: true });
  if (count) rows.push({ symbol: "PEG_COMPANIES", label: "Companies", value: count, fmt: "count", grp: "pegasus", sort: 4, as_of: now, source: "Pegasus Capital Network", link: "/businesses" });
}

Deno.serve(async (req: Request) => {
  const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
    const tok = req.headers.get("x-job-token") || "";
    const { data: t } = await sb.from("app_job_tokens").select("token").eq("name", "ticker").maybeSingle();
    if (!tok || !t || t.token !== tok) return J({ ok: false }, 403);
    rows.length = 0; errors.length = 0; // module state survives between calls in a warm worker

    await Promise.all([
      step("crypto", crypto),
      step("fx", fx),
      step("treasury", treasury),
      step("nyfed", nyfed),
      step("freddie", freddie),
      step("pegasus", () => pegasus(sb)),
      (async () => { const k = Deno.env.get("FRED_API_KEY"); if (k) await fred(k.trim()); })(),
    ]);

    const bySym = new Map(rows.filter((r) => r.value != null).map((r) => [r.symbol, r]));
    const clean = [...bySym.values()].map((r) => ({ change: null, change_pct: null, link: null, ...r, updated_at: new Date().toISOString() }));
    if (clean.length) {
      const { error } = await sb.from("market_ticker").upsert(clean, { onConflict: "symbol" });
      if (error) errors.push("upsert: " + error.message);
    }
    if (errors.length) console.error("market-ticker", errors.join(" | "));
    return J({ ok: true, saved: clean.map((r) => r.symbol), errors, fred: !!Deno.env.get("FRED_API_KEY") });
  } catch (e) {
    console.error("market-ticker", String(e));
    return J({ ok: false, error: String(e).slice(0, 200) }, 500);
  }
});

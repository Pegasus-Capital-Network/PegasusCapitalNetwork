// Pegasus — language versions for search engines.
// /ar/…, /zh/…, /ru/…, /es/…, /fr/… are served as fully translated HTML:
// the English page is fetched, its text, titles and meta tags are replaced from
// the published dictionary, <html lang/dir>, canonical and hreflang are set,
// and internal links keep the language prefix. js/i18n.js then translates any
// text that scripts add later.
import type { Config, Context } from "https://edge.netlify.com";

const LANGS = ["ar", "zh", "ru", "es", "fr"];
const ALL = ["en", ...LANGS];
const HL: Record<string, string> = { en: "en", ar: "ar", zh: "zh-Hans", ru: "ru", es: "es", fr: "fr" };
const OG: Record<string, string> = { ar: "ar_AE", zh: "zh_CN", ru: "ru_RU", es: "es_ES", fr: "fr_FR" };
const ORIGIN = "https://pegasuscapitalnetwork.com";
const DICT_URL = "https://trdwsssouhpawhfdkfqf.supabase.co/storage/v1/object/public/i18n/";
const SB_KEY = "sb_publishable_hrR8wI6hM921mnxk7bBE_A_YKxWsoBI"; // public anon key, same as in the site's JS
const cache: Record<string, { t: number; d: Record<string, string> }> = {};
const reportedAt: Record<string, number> = {};
// Pages whose untranslated text is sent to the translation queue (public, list-type pages only).
const REPORTABLE = /^\/(?:[a-z0-9-]+(?:\.html)?)?$|^\/(?:businesses\/(?:capital|ai|in\/[a-z]{2})|rankings\/[a-z0-9-]+|awards\/[a-z0-9-]+)$/i;

async function dict(lang: string): Promise<Record<string, string>> {
  const c = cache[lang];
  if (c && Date.now() - c.t < 10 * 60 * 1000) return c.d;
  try {
    const r = await fetch(DICT_URL + lang + ".json?v=" + Math.floor(Date.now() / 600000));
    const d = r.ok ? await r.json() : {};
    cache[lang] = { t: Date.now(), d };
    return d;
  } catch { return c ? c.d : {}; }
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", larr: "←", mdash: "—", ndash: "–", hellip: "…", middot: "·", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", bull: "•", times: "×", le: "≤", ge: "≥", darr: "↓", uarr: "↑", check: "✓" };
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");

const NUM = /\$?\d[\d,]*(?:\.\d+)?%?[KMB+]?/g;
let MISSING: Set<string> | null = null;
function lookup(d: Record<string, string>, raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2 || !/[A-Za-z]/.test(t)) return null;
  if (d[t]) return d[t];
  const nums: string[] = [];
  const k = t.replace(NUM, (m) => { nums.push(m); return "{" + nums.length + "}"; });
  if (nums.length && d[k]) return d[k].replace(/\{(\d+)\}/g, (m, n) => nums[+n - 1] ?? m);
  if (MISSING && t.length <= 300 && !/@|https?:|www\./i.test(t)) MISSING.add(nums.length ? k : t);
  return null;
}

const SKIP_PREFIX = /^\/(js|css|assets|data|\.netlify|api|storage|ar|zh|ru|es|fr)(\/|$)/i;
function localHref(href: string, lang: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const path = href.split(/[?#]/)[0];
  if (SKIP_PREFIX.test(path)) return href;
  if (/\.[a-z0-9]{2,5}$/i.test(path) && !/\.html$/i.test(path)) return href;
  return "/" + lang + (href === "/" ? "" : href);
}

function alternates(rest: string) {
  const p = rest === "/" ? "" : rest;
  return ALL.map((l) => `<link rel="alternate" hreflang="${HL[l]}" href="${ORIGIN}${l === "en" ? (p || "/") : "/" + l + p}">`).join("") +
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${p || "/"}">`;
}

function translateHtml(html: string, d: Record<string, string>, lang: string, rest: string): string {
  const parts = html.split(/(<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<noscript\b[\s\S]*?<\/noscript>|<textarea\b[\s\S]*?<\/textarea>|<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>|<svg\b[\s\S]*?<\/svg>|<[^>]+>)/i);
  const self = ORIGIN + "/" + lang + (rest === "/" ? "" : rest);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (p[0] !== "<") {
      if (!/[A-Za-z]/.test(p)) continue;
      const dec = decode(p);
      const tr = lookup(d, dec);
      if (tr) { const lead = dec.match(/^\s*/)![0], trail = dec.match(/\s*$/)![0]; parts[i] = lead + escText(tr) + trail; }
      continue;
    }
    if (/^<(!--|script|style|noscript|textarea|pre|code|svg)/i.test(p)) continue;
    let tag = p;
    if (/^<html\b/i.test(tag)) {
      tag = tag.replace(/\s(lang|dir|data-i18n-server)="[^"]*"/gi, "");
      tag = tag.replace(/^<html/i, `<html lang="${HL[lang]}"${lang === "ar" ? ' dir="rtl"' : ""} data-i18n-server="${lang}"`);
    } else if (/^<link\b[^>]*rel="alternate"[^>]*hreflang=/i.test(tag)) {
      tag = "";
    } else if (/^<link\b[^>]*rel="canonical"/i.test(tag)) {
      tag = tag.replace(/href="[^"]*"/i, `href="${self}"`);
    } else if (/^<meta\b/i.test(tag)) {
      if (/(name|property)="(description|og:title|og:description|twitter:title|twitter:description)"/i.test(tag)) {
        tag = tag.replace(/content="([^"]*)"/i, (m, v) => { const tr = lookup(d, decode(v)); return tr ? `content="${escAttr(tr)}"` : m; });
      } else if (/property="og:url"/i.test(tag)) {
        tag = tag.replace(/content="[^"]*"/i, `content="${self}"`);
      } else if (/property="og:locale"/i.test(tag)) {
        tag = tag.replace(/content="[^"]*"/i, `content="${OG[lang]}"`);
      }
    } else {
      tag = tag.replace(/\s(placeholder|title|aria-label|alt)="([^"]*)"/gi, (m, a, v) => { const tr = lookup(d, decode(v)); return tr ? ` ${a}="${escAttr(tr)}"` : m; });
      if (/^<a\b/i.test(tag)) tag = tag.replace(/\shref="([^"]*)"/i, (m, h) => ` href="${escAttr(localHref(decode(h), lang))}"`);
    }
    parts[i] = tag;
  }
  let out = parts.join("");
  out = out.replace(/<\/head>/i, alternates(rest) + "</head>");
  if (!/rel="canonical"/i.test(out)) out = out.replace(/<\/head>/i, `<link rel="canonical" href="${self}"></head>`);
  return out;
}

export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/(ar|zh|ru|es|fr)(\/.*)?$/);
  if (!m) return;
  const lang = m[1];
  const rest = m[2] || "/";
  if (/\.(js|css|png|jpe?g|svg|webp|gif|ico|json|xml|txt|mp4|webm|mov|pdf|woff2?|ttf|map)$/i.test(rest)) {
    return Response.redirect(url.origin + rest + url.search, 301);
  }
  const src = await fetch(new URL(rest + url.search, url.origin), {
    headers: { accept: "text/html", "user-agent": req.headers.get("user-agent") || "Pegasus-i18n" },
    redirect: "manual",
  });
  if (src.status >= 300 && src.status < 400) {
    const loc = new URL(src.headers.get("location") || "/", url.origin);
    if (loc.origin === url.origin && !/^\/(ar|zh|ru|es|fr)(\/|$)/.test(loc.pathname) && !SKIP_PREFIX.test(loc.pathname)) {
      loc.pathname = "/" + lang + (loc.pathname === "/" ? "" : loc.pathname);
    }
    return Response.redirect(loc.toString(), src.status);
  }
  const ct = src.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return new Response(src.body, { status: src.status, headers: src.headers });
  const body = await src.text();
  const report = src.status === 200 && REPORTABLE.test(rest) && !/name="robots"[^>]*noindex/i.test(body) && Date.now() - (reportedAt[rest] || 0) > 3600000;
  const d = await dict(lang);
  MISSING = report ? new Set() : null; // set and cleared synchronously around translateHtml
  const html = translateHtml(body, d, lang, rest);
  const miss = MISSING ? [...MISSING].slice(0, 60) : [];
  MISSING = null;
  if (miss.length) {
    reportedAt[rest] = Date.now();
    _ctx.waitUntil(fetch("https://trdwsssouhpawhfdkfqf.supabase.co/rest/v1/rpc/i18n_report", {
      method: "POST", headers: { "content-type": "application/json", apikey: SB_KEY },
      body: JSON.stringify({ p_strings: miss, p_page: rest }),
    }).catch(() => {}));
  }
  const h = new Headers();
  h.set("content-type", "text/html; charset=utf-8");
  h.set("content-language", HL[lang]);
  h.set("cache-control", "public, max-age=0, must-revalidate");
  h.set("netlify-cdn-cache-control", "public, durable, s-maxage=600, stale-while-revalidate=86400");
  h.set("vary", "accept-encoding");
  const xr = src.headers.get("x-robots-tag"); if (xr) h.set("x-robots-tag", xr);
  return new Response(html, { status: src.status, headers: h });
};

export const config: Config = {
  path: ["/ar", "/ar/*", "/zh", "/zh/*", "/ru", "/ru/*", "/es", "/es/*", "/fr", "/fr/*"],
  cache: "manual",
};

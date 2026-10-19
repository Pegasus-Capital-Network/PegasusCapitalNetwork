// Pegasus SEO — dynamic sitemap index + entity sitemaps.
// Public data only; uses the publishable Supabase key and public read surfaces.

const ORIGIN = "https://pegasuscapitalnetwork.com";

// People taxonomy (inlined; Netlify functions do not reliably bundle a
// cross-file ESM import, so keep this self-contained).
const PERSON_ROLES = [
  { slug:"loan-officers",       section:"lenders",    match:["loan officer","loan originator","mlo","mortgage loan originator"] },
  { slug:"real-estate-agents",  section:"realestate", match:["real estate agent","realtor","real estate broker","real estate salesperson"] },
  { slug:"mortgage-brokers",    section:"advisors",   match:["mortgage broker","broker"] },
  { slug:"developers",          section:"realestate", match:["real estate developer","developer","homebuilder","builder"] },
  { slug:"property-managers",   section:"realestate", match:["property manager","property management"] },
  { slug:"private-lenders",     section:"lenders",    match:["private lender","hard money","bridge lender"] },
  { slug:"financial-advisors",  section:"advisors",   match:["financial advisor","financial planner","wealth manager","wealth advisor","wealth management","financial advisory"] },
  { slug:"capital-advisors",    section:"advisors",   match:["capital strategist","capital advisor","capital placement","investment banker","capital markets"] },
  { slug:"fund-managers",       section:"investors",  match:["fund manager","general partner","portfolio manager"] },
  { slug:"family-offices",      section:"investors",  match:["family office"] },
  { slug:"investors",           section:"investors",  match:["investor","limited partner","syndicator","syndication"] },
  { slug:"appraisers",          section:"services",   match:["appraiser","appraisal"] },
  { slug:"attorneys",           section:"services",   match:["attorney","lawyer","legal counsel"] },
  { slug:"accountants",         section:"services",   match:["cpa","accountant","accounting"] },
  { slug:"title-escrow",        section:"services",   match:["escrow","title officer"] },
  { slug:"proptech",            section:"services",   match:["proptech","fintech","tokenization","rwa"] },
  { slug:"bankers",             section:"lenders",    match:["banker"] },
  { slug:"lenders",             section:"lenders",    match:["lender","lending"] },
  { slug:"capital-seekers",     section:"investors",  match:["borrower","seeking capital","capital seeker"] },
  { slug:"founders",            section:"services",   match:["founder","ceo","entrepreneur","startup","intrapreneur","operator","owner","principal"] },
];
const PR_BY_SLUG = Object.fromEntries(PERSON_ROLES.map(r => [r.slug, r]));
function classifyPerson(p) {
  const extra = Array.isArray(p && p.additional_roles) ? p.additional_roles.join(" ") : "";
  const h = [p && p.role, p && p.professional_title, p && p.headline, extra].filter(Boolean).join(" ").toLowerCase().replace(/_/g, " ");
  if (h.trim()) { for (const r of PERSON_ROLES) { for (const kw of r.match) { if (h.includes(kw)) return r.slug; } } }
  return "other";
}
function sectionOf(roleSlug) { return (PR_BY_SLUG[roleSlug] && PR_BY_SLUG[roleSlug].section) || "other"; }
// Valid state codes for /businesses/…/in/:st landing pages (50 states + DC + PR).
const STATE_CODES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const PAGE_SIZE = 1000;
const MAX_URLS = 49000;

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}
function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function cleanSlug(value) {
  const s = String(value || "").trim();
  return /^[a-z0-9][a-z0-9-]*$/i.test(s) ? s : "";
}
function supabaseConfig() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
}
async function restRows(path, query) {
  const { url, key } = supabaseConfig();
  const out = [];
  for (let offset = 0; offset < MAX_URLS; offset += PAGE_SIZE) {
    const params = new URLSearchParams(query);
    const res = await fetch(url + "/rest/v1/" + path + "?" + params.toString(), {
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        Range: offset + "-" + (offset + PAGE_SIZE - 1),
        "Range-Unit": "items",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(path + " sitemap query failed: " + res.status + " " + body.slice(0, 300));
    }
    const rows = await res.json();
    out.push(...rows);
    if (!Array.isArray(rows) || rows.length < PAGE_SIZE) break;
  }
  return out.slice(0, MAX_URLS);
}
function urlset(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") + "\n</urlset>\n";
}
function urlNode(loc, lastmod, priority="0.8") {
  return "  <url>\n" +
    "    <loc>" + xmlEscape(loc) + "</loc>\n" +
    (lastmod ? "    <lastmod>" + xmlEscape(lastmod) + "</lastmod>\n" : "") +
    "    <changefreq>weekly</changefreq>\n" +
    "    <priority>" + priority + "</priority>\n" +
    "  </url>";
}
async function peopleSitemap() {
  const rows = await restRows("profiles", {
    select: "profile_slug,updated_at,full_name,role,professional_title,headline,additional_roles",
    profile_slug: "not.is.null",
    full_name: "not.is.null",
    status: "eq.active", // concierge-built profiles stay 'pending' until activated
    order: "updated_at.desc",
  });
  const seen = new Set();
  const urls = [];
  const sectionSeen = new Set();
  const roleSeen = new Set();
  const landing = [];
  for (const row of rows) {
    const slug = cleanSlug(row.profile_slug);
    if (!slug || seen.has(slug) || !String(row.full_name || "").trim()) continue;
    seen.add(slug);
    const lastmod = row.updated_at && /^\d{4}-\d{2}-\d{2}/.test(row.updated_at)
      ? String(row.updated_at).slice(0, 10) : "";
    urls.push(urlNode(ORIGIN + "/u/" + encodeURIComponent(slug), lastmod, "0.9"));
    // Accumulate non-empty role/section landing pages for discovery.
    const roleSlug = classifyPerson(row);
    if (roleSlug && roleSlug !== "other") {
      const section = sectionOf(roleSlug);
      if (section && section !== "other") {
        if (!sectionSeen.has(section)) { sectionSeen.add(section); landing.push(urlNode(ORIGIN + "/people/" + encodeURIComponent(section), "", "0.7")); }
        const key = section + "/" + roleSlug;
        if (!roleSeen.has(key)) { roleSeen.add(key); landing.push(urlNode(ORIGIN + "/people/" + encodeURIComponent(section) + "/" + encodeURIComponent(roleSlug), "", "0.6")); }
      }
    }
  }
  return urlset(landing.concat(urls));
}
// Business section + category landing pages (from the taxonomy facets). Included
// in the businesses sitemap so the capital-stack directory is crawlable.
async function businessFacetUrls() {
  try {
    const rows = await restRows("public_business_facets", {
      select: "section_slug,cat_slug,n",
    });
    const sectionSeen = new Set();
    const urls = [];
    for (const row of rows) {
      const section = cleanSlug(row.section_slug);
      const cat = cleanSlug(row.cat_slug);
      if (!section || section === "other") continue;
      if (!sectionSeen.has(section)) {
        sectionSeen.add(section);
        urls.push(urlNode(ORIGIN + "/businesses/" + encodeURIComponent(section), "", "0.7"));
      }
      if (cat && cat !== "other") {
        urls.push(urlNode(ORIGIN + "/businesses/" + encodeURIComponent(section) + "/" + encodeURIComponent(cat), "", "0.6"));
      }
    }
    return urls;
  } catch (err) {
    console.warn("[entity-sitemap] facet urls unavailable:", err && err.message);
    return [];
  }
}
// Business STATE landing pages: /businesses/in/:st (state total n ≥ 2) and
// /businesses/:section/:cat/in/:st (n ≥ 3, no "other"). Never fails the sitemap.
async function businessStateUrls() {
  try {
    const rows = await restRows("public_business_state_facets", {
      select: "state_code,section_slug,cat_slug,n",
    });
    const stateTotals = new Map();
    const catUrls = [];
    for (const row of rows) {
      const code = String(row.state_code || "").trim().toUpperCase();
      if (!STATE_CODES.has(code)) continue;
      const st = code.toLowerCase();
      const n = Number(row.n) || 0;
      stateTotals.set(st, (stateTotals.get(st) || 0) + n);
      const section = cleanSlug(row.section_slug);
      const cat = cleanSlug(row.cat_slug);
      if (n >= 3 && section && section !== "other" && cat && cat !== "other") {
        catUrls.push(urlNode(ORIGIN + "/businesses/" + encodeURIComponent(section) + "/" + encodeURIComponent(cat) + "/in/" + st, "", "0.5"));
      }
    }
    const urls = [];
    for (const [st, total] of [...stateTotals.entries()].sort()) {
      if (total >= 2) urls.push(urlNode(ORIGIN + "/businesses/in/" + st, "", "0.6"));
    }
    return urls.concat(catUrls);
  } catch (err) {
    console.warn("[entity-sitemap] state urls unavailable:", err && err.message);
    return [];
  }
}
// Pegasus Top Lenders 2025 honoree slugs (same rules as hmda-awards.js): U.S.
// rank ≤100, Top 25 within banks & CUs / independent mortgage companies, and the
// best-ranked lender HQ'd in each state with ≥3 ranked HQ lenders. `rows` must
// be ordered by hmda_rank, slug.
function honoreeSlugs(rows) {
  const out = new Set();
  const catSeen = { "financial-institutions": 0, "mortgage-companies": 0 };
  const states = new Map();
  for (const row of rows) {
    const rank = Number(row.hmda_rank);
    if (!Number.isFinite(rank) || rank < 1) continue;
    const slug = cleanSlug(row.slug);
    const cat = String(row.cat_slug || "").trim();
    let win = rank <= 100;
    if (Object.prototype.hasOwnProperty.call(catSeen, cat) && ++catSeen[cat] <= 25) win = true;
    if (win && slug) out.add(slug);
    const code = String(row.state_code || "").trim().toUpperCase();
    if (STATE_CODES.has(code)) {
      const e = states.get(code);
      if (e) e.n++; else states.set(code, { n: 1, slug });
    }
  }
  for (const e of states.values()) if (e.n >= 3 && e.slug) out.add(e.slug);
  return [...out];
}
// HMDA 2025 lender ranking pages: /rankings, the national list (+ ?page=2..10)
// and HQ-state lists with ≥3 ranked lenders, plus the Pegasus Top Lenders 2025
// award page and honoree pages. Never fails the sitemap.
async function rankingUrls() {
  const base = ORIGIN + "/rankings/top-mortgage-lenders-2025";
  const award = ORIGIN + "/awards/top-lenders-2025";
  const urls = [urlNode(ORIGIN + "/rankings", "", "0.7"), urlNode(base, "", "0.7"), urlNode(award, "", "0.7")];
  try {
    const rows = await restRows("public_business_directory", {
      select: "slug,cat_slug,state_code,hmda_rank",
      hmda_rank: "not.is.null",
      order: "hmda_rank.asc,slug.asc",
    });
    for (const slug of honoreeSlugs(rows)) urls.push(urlNode(award + "/" + encodeURIComponent(slug), "", "0.6"));
    const pages = Math.min(10, Math.ceil(rows.length / 100));
    for (let p = 2; p <= pages; p++) urls.push(urlNode(base + "?page=" + p, "", "0.5"));
    const counts = new Map();
    for (const row of rows) {
      const code = String(row.state_code || "").trim().toUpperCase();
      if (STATE_CODES.has(code)) counts.set(code, (counts.get(code) || 0) + 1);
    }
    for (const [code, n] of [...counts.entries()].sort()) {
      if (n >= 3) urls.push(urlNode(base + "/" + code.toLowerCase(), "", "0.6"));
    }
  } catch (err) {
    console.warn("[entity-sitemap] ranking urls unavailable:", err && err.message);
  }
  return urls;
}
async function presenceSitemap(kind) {
  const type = kind === "events" ? "event" : "company";
  const segment = kind === "events" ? "event" : "business";
  const rows = await restRows("public_presence_previews", {
    select: "presence_type,name,slug,status",
    presence_type: "eq." + type,
    status: "eq.active",
    order: "name.asc",
  });
  const seen = new Set();
  const urls = kind === "businesses" ? [urlNode(ORIGIN + "/lenders", "", "0.8")] : [];
  if (kind === "businesses") urls.push(...(await businessFacetUrls()), ...(await businessStateUrls()), ...(await rankingUrls()));
  for (const row of rows) {
    const slug = cleanSlug(row.slug);
    if (!slug || seen.has(slug) || !String(row.name || "").trim()) continue;
    seen.add(slug);
    urls.push(urlNode(ORIGIN + "/" + segment + "/" + encodeURIComponent(slug), "", "0.8"));
  }
  return urlset(urls);
}
function sitemapIndex() {
  const maps = ["sitemap-people.xml", "sitemap-businesses.xml", "sitemap-events.xml"];
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    maps.map(m => "  <sitemap><loc>" + xmlEscape(ORIGIN + "/" + m) + "</loc></sitemap>").join("\n") +
    "\n</sitemapindex>\n";
}
function response(body, status=200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=900, s-maxage=900" : "no-store",
    },
  });
}

export default async (request) => {
  try {
    const u = new URL(request.url);
    const publicPath = u.pathname.match(/^\/sitemap-(entities|people|businesses|events)\.xml$/);
    const kind = publicPath ? (publicPath[1] === "entities" ? "index" : publicPath[1])
      : (u.searchParams.get("kind") || "index");
    if (kind === "people") return response(await peopleSitemap());
    if (kind === "businesses") return response(await presenceSitemap("businesses"));
    if (kind === "events") return response(await presenceSitemap("events"));
    return response(sitemapIndex());
  } catch (err) {
    console.error("[entity-sitemap]", err);
    return response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 503);
  }
};

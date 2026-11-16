import lista from "./lista.json";
import { indicadores, senales } from "../docs/pronostico.js";

const OK = ["https://ipartarrieu.github.io", "http://localhost:8765", "http://localhost:8080"];
const YF = "https://query1.finance.yahoo.com/v8/finance/chart/";
const YS = "https://query1.finance.yahoo.com/v1/finance/search?";
const TICKER = /^[A-Za-z0-9.^=\-]{1,12}$/;
const RANGOS = { "1D": ["1d", "5m"], "1S": ["5d", "30m"], "1M": ["1mo", "1d"], "6M": ["6mo", "1d"], "1A": ["1y", "1d"],
  "5A": ["5y", "1wk"], "MAX": ["max", "1mo"] };

async function yahoo(path, ttl) {
  const r = await fetch(YF + path, { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: ttl, cacheEverything: true } });
  return (await r.json()).chart.result[0];
}

async function yj(url, ttl) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: ttl, cacheEverything: true } });
  return r.json();
}

async function cotizar(item) {
  try {
    const r = await yahoo(`${encodeURIComponent(item.t)}?interval=5m&range=1d`, 15), m = r.meta;
    const prev = m.chartPreviousClose || m.previousClose, p = m.regularMarketPrice;
    const cierres = (r.indicators.quote[0].close ?? []).filter((c) => c !== null);
    return { ...item, n: item.n ?? (m.longName || m.shortName || item.t), p, prev, var: prev ? (p / prev - 1) * 100 : 0, hora: m.regularMarketTime ?? null, spark: cierres, moneda: m.currency ?? null };
  } catch (e) {
    return { ...item, error: String(e.message ?? e).slice(0, 80) };
  }
}

async function unRango(t, rg) {
  const [rango, intervalo] = RANGOS[rg];
  try {
    const r = await yahoo(`${encodeURIComponent(t)}?interval=${intervalo}&range=${rango}`, 60);
    const pares = (r.timestamp ?? []).map((a, i) => [a, r.indicators.quote[0].close[i]]).filter((x) => x[1] !== null);
    const base = (["1D", "1S"].includes(rg) ? r.meta.chartPreviousClose : null) || pares[0][1];
    return { ts: pares.map((x) => x[0]), c: pares.map((x) => x[1]), base, var: (r.meta.regularMarketPrice / base - 1) * 100 };
  } catch (e) {
    return { error: String(e.message ?? e).slice(0, 80) };
  }
}

async function serie(t) {
  return Object.fromEntries(await Promise.all(Object.keys(RANGOS).map(async (g) => [g, await unRango(t, g)])));
}

async function barras(t) { // el pronóstico se calcula en el navegador (en el Worker gratis excede los 10 ms de CPU)
  try {
    const r = await yahoo(`${encodeURIComponent(t)}?interval=1h&range=2y`, 300), q = r.indicators.quote[0];
    const f = r.timestamp.map((x, i) => [x, q.open[i], q.high[i], q.low[i], q.close[i]]).filter((f) => !f.includes(null));
    return { ts: f.map((x) => x[0]), o: f.map((x) => x[1]), h: f.map((x) => x[2]), l: f.map((x) => x[3]), c: f.map((x) => x[4]) };
  } catch (e) {
    return { error: String(e.message ?? e).slice(0, 80) };
  }
}

async function buscar(q) {
  const j = await yj(`${YS}q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, 300);
  return (j.quotes ?? []).filter((x) => ["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY"].includes(x.quoteType)).slice(0, 8)
    .map((x) => ({ t: x.symbol, n: x.longname || x.shortname || x.symbol, tipo: x.typeDisp ?? null, bolsa: x.exchDisp ?? null }));
}

async function noticias(t) {
  const j = await yj(`${YS}q=${encodeURIComponent(t)}&quotesCount=0&newsCount=8`, 300);
  return (j.news ?? []).filter((x) => x.link?.startsWith("https://")).map((x) => {
    const rs = x.thumbnail?.resolutions ?? [], im = rs.find((r) => r.tag === "140x140") ?? [...rs].sort((a, b) => a.width - b.width)[0];
    return { titulo: x.title, fuente: x.publisher, link: x.link, ts: x.providerPublishTime, img: im?.url ?? null };
  }).sort((a, b) => b.ts - a.ts);
}

async function lectura(t) { // lectura técnica con barras de 1 h (2 meses); null si falla
  try {
    const r = await yahoo(`${encodeURIComponent(t)}?interval=1h&range=2mo`, 300), cl = (r.indicators.quote[0].close ?? []).filter((c) => c !== null);
    const score = senales(cl, indicadores(cl), cl.length - 1).reduce((a, s) => a + s[1], 0);
    return { score, max: 6, dir: score >= 2 ? "alcista" : score <= -2 ? "bajista" : "neutral" };
  } catch (e) {
    return { score: null, max: 6, dir: null };
  }
}

async function mercado() {
  const j = await yj("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=25", 300);
  const items = (j.finance.result[0].quotes ?? []).map((q) => ({
    t: q.symbol, n: q.longName || q.shortName || q.symbol, p: q.regularMarketPrice, var: q.regularMarketChangePercent,
    vol: q.regularMarketVolume, rating: q.averageAnalystRating ?? null,
    nrating: q.averageAnalystRating ? parseFloat(q.averageAnalystRating) || null : null, cap: q.marketCap ?? null,
  })).sort((a, b) => b.var - a.var);
  const top = items.filter((i) => i.vol > 0).slice(0, 12);
  const L = await Promise.all(top.map((i) => lectura(i.t)));
  top.forEach((i, k) => Object.assign(i, L[k]));
  return { ahora: Date.now() / 1000, items };
}

const valido = (u) => { const t = (u.searchParams.get("t") ?? "").toUpperCase(); return TICKER.test(t) ? t : null; };
const RUTAS = { // ruta -> [segundos de caché, función(url)]
  "/api/serie": [60, (u) => valido(u) ? serie(valido(u)) : {}],
  "/api/barras": [300, (u) => valido(u) ? barras(valido(u)) : {}],
  "/api/buscar": [300, (u) => { const q = (u.searchParams.get("q") ?? "").trim().slice(0, 40); return q ? buscar(q) : []; }],
  "/api/noticias": [300, (u) => valido(u) ? noticias(valido(u)) : []],
  "/api/mercado": [300, mercado],
};

async function responder(u) {
  if (u.pathname in RUTAS) return RUTAS[u.pathname][1](u);
  let items = lista;
  if (u.searchParams.has("t")) {
    const ts = [...new Set(u.searchParams.get("t").split(",").map((x) => x.trim().toUpperCase()))].filter((x) => TICKER.test(x)).slice(0, 30);
    items = ts.map((t) => lista.find((i) => i.t === t) ?? { t });
  }
  return { ahora: Date.now() / 1000, items: await Promise.all(items.map(cotizar)) };
}

export default {
  async fetch(req, env, ctx) {
    const o = req.headers.get("Origin");
    const cors = { "Access-Control-Allow-Origin": OK.includes(o) ? o : OK[0], "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const u = new URL(req.url);
    if (u.pathname !== "/api" && !(u.pathname in RUTAS)) return new Response("not found", { status: 404, headers: cors });
    // caché del resultado completo
    const ttl = RUTAS[u.pathname]?.[0] ?? 15, cache = caches.default, clave = new Request(u.href);
    let res = await cache.match(clave);
    if (!res) {
      res = new Response(JSON.stringify(await responder(u)), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } });
      ctx.waitUntil(cache.put(clave, res.clone()));
    }
    res = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

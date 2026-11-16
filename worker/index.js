import lista from "./lista.json";

const OK = ["https://ipartarrieu.github.io", "http://localhost:8765", "http://localhost:8080"];
const YF = "https://query1.finance.yahoo.com/v8/finance/chart/";
const RANGOS = { "1D": ["1d", "5m"], "1S": ["5d", "30m"], "1M": ["1mo", "1d"], "6M": ["6mo", "1d"], "1A": ["1y", "1d"],
  "5A": ["5y", "1wk"], "MAX": ["max", "1mo"] };

async function yahoo(path, ttl) {
  const r = await fetch(YF + path, { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: ttl, cacheEverything: true } });
  return (await r.json()).chart.result[0];
}

async function cotizar(item) {
  try {
    const r = await yahoo(`${item.t}?interval=5m&range=1d`, 15), m = r.meta;
    const prev = m.chartPreviousClose || m.previousClose, p = m.regularMarketPrice;
    const cierres = (r.indicators.quote[0].close ?? []).filter((c) => c !== null);
    return { ...item, p, prev, var: prev ? (p / prev - 1) * 100 : 0, hora: m.regularMarketTime ?? null, spark: cierres, moneda: m.currency ?? null };
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

const RUTAS = { // ruta -> [segundos de caché, función(ticker)]
  "/api/serie": [60, serie],
  "/api/barras": [300, barras],
};

async function responder(u) {
  const t = u.searchParams.get("t") ?? "";
  if (u.pathname in RUTAS) return lista.some((i) => i.t === t) ? RUTAS[u.pathname][1](t) : {};
  return { ahora: Date.now() / 1000, items: await Promise.all(lista.map(cotizar)) };
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

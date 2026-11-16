// Puerto de las funciones numéricas de servidor.py (mismo resultado).
const LN2 = Math.log(2);
const Z = { 0.5: 0.6745, 0.8: 1.2816 };
const sum = (a) => a.reduce((x, y) => x + y, 0);

export function ema(a, n) {
  const k = 2 / (n + 1), out = [a[0]];
  for (const x of a.slice(1)) out.push(x * k + out[out.length - 1] * (1 - k));
  return out;
}

export function sma(a, n) {
  const out = Array(n - 1).fill(null);
  for (let i = n - 1; i < a.length; i++) out.push(sum(a.slice(i - n + 1, i + 1)) / n);
  return out;
}

export function rsi(a, n = 14) { // RSI de Wilder
  const out = Array(a.length).fill(null);
  if (a.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { g += Math.max(a[i] - a[i - 1], 0); l += Math.max(a[i - 1] - a[i], 0); }
  g /= n; l /= n;
  for (let i = n; i < a.length; i++) {
    if (i > n) {
      const d = a[i] - a[i - 1];
      [g, l] = [(g * (n - 1) + Math.max(d, 0)) / n, (l * (n - 1) + Math.max(-d, 0)) / n];
    }
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

export function pendiente(c, i, n = 12) {
  const ys = c.slice(i - n + 1, i + 1), xm = (n - 1) / 2, ym = sum(ys) / n;
  let a = 0, b = 0;
  ys.forEach((y, k) => { a += (k - xm) * (y - ym); b += (k - xm) ** 2; });
  return a / b / ym;
}

const sg = (x) => (x > 0) - (x < 0);
const num = (x) => x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "_").replace(".", ",").replace(/_/g, ".");
const signo = (x) => (x < 0 || Object.is(x, -0) ? "-" : "+") + Math.abs(x).toFixed(2);

export function senales(c, I, i) {
  const p = c[i], r = I.rsi[i], s20 = I.s20[i], s50 = I.s50[i], pd = pendiente(c, i);
  return [
    ["Precio vs media móvil de 20 h", sg(p - s20), `${num(p)} frente a ${num(s20)}`],
    ["Media de 20 h vs media de 50 h", sg(s20 - s50), `${num(s20)} frente a ${num(s50)}`],
    ["Cruce corto EMA 9 vs EMA 21", sg(I.e9[i] - I.e21[i]), `${num(I.e9[i])} frente a ${num(I.e21[i])}`],
    ["MACD (12, 26, 9)", sg(I.hist[i]), `histograma ${num(I.hist[i])}`],
    ["RSI de 14 h", r >= 50 && r < 70 ? 1 : r > 30 && r < 50 ? -1 : 0,
      r.toFixed(0) + (r >= 70 ? " · sobrecompra, posible freno" : r <= 30 ? " · sobreventa, posible rebote" : "")],
    ["Pendiente de las últimas 12 h", sg(pd), `${signo(pd * 100)}% por hora`.replace(".", ",")],
  ];
}

export function indicadores(c) {
  const e26 = ema(c, 26), m = ema(c, 12).map((x, i) => x - e26[i]);
  const e9m = ema(m, 9);
  return { s20: sma(c, 20), s50: sma(c, 50), e9: ema(c, 9), e21: ema(c, 21), rsi: rsi(c), hist: m.map((x, i) => x - e9m[i]) };
}

export const var_barra = (o, h, l, c) =>
  Math.max(0.5 * Math.log(h / l) ** 2 - (2 * LN2 - 1) * Math.log(c / o) ** 2, 1e-12);

export function factores_hora(v, hrs, n) { // varianza media por hora / media global
  const acc = new Map();
  const hn = hrs.slice(-n);
  v.slice(-n).forEach((x, j) => { const h = hn[j]; if (!acc.has(h)) acc.set(h, []); acc.get(h).push(x); });
  const m = new Map([...acc].map(([h, a]) => [h, sum(a) / a.length]));
  const g = sum([...m.values()]) / m.size;
  return new Map([...m].map(([h, x]) => [h, x / g]));
}

export function cuantil(srt, p) { // el ceil((n+1)p)-ésimo menor score
  const k = Math.ceil((srt.length + 1) * p);
  return k <= srt.length ? srt[k - 1] : null;
}

const asc = (a, b) => a - b;

export function bandas(O, H, L, C, hrs, lam = 0.94, cal_n = 500, warm = 210, ks = [1, 2, 3], niveles = [0.5, 0.8]) {
  const N = C.length, orden = [...new Set(hrs)].sort(asc), pos = new Map(orden.map((h, i) => [h, i]));
  const v = [];
  for (let i = 0; i < N; i++) {
    let x = var_barra(O[i], H[i], L[i], C[i]);
    if (i && hrs[i] <= hrs[i - 1]) x += Math.log(O[i] / C[i - 1]) ** 2;
    v.push(x);
  }
  let s = new Map(), lvl = null;
  const cal = {}, pend = {}, hits = {};
  for (const k of ks) { cal[k] = []; pend[k] = []; for (const p of niveles) hits[`${k}_${p}`] = []; }
  const sigma = (t, k) => {
    const i = pos.get(hrs[t]);
    let a = 0;
    for (let j = 1; j <= k; j++) a += s.get(orden[(i + j) % orden.length]) ?? 1.0;
    return Math.sqrt(lvl * a);
  };
  for (let t = 0; t < N; t++) {
    if (t % 7 === 0 && t >= warm) s = factores_hora(v.slice(0, t + 1), hrs.slice(0, t + 1), 420);
    if (!s.size) continue;
    const x = v[t] / (s.get(hrs[t]) ?? 1.0);
    lvl = lvl === null ? x : lam * lvl + (1 - lam) * x;
    for (const k of ks) {
      while (pend[k].length && pend[k][0][0] <= t) { // solo scores cuyo horizonte ya cerró
        cal[k].push(pend[k].shift()[1]);
        if (cal[k].length > cal_n) cal[k].shift();
      }
      if (t + k < N) {
        const sc = Math.abs(Math.log(C[t + k] / C[t])) / sigma(t, k);
        if (cal[k].length >= 100) {
          const srt = [...cal[k]].sort(asc);
          for (const p of niveles) { const q = cuantil(srt, p); hits[`${k}_${p}`].push(q !== null && sc <= q); }
        }
        pend[k].push([t + k, sc]);
      }
    }
  }
  const q = {}, sig = {};
  for (const k of ks) {
    const srt = [...cal[k]].sort(asc);
    sig[k] = sigma(N - 1, k);
    q[k] = {};
    for (const p of niveles) q[k][p] = (srt.length >= 100 ? cuantil(srt, p) : null) || Z[p];
  }
  const cob = ks.map((k) => {
    const f = { k };
    for (const p of niveles) { const h = hits[`${k}_${p}`]; f[`c${Math.trunc(p * 100)}`] = h.length ? sum(h.map(Number)) / h.length : null; }
    f.n = hits[`${k}_${niveles[0]}`].length;
    return f;
  });
  return { sig, q, cob };
}

export function pt_z(pred, real, ne) { // Pesaran y Timmermann (1992), caso 2x2
  const n = pred.length;
  const P = pred.filter((a, i) => a === real[i]).length / n;
  const py = real.filter(Boolean).length / n, pq = pred.filter(Boolean).length / n;
  const Ps = py * pq + (1 - py) * (1 - pq);
  const vP = Ps * (1 - Ps) / ne;
  const vPs = ((2 * py - 1) ** 2 * pq * (1 - pq) + (2 * pq - 1) ** 2 * py * (1 - py)) / ne + 4 * py * pq * (1 - py) * (1 - pq) / ne ** 2;
  return [P, Ps, vP - vPs > 1e-12 ? (P - Ps) / Math.sqrt(vP - vPs) : 0.0];
}

export function prueba_direccion(c, I, h = 3, umbral = 2) {
  const pred = [], real = [];
  for (let j = 60; j < c.length - h; j++) {
    const s = sum(senales(c, I, j).map((x) => x[1]));
    if (Math.abs(s) >= umbral) { pred.push(s > 0); real.push(c[j + h] > c[j]); }
  }
  const n = pred.length;
  if (n < 30) return { n, n_eff: n / h, z: 0.0, acierto: null, base: null };
  const [P, Ps, z] = pt_z(pred, real, n / h);
  return { n, n_eff: Math.round(n / h), z, acierto: P, base: Ps };
}

const hora_ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" });

export function pronostico(c, ts, ohl) {
  if (c.length < 400) return { error: "poca historia" };
  const [O, H, L] = [0, 1, 2].map((j) => ohl.map((x) => x[j]));
  const hrs = ts.map((t) => +hora_ny.format(t * 1000));
  const I = indicadores(c), i = c.length - 1, sen = senales(c, I, i);
  const score = sum(sen.map((x) => x[1]));
  const dirn = score >= 2 ? "alcista" : score <= -2 ? "bajista" : "neutral";
  const pt = prueba_direccion(c, I);
  const validada = dirn !== "neutral" && pt.n_eff >= 100 && pt.z >= 1.645 && pt.acierto > pt.base;
  const bd = bandas(O, H, L, c, hrs);
  const pd = validada ? pendiente(c, i) : 0.0, proy = [];
  for (const h of [1, 2, 3]) {
    const ctr = c[i] * (1 + pd * h * 0.5), sig = bd.sig[h];
    const b = (p) => [ctr * Math.exp(-bd.q[h][p] * sig), ctr * Math.exp(bd.q[h][p] * sig)];
    proy.push({ h, c: ctr, b50: b(0.5), b80: b(0.8) });
  }
  const k = c.length - 48;
  return { dir: dirn, score, max: sen.length, senales: sen.map(([n, v, d]) => ({ n, v, d })), ultimo: c[i], validada,
    prueba: pt, cobertura: bd.cob, proy,
    serie: { ts: ts.slice(k), c: c.slice(k), s20: I.s20.slice(k), s50: I.s50.slice(k), o: O.slice(k), h: H.slice(k), l: L.slice(k) } };
}

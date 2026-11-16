// node test.mjs [ref.json]  -- ref.json: salida de servidor.py (sintetica + pronostico) volcada a JSON
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { pronostico, pt_z, rsi, sma } from "../docs/pronostico.js";

const ref = JSON.parse(readFileSync(process.argv[2] ?? "/tmp/claude-1000/-home-ipartarrieu-Claude/5ffac8e9-35ad-4cb2-ad91-2c59e7f0ab41/scratchpad/ref.json"));
const cerca = (a, b, ruta) => {
  if (typeof b === "number") return assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${ruta}: ${a} vs ${b}`);
  if (b && typeof b === "object") { assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort(), ruta); return Object.keys(b).forEach((k) => cerca(a[k], b[k], `${ruta}.${k}`)); }
  assert.strictEqual(a, b, ruta);
};
const R = {};
for (const n of ["azar", "mom"]) { R[n] = pronostico(ref[n].c, ref[n].ts, ref[n].ohl); cerca(R[n], ref[n].py, n); }
const { azar, mom } = R;
assert.ok(!azar.validada, JSON.stringify(azar.prueba));
for (const f of azar.cobertura) assert.ok(Math.abs(f.c80 - 0.8) < 0.06 && Math.abs(f.c50 - 0.5) < 0.06, JSON.stringify(f));
const [a, b] = [azar.proy[0], azar.proy[2]], w = (x) => x[1] - x[0];
assert.ok(w(b.b80) > w(a.b80) && w(a.b80) > w(a.b50) && w(a.b50) > 0);
assert.ok(mom.prueba.z > azar.prueba.z + 2);
const [P, Ps, z] = pt_z(ref.pt.x, ref.pt.y, ref.pt.x.length);
cerca([P, Ps, z], ref.pt.py, "pt_z");
assert.ok(rsi(Array.from({ length: 30 }, (_, i) => [1, 2, 3][i % 3]))[29] !== null && sma([1, 2, 3, 4], 2)[3] === 3.5);
console.log("ok", azar.prueba.z.toFixed(2), mom.prueba.z.toFixed(2), mom.validada);

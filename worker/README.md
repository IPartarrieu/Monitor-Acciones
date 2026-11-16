# Monitor de acciones: Worker de Cloudflare

Mismas rutas que `servidor.py`: `/api`, `/api/serie?t=`, `/api/barras?t=` (barras de 1 h; el pronóstico lo calcula la web con `docs/pronostico.js`) (datos de Yahoo Finance). `/api?t=A,B` (hasta 30 tickers), `/api/buscar?q=`, `/api/noticias?t=`, `/api/mercado` (mayores alzas del día con lectura técnica). `/api/serie` y `/api/barras` sirven cualquier ticker válido.

1. Cuenta gratuita en cloudflare.com (sin tarjeta).
2. Desde esta carpeta: `npx wrangler login` (abre el navegador).
3. `npx wrangler deploy` (imprime la URL `https://monitor-acciones.<tu-subdominio>.workers.dev`).
4. Poner esa URL como base de la API en la web de GitHub Pages.
5. Pruebas locales: `npx wrangler dev` y `curl localhost:8787/api`; numéricas: `node test.mjs`.
6. La lista de tickers está en `lista.json` (sin el campo `mia`); redesplegar tras editarla.
7. CORS permitido: ipartarrieu.github.io y localhost:8765 / :8080 (editar `OK` en `index.js`).
8. Plan gratis: 10 ms de CPU por petición; el pronóstico es pesado, por eso se cachea 300 s.

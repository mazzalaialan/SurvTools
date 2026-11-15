import fs from 'node:fs';
const profile = process.argv[2] || 'vehicle';
const g = JSON.parse(fs.readFileSync(`graph-${process.env.TAG || ''}${profile}.bin.json`, 'utf8'));
const { N, E, nlat, nlon, eFrom, eTo, eLen, eFlag } = g;
const t0 = performance.now();
// CSR con las dos direcciones (las de un solo sentido, solo la permitida)
const deg = new Uint32Array(N + 1);
for (let e = 0; e < E; e++) { deg[eFrom[e] + 1]++; if (!(eFlag[e] & 16)) deg[eTo[e] + 1]++; }
for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
const fill = deg.slice(); const adjTo = new Uint32Array(deg[N]); const adjLen = new Float32Array(deg[N]);
for (let e = 0; e < E; e++) { let p = fill[eFrom[e]]++; adjTo[p] = eTo[e]; adjLen[p] = eLen[e] / 10; if (!(eFlag[e] & 16)) { p = fill[eTo[e]]++; adjTo[p] = eFrom[e]; adjLen[p] = eLen[e] / 10; } }
const lat = Float64Array.from(nlat), lon = Float64Array.from(nlon);
console.log('CSR armado en', (performance.now() - t0).toFixed(0), 'ms; memoria RSS', (process.memoryUsage().rss / 1e6).toFixed(0), 'MB');
const R = 6371000, rad = Math.PI / 180;
const hav = (a, b) => { const dl = (lat[b]-lat[a])*rad, dn = (lon[b]-lon[a])*rad; const x = Math.sin(dl/2)**2 + Math.cos(lat[a]*rad)*Math.cos(lat[b]*rad)*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
// Componente más grande (aprox.): BFS desde el nodo de más grado
let seed = 0; for (let i = 0; i < N; i++) if (deg[i+1]-deg[i] > deg[seed+1]-deg[seed]) seed = i;
const comp = new Uint8Array(N); const q = [seed]; comp[seed] = 1;
for (let h = 0; h < q.length; h++) { const u = q[h]; for (let k = deg[u]; k < deg[u+1]; k++) { const v = adjTo[k]; if (!comp[v]) { comp[v] = 1; q.push(v); } } }
console.log('nodos en la componente grande', q.length, 'de', N);
// A* con montículo binario
const dist = new Float64Array(N), stamp = new Uint32Array(N); let run = 0;
function astar(s, t) {
  run++; const heap = []; const push = (f, v) => { heap.push([f, v]); let i = heap.length-1; while (i > 0) { const p = (i-1)>>1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2*i+1, r = l+1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  dist[s] = 0; stamp[s] = run; push(hav(s, t), s); let settled = 0;
  while (heap.length) { const [f, u] = pop(); const du = dist[u]; if (f - hav(u, t) > du + 1e-6 && stamp[u] === run && f > du + hav(u,t) + 1e-3) continue; settled++; if (u === t) return { d: du, settled };
    for (let k = deg[u]; k < deg[u+1]; k++) { const v = adjTo[k]; const nd = du + adjLen[k]; if (stamp[v] !== run || nd < dist[v]) { stamp[v] = run; dist[v] = nd; push(nd + hav(v, t), v); } } }
  return null;
}
const buckets = { '<2 km': [0, 2e3], '2-10 km': [2e3, 1e4], '10-50 km': [1e4, 5e4], '50-200 km': [5e4, 2e5], '>200 km': [2e5, 1e9] };
let seedR = 12345; const rnd = () => (seedR = (seedR * 1664525 + 1013904223) >>> 0) / 4294967296;
for (const [name, [lo, hi]] of Object.entries(buckets)) {
  const times = [], settledArr = [], ratios = [];
  let tries = 0;
  while (times.length < 40 && tries++ < 200000) {
    const s = q[Math.floor(rnd() * q.length)], t = q[Math.floor(rnd() * q.length)];
    const straight = hav(s, t); if (straight < lo || straight >= hi) continue;
    const a = performance.now(); const r = astar(s, t); const ms = performance.now() - a;
    if (r) { times.push(ms); settledArr.push(r.settled); ratios.push(r.d / straight); }
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)], p95 = times[Math.floor(times.length * 0.95)] ?? times.at(-1);
  console.log(name.padEnd(10), 'n=' + times.length, 'mediana', med?.toFixed(1), 'ms · p95', p95?.toFixed(1), 'ms · nodos explorados (med)', settledArr.sort((a,b)=>a-b)[Math.floor(settledArr.length/2)], '· largo/recta', (ratios.reduce((s,x)=>s+x,0)/ratios.length).toFixed(2));
}

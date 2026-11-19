// Каждой букве или ответу соответствует ровно одна краска.
export function groupPaints(palette, regions, limit, varied = false) {
  if (palette.length <= limit) return { palette, regions: regions.map(g => ({ ...g })) };
  const sizes = Array(palette.length).fill(0);
  for (const g of regions) sizes[g.pi] += g.size;
  const distance = (a, b) => a.reduce((sum, value, k) => sum + (value - b[k]) ** 2, 0);
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a] || a - b);
  const keep = order.slice(0, varied ? 1 : limit);
  while (keep.length < limit) {
    let selected, best = -1;
    for (const i of order) {
      if (keep.includes(i)) continue;
      const spread = Math.min(...keep.map(j => distance(palette[i], palette[j])));
      const score = spread * Math.sqrt(sizes[i]);
      if (score > best) { best = score; selected = i; }
    }
    keep.push(selected);
  }
  const mapped = palette.map(rgb => {
    let best = 0;
    for (let i = 1; i < keep.length; i++) if (distance(rgb, palette[keep[i]]) < distance(rgb, palette[keep[best]])) best = i;
    return best;
  });
  return { palette: keep.map(i => palette[i]), regions: regions.map(g => ({ ...g, pi: mapped[g.pi] })) };
}

// Отводим подписи крупным областям. Детали рядом получают цвет с той же заливкой.
export function guidePaint(regions, width, maxLabels = 22) {
  const ranked = [...regions].sort((a, b) => b.size - a.size || a.k - b.k);
  const guide = [], spacing = width * .063;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const region of ranked) {
    if (guide.length === maxLabels) break;
    if (!guide.length || (region.room >= 10 && guide.every(g => distance(g, region) >= spacing))) guide.push(region);
  }
  const members = new Set(guide.map(g => g.k));
  const groups = new Map(guide.map(g => [g.k, []]));
  for (const region of regions) {
    if (members.has(region.k)) continue;
    const score = g => distance(g, region) + (g.pi === region.pi ? 0 : width * .25);
    const closest = guide.reduce((a, b) => score(a) <= score(b) ? a : b);
    groups.get(closest.k).push(region);
  }
  return guide.map(g => ({ ...g, anchor: true, details: groups.get(g.k) }));
}

// Сначала видимая подпись, затем сама область. На границе ищем ближайший пиксель области.
export function targetPaint(regions, ids, w, h, x, y, labelRadius, edgeRadius) {
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  let label, best = labelRadius ** 2;
  for (const g of regions) {
    if (g.done || g.visible === false) continue;
    const d = (x - g.x) ** 2 + (y - g.y) ** 2;
    if (d <= best) { best = d; label = g; }
  }
  if (label) return label;
  const byId = new Map(regions.flatMap(g => [[g.k, g], ...(g.details || []).map(p => [p.k, g])]));
  const direct = byId.get(ids[y * w + x]);
  if (direct || ids[y * w + x] >= 0) return direct;
  let target;
  best = edgeRadius ** 2;
  for (let py = Math.max(0, y - edgeRadius); py <= Math.min(h - 1, y + edgeRadius); py++) {
    for (let px = Math.max(0, x - edgeRadius); px <= Math.min(w - 1, x + edgeRadius); px++) {
      const d = (px - x) ** 2 + (py - y) ** 2;
      const g = byId.get(ids[py * w + px]);
      if (g && !g.done && d < best) { best = d; target = g; }
    }
  }
  return target;
}

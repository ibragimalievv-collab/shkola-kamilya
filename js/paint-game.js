// Каждой букве или ответу соответствует ровно одна краска.
export function groupPaints(palette, regions, limit) {
  if (palette.length <= limit) return { palette, regions: regions.map(g => ({ ...g })) };
  const sizes = Array(palette.length).fill(0);
  for (const g of regions) sizes[g.pi] += g.size;
  const keep = sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a] || a - b).slice(0, limit);
  const distance = (a, b) => a.reduce((sum, value, k) => sum + (value - b[k]) ** 2, 0);
  const mapped = palette.map(rgb => {
    let best = 0;
    for (let i = 1; i < keep.length; i++) if (distance(rgb, palette[keep[i]]) < distance(rgb, palette[keep[best]])) best = i;
    return best;
  });
  return { palette: keep.map(i => palette[i]), regions: regions.map(g => ({ ...g, pi: mapped[g.pi] })) };
}

// Сначала видимая подпись, затем сама область. На границе ищем ближайший пиксель области.
export function targetPaint(regions, ids, w, h, x, y, labelRadius, edgeRadius) {
  const byId = new Map(regions.map(g => [g.k, g]));
  let label, best = labelRadius ** 2;
  for (const g of regions) {
    if (g.done || (!g.anchor && g.room < (g.text.length > 2 ? 19 : g.text.length > 1 ? 13 : 9))) continue;
    const d = (x - g.x) ** 2 + (y - g.y) ** 2;
    if (d <= best) { best = d; label = g; }
  }
  if (label) return label;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const direct = byId.get(ids[y * w + x]);
  if (direct) return direct;
  let target;
  best = edgeRadius ** 2;
  for (let py = Math.max(0, y - edgeRadius); py <= Math.min(h - 1, y + edgeRadius); py++) {
    for (let px = Math.max(0, x - edgeRadius); px <= Math.min(w - 1, x + edgeRadius); px++) {
      const d = (px - x) ** 2 + (py - y) ** 2;
      const g = byId.get(ids[py * w + px]);
      if (g && d < best) { best = d; target = g; }
    }
  }
  return target;
}

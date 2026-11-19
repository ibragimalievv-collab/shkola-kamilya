// Картинка печатается целиком на лицевых гранях. Каждая грань занимает своё
// место в исходном рисунке, поэтому спереди рисунок совпадает с оригиналом.
export const RELIEF_PARTS = 30;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const seedValue = index => ((1103515245 * (index + 71) + 12345) >>> 0) / 4294967296;

export function reliefLayout(width, height) {
  const columns = width >= height ? 6 : 5, rows = RELIEF_PARTS / columns;
  const dX = width / columns, dY = height / rows;
  const points = Array.from({ length: RELIEF_PARTS }, (_, i) => {
    const x = (i % columns + .5 + (seedValue(i * 7) - .5) * .56) * dX;
    const y = (Math.floor(i / columns) + .5 + (seedValue(i * 13 + 11) - .5) * .56) * dY;
    return { x, y };
  });
  const clip = (poly, p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const midX = (q.x + p.x) / 2, midY = (q.y + p.y) / 2;
    const side = ([x, y]) => (x - midX) * dx + (y - midY) * dy;
    return poly.flatMap((a, index) => {
      const b = poly[(index + 1) % poly.length], f = side(a), g = side(b);
      const inside = f <= 1e-6, crosses = inside !== (g <= 1e-6);
      if (!crosses) return inside ? [a] : [];
      const t = f / (f - g), at = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return inside ? [a, at] : [at];
    });
  };
  const size = Math.min(width, height);
  return points.map((point, id) => {
    let polygon = [[0, 0], [width, 0], [width, height], [0, height]];
    for (const other of points) if (other !== point) polygon = clip(polygon, point, other);
    const depth = size * (.021 + (point.y / height) * .096 + seedValue(id * 23) * .032);
    return { ...point, id, polygon, depth };
  });
}

export function makeRelief(ctx, image) {
  const w = image.width, h = image.height, parts = reliefLayout(w, h);
  const color = document.createElement('canvas');
  color.width = 72; color.height = 48;
  const sampleContext = color.getContext('2d', { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0, 72, 48);
  const pixels = sampleContext.getImageData(0, 0, 72, 48).data;
  const sideColor = part => {
    const i = (Math.min(47, Math.round(part.y / h * 47)) * 72 + Math.min(71, Math.round(part.x / w * 71))) * 4;
    return Array.from(pixels.slice(i, i + 3), value => Math.round(value * .65 + 30));
  };
  const materials = parts.map(sideColor);

  function trace(points, curve = 0) {
    ctx.beginPath();
    if (!curve) {
      ctx.moveTo(...points[0]);
      for (const point of points.slice(1)) ctx.lineTo(...point);
    } else {
      const toward = (a, b) => a.map((x, i) => x + (b[i] - x) * curve);
      for (let i = 0; i < points.length; i++) {
        const p = points[i], prev = toward(p, points[(i + points.length - 1) % points.length]), next = toward(p, points[(i + 1) % points.length]);
        if (i === 0) ctx.moveTo(...prev); else ctx.lineTo(...prev);
        ctx.quadraticCurveTo(...p, ...next);
      }
    }
    ctx.closePath();
  }

  return ({ yaw = 0, pitch = 0, revealed = new Set(), all = false, active = -1 } = {}) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const sy = Math.sin(clamp(yaw, -.66, .66)), cy = Math.sqrt(1 - sy * sy);
    const sp = Math.sin(clamp(pitch, -.48, .48)), cp = Math.sqrt(1 - sp * sp);
    const s = Math.min(W * .89 / w, H * .82 / h);
    const x0 = W / 2, y0 = H / 2;
    const project = (x, y, z = 0) => [x0 + s * ((x - w / 2) * cy + z * sy),
      y0 + s * ((y - h / 2) * cp + ((x - w / 2) * sy - z * cy) * sp)];
    const order = part => -(part.x - w / 2) * sy * cp + (part.y - h / 2) * sp + part.depth * cy * cp;
    const transform = z => {
      const origin = project(0, 0, z);
      ctx.transform(s * cy, s * sy * sp, 0, s * cp, ...origin);
    };
    ctx.clearRect(0, 0, W, H);
    const shadow = ctx.createRadialGradient(x0, H * .87, 0, x0, H * .87, W * .5);
    shadow.addColorStop(0, '#31575066'); shadow.addColorStop(1, '#31575000');
    ctx.fillStyle = shadow; ctx.fillRect(0, 0, W, H);

    ctx.save();
    transform(0);
    ctx.fillStyle = '#ecf2ee';
    ctx.fillRect(0, 0, w, h);
    if (!all) {
      ctx.globalAlpha = .22;
      ctx.drawImage(image, 0, 0);
      ctx.globalAlpha = 1;
      for (const part of parts) {
        trace(part.polygon, .06);
        ctx.lineWidth = part.id === active ? 5 / s : 1.25 / s;
        ctx.strokeStyle = part.id === active ? '#166a58' : '#637e7577';
        ctx.stroke();
      }
    }
    ctx.restore();

    for (const part of parts.slice().sort((a, b) => order(a) - order(b))) {
      if (!all && !revealed.has(part.id)) continue;
      const sides = part.polygon;
      const z = part.depth;
      for (let i = 0; i < sides.length; i++) {
        const a = sides[i], b = sides[(i + 1) % sides.length];
        const points = [project(...a), project(...b), project(...b, z), project(...a, z)];
        const area = points.reduce((sum, point, j) => {
          const other = points[(j + 1) % points.length];
          return sum + point[0] * other[1] - point[1] * other[0];
        }, 0);
        if (area > 0) {
          trace(points);
          ctx.fillStyle = `rgb(${materials[part.id].map(x => Math.round(x * (i % 2 ? .88 : 1))).join(',')})`;
          ctx.fill();
        }
      }
      ctx.save();
      transform(z);
      trace(part.polygon, Math.abs(yaw) + Math.abs(pitch) > .06 ? .044 : 0);
      ctx.clip();
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    }
    // Анфас собранный рельеф можно рассмотреть как исходный рисунок без швов.
    if (all && Math.abs(yaw) + Math.abs(pitch) <= .06) {
      ctx.save(); transform(0); ctx.drawImage(image, 0, 0); ctx.restore();
    }
  };
}

import qrcode from './vendor/qrcode.mjs';
import { h } from './util.js';

export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte'); qr.make();
  return Array.from({ length: qr.getModuleCount() }, (_, row) =>
    Array.from({ length: qr.getModuleCount() }, (_, col) => qr.isDark(row, col)));
}

export function qrDisplaySide(modules, available, pixelRatio = 1) {
  return modules * Math.max(1, Math.floor(available * pixelRatio / modules)) / pixelRatio;
}

export function qrCanvas(text, label) {
  const matrix = qrMatrix(text), scale = 6, margin = 4;
  const side = (matrix.length + margin * 2) * scale;
  const canvas = h('canvas', { width: side, height: side, class: 'progress-qr', role: 'img', 'aria-label': label, 'data-qr-modules': matrix.length + margin * 2 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, side, side); ctx.fillStyle = '#000';
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
  }));
  return canvas;
}

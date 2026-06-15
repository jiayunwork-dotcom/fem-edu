import { Polygon } from './types.js';

export class UndoRedoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  push(state) {
    this.undoStack.push(JSON.stringify(state));
    this.redoStack = [];
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  undo(currentState) {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(JSON.stringify(currentState));
    return JSON.parse(this.undoStack.pop());
  }

  redo(currentState) {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(JSON.stringify(currentState));
    return JSON.parse(this.redoStack.pop());
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

export class CanvasTransform {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.scale + this.offsetX,
      y: this.height - (wy * this.scale + this.offsetY)
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (this.height - sy - this.offsetY) / this.scale
    };
  }

  zoom(factor, cx, cy) {
    const before = this.screenToWorld(cx, cy);
    this.scale *= factor;
    const after = this.worldToScreen(before.x, before.y);
    this.offsetX += cx - after.x;
    this.offsetY += (this.height - cy) - after.y;
  }

  pan(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  fitToBounds(bounds, margin = 50) {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w === 0 || h === 0) return;
    const sx = (this.width - 2 * margin) / w;
    const sy = (this.height - 2 * margin) / h;
    this.scale = Math.min(sx, sy);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const s = this.worldToScreen(cx, cy);
    this.offsetX += this.width / 2 - s.x;
    this.offsetY += this.height / 2 - s.y;
  }
}

export function drawGrid(ctx, transform, spacing = 50) {
  const { width, height, scale } = transform;
  ctx.save();
  ctx.strokeStyle = '#eef2f7';
  ctx.lineWidth = 1;
  const worldSpacing = spacing / Math.max(0.1, scale);
  const startX = Math.floor((-transform.offsetX) / scale / worldSpacing) * worldSpacing;
  const endX = startX + (width / scale / worldSpacing + 2) * worldSpacing;
  const startY = Math.floor((-transform.offsetY) / scale / worldSpacing) * worldSpacing;
  const endY = startY + (height / scale / worldSpacing + 2) * worldSpacing;
  for (let x = startX; x <= endX; x += worldSpacing) {
    const sp = transform.worldToScreen(x, 0);
    ctx.beginPath();
    ctx.moveTo(sp.x, 0);
    ctx.lineTo(sp.x, height);
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y += worldSpacing) {
    const sp = transform.worldToScreen(0, y);
    ctx.beginPath();
    ctx.moveTo(0, sp.y);
    ctx.lineTo(width, sp.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawAxes(ctx, transform) {
  const { width, height } = transform;
  const o = transform.worldToScreen(0, 0);
  ctx.save();
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5;
  if (o.x > 0 && o.x < width) {
    ctx.beginPath();
    ctx.moveTo(o.x, 0);
    ctx.lineTo(o.x, height);
    ctx.stroke();
  }
  if (o.y > 0 && o.y < height) {
    ctx.beginPath();
    ctx.moveTo(0, o.y);
    ctx.lineTo(width, o.y);
    ctx.stroke();
  }
  ctx.fillStyle = '#e74c3c';
  ctx.font = '12px sans-serif';
  const axisEndX = transform.worldToScreen(Math.max(10, width / transform.scale * 0.3), 0);
  ctx.fillText('X', Math.min(axisEndX.x, width - 15), o.y - 5);
  const axisEndY = transform.worldToScreen(0, Math.max(10, height / transform.scale * 0.3));
  ctx.fillStyle = '#27ae60';
  ctx.fillText('Y', o.x + 5, Math.min(axisEndY.y, height - 15) + 12);
  ctx.restore();
}

export function polygonToTemplate(points, isHole = false) {
  return new Polygon(points, isHole);
}

export function createRectTemplate(width, height, cx = 0, cy = 0) {
  const hw = width / 2, hh = height / 2;
  return new Polygon([
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
    { x: cx - hw, y: cy - hh }
  ]);
}

export function createLShape(w1, h1, w2, h2) {
  return new Polygon([
    { x: 0, y: 0 },
    { x: w1, y: 0 },
    { x: w1, y: h2 },
    { x: w2, y: h2 },
    { x: w2, y: h1 },
    { x: 0, y: h1 },
    { x: 0, y: 0 }
  ]);
}

export function createIShape(H, B, tf, tw) {
  const h = H / 2;
  const b = B / 2;
  return new Polygon([
    { x: -b, y: -h },
    { x: b, y: -h },
    { x: b, y: -h + tf },
    { x: tw / 2, y: -h + tf },
    { x: tw / 2, y: h - tf },
    { x: b, y: h - tf },
    { x: b, y: h },
    { x: -b, y: h },
    { x: -b, y: h - tf },
    { x: -tw / 2, y: h - tf },
    { x: -tw / 2, y: -h + tf },
    { x: -b, y: -h + tf },
    { x: -b, y: -h }
  ]);
}

export function createHoleCircle(cx, cy, r, nseg = 32) {
  const pts = [];
  for (let i = 0; i <= nseg; i++) {
    const a = (i / nseg) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return new Polygon(pts, true);
}

export function stressToColor(value, min, max, type = 'jet') {
  if (max === min) return '#808080';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (type === 'jet') {
    let r, g, b;
    if (t < 0.125) { r = 0; g = 0; b = 0.5 + 4 * t; }
    else if (t < 0.375) { r = 0; g = 4 * (t - 0.125); b = 1; }
    else if (t < 0.625) { r = 4 * (t - 0.375); g = 1; b = 1 - 4 * (t - 0.375); }
    else if (t < 0.875) { r = 1; g = 1 - 4 * (t - 0.625); b = 0; }
    else { r = 1 - 4 * (t - 0.875); g = 0; b = 0; }
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }
  const r = Math.round(255 * t);
  const b = Math.round(255 * (1 - t));
  return `rgb(${r},${Math.round(255 - Math.abs(t - 0.5) * 510)},${b})`;
}

export function drawArrow(ctx, x1, y1, x2, y2, color = '#e74c3c', size = 8) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function findNearestPoint(points, x, y, tolerance = 10) {
  let nearest = null, minDist = tolerance * tolerance;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < minDist) { minDist = d; nearest = i; }
  }
  return nearest;
}

export function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { dist: Math.hypot(px - x1, py - y1), t: 0 };
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), t, cx, cy };
}

export function findNearestEdge(polygon, x, y) {
  const pts = polygon.points;
  let nearest = null, minDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const res = pointToSegmentDist(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (res.dist < minDist) {
      minDist = res.dist;
      nearest = { index: i, p1: pts[i], p2: pts[i + 1], ...res };
    }
  }
  return nearest;
}

export function findNearestNode(nodes, x, y, tolerance = 15) {
  let nearest = null, minDist = tolerance * tolerance;
  for (const n of nodes) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < minDist) { minDist = d; nearest = n; }
  }
  return nearest;
}

export function findNearestElement(elements, x, y) {
  for (const el of elements) {
    const [n1, n2, n3] = el.nodes;
    if (pointInTriangle(x, y, n1.x, n1.y, n2.x, n2.y, n3.x, n3.y)) return el;
  }
  return null;
}

function sign(x1, y1, x2, y2, x3, y3) {
  return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
}

export function pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = sign(px, py, x1, y1, x2, y2);
  const d2 = sign(px, py, x2, y2, x3, y3);
  const d3 = sign(px, py, x3, y3, x1, y1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

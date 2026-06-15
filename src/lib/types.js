// 核心数据类型定义

export class Node {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.ux = 0;
    this.uy = 0;
    this.fx = 0;
    this.fy = 0;
    this.constraints = { ux: false, uy: false, kx: null, ky: null };
    this.onBoundary = false;
  }

  get coords() { return [this.x, this.y]; }
  get dofX() { return this.id * 2; }
  get dofY() { return this.id * 2 + 1; }
}

export class TriangleElement {
  constructor(id, n1, n2, n3, thickness = 1.0) {
    this.id = id;
    this.nodes = [n1, n2, n3];
    this.t = thickness;
    this.stress = { sx: 0, sy: 0, sxy: 0, vm: 0 };
    this.strain = { ex: 0, ey: 0, gxy: 0 };
    this.quality = 0;
    this.minAngle = 0;
    this.maxAngle = 0;
  }

  get nodeIds() { return this.nodes.map(n => n.id); }

  get area() {
    const [n1, n2, n3] = this.nodes;
    return Math.abs((n2.x - n1.x) * (n3.y - n1.y) - (n3.x - n1.x) * (n2.y - n1.y)) / 2;
  }

  get centroid() {
    const [n1, n2, n3] = this.nodes;
    return {
      x: (n1.x + n2.x + n3.x) / 3,
      y: (n1.y + n2.y + n3.y) / 3
    };
  }

  get circumcircle() {
    const [n1, n2, n3] = this.nodes;
    const ax = n1.x, ay = n1.y;
    const bx = n2.x, by = n2.y;
    const cx = n3.x, cy = n3.y;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);
    return { cx: ux, cy: uy, r };
  }

  containsPoint(px, py) {
    const { cx, cy, r } = this.circumcircle;
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r * (1 + 1e-12);
  }

  computeAngles() {
    const [n1, n2, n3] = this.nodes;
    const a = Math.hypot(n2.x - n3.x, n2.y - n3.y);
    const b = Math.hypot(n1.x - n3.x, n1.y - n3.y);
    const c = Math.hypot(n1.x - n2.x, n1.y - n2.y);
    const A = Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c))));
    const B = Math.acos(Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))));
    const C = Math.PI - A - B;
    const angles = [A, B, C].map(a => a * 180 / Math.PI);
    this.minAngle = Math.min(...angles);
    this.maxAngle = Math.max(...angles);
    const r = 2 * this.area / (a + b + c);
    const R = (a * b * c) / (4 * this.area);
    this.quality = R > 0 ? 2 * r / R : 0;
    return angles;
  }
}

export class Polygon {
  constructor(points = [], isHole = false) {
    this.points = points.map(p => ({ x: p.x, y: p.y }));
    this.isHole = isHole;
    this.id = Math.random().toString(36).slice(2, 9);
  }

  get isClosed() {
    if (this.points.length < 3) return false;
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    return Math.hypot(first.x - last.x, first.y - last.y) < 1e-6;
  }

  close() {
    if (!this.isClosed && this.points.length >= 3) {
      this.points.push({ ...this.points[0] });
    }
  }

  pointInPolygon(px, py) {
    if (!this.isClosed) return false;
    let inside = false;
    const pts = this.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  get boundingBox() {
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys)
    };
  }
}

export class Material {
  constructor(E = 210e9, nu = 0.3, rho = 7850) {
    this.E = E;
    this.nu = nu;
    this.rho = rho;
  }

  getDMatrix(planeStress = true, t = 1.0) {
    const { E, nu } = this;
    if (planeStress) {
      const c = E / (1 - nu * nu);
      return [
        [c, c * nu, 0],
        [c * nu, c, 0],
        [0, 0, c * (1 - nu) / 2]
      ];
    } else {
      const c = E / ((1 + nu) * (1 - 2 * nu));
      return [
        [c * (1 - nu), c * nu, 0],
        [c * nu, c * (1 - nu), 0],
        [0, 0, c * (1 - 2 * nu) / 2]
      ];
    }
  }
}

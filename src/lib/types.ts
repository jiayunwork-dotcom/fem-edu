export interface Point2D {
  x: number;
  y: number;
}

export interface Constraints {
  ux: boolean;
  uy: boolean;
  kx?: number | null;
  ky?: number | null;
}

export interface Stress {
  sx: number;
  sy: number;
  sxy: number;
  vm: number;
  s1?: number;
  s2?: number;
  theta1?: number;
  theta2?: number;
}

export interface Strain {
  ex: number;
  ey: number;
  gxy: number;
}

export class Node {
  id: number;
  x: number;
  y: number;
  ux: number = 0;
  uy: number = 0;
  fx: number = 0;
  fy: number = 0;
  constraints: Constraints = { ux: false, uy: false, kx: null, ky: null };
  onBoundary: boolean = false;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }

  get coords(): [number, number] {
    return [this.x, this.y];
  }
  get dofX(): number {
    return this.id * 2;
  }
  get dofY(): number {
    return this.id * 2 + 1;
  }
}

export class TriangleElement {
  id: number;
  nodes: [Node, Node, Node];
  t: number;
  stress: Stress = { sx: 0, sy: 0, sxy: 0, vm: 0 };
  strain: Strain = { ex: 0, ey: 0, gxy: 0 };
  quality: number = 0;
  minAngle: number = 0;
  maxAngle: number = 0;

  constructor(id: number, n1: Node, n2: Node, n3: Node, thickness: number = 1.0) {
    this.id = id;
    this.nodes = [n1, n2, n3];
    this.t = thickness;
  }

  get nodeIds(): number[] {
    return this.nodes.map(n => n.id);
  }

  get area(): number {
    const [n1, n2, n3] = this.nodes;
    return Math.abs((n2.x - n1.x) * (n3.y - n1.y) - (n3.x - n1.x) * (n2.y - n1.y)) / 2;
  }

  get centroid(): Point2D {
    const [n1, n2, n3] = this.nodes;
    return {
      x: (n1.x + n2.x + n3.x) / 3,
      y: (n1.y + n2.y + n3.y) / 3
    };
  }

  get circumcircle(): { cx: number; cy: number; r: number } {
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

  containsPoint(px: number, py: number): boolean {
    const { cx, cy, r } = this.circumcircle;
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r * (1 + 1e-12);
  }

  computeAngles(): number[] {
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
  points: Point2D[];
  isHole: boolean;
  id: string;

  constructor(points: Point2D[] = [], isHole: boolean = false) {
    this.points = points.map(p => ({ x: p.x, y: p.y }));
    this.isHole = isHole;
    this.id = Math.random().toString(36).slice(2, 9);
  }

  get isClosed(): boolean {
    if (this.points.length < 3) return false;
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    return Math.hypot(first.x - last.x, first.y - last.y) < 1e-6;
  }

  close(): void {
    if (!this.isClosed && this.points.length >= 3) {
      this.points.push({ ...this.points[0] });
    }
  }

  pointInPolygon(px: number, py: number): boolean {
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

  get boundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys)
    };
  }
}

export interface MaterialData {
  E: number;
  nu: number;
  rho: number;
  getDMatrix: (planeStress?: boolean) => number[][];
}

export class Material {
  E: number;
  nu: number;
  rho: number;

  constructor(E: number = 210e9, nu: number = 0.3, rho: number = 7850) {
    this.E = E;
    this.nu = nu;
    this.rho = rho;
  }

  getDMatrix(planeStress: boolean = true): number[][] {
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

export interface EdgeLoad {
  polyId: string;
  edgeIdx: number;
  p1: Point2D;
  p2: Point2D;
  normal: number;
  shear: number;
}

export interface SelectedEdge {
  polyId: string;
  polyIdx: number;
  edgeIdx: number;
  p1: Point2D;
  p2: Point2D;
}

export interface ConvergenceEntry {
  elements: number;
  maxStress: number;
  time: number;
}

export interface LevelQuestion {
  field: string;
  label: string;
  answer: number;
  tolerance?: number;
  relative?: boolean;
}

export interface LevelData {
  nodes?: Point2D[];
  questions?: LevelQuestion[];
  template?: string;
  params?: Record<string, number>;
  meshSize?: number;
  material?: { E: number; nu: number; rho?: number };
  thickness?: number;
  constraints?: Array<{ edge: string; type: string }>;
  loads?: Array<Record<string, unknown>>;
  expectedMaxDisp?: number;
  expectedMaxStress?: number;
  requiredRuns?: number;
  sizes?: number[];
  expectedConvergence?: boolean;
  analyticSolution?: Record<string, string>;
  hint?: string;
  requiredMetrics?: { minQuality?: number; convergence?: boolean };
  tolerance?: number;
}

export interface Level {
  id: number;
  name: string;
  category: string;
  description: string;
  type: 'manual' | 'guided' | 'analysis' | 'full';
  data: LevelData;
  unlockCondition: string;
}

export interface MeshStats {
  nodeCount: number;
  elementCount: number;
  minAngle: number;
  maxAngle: number;
  minQuality: number;
  avgQuality: number;
}

export interface BodyForce {
  fx: number;
  fy: number;
}

export interface PolygonState {
  points: Point2D[];
  isHole: boolean;
  id: string;
}

export interface Measurement {
  id: number;
  p1: Point2D;
  p2: Point2D;
  distance: number;
  timestamp: number;
}

export interface LevelScore {
  levelId: number;
  levelName: string;
  category: string;
  completed: boolean;
  completionTime: number;
  timeTaken: number;
  attempts: number;
  correctAnswers: number;
  totalQuestions: number;
  accuracy: number;
}

export type SectionType = 'rectangle' | 'circle' | 'hollowCircle' | 'tShape' | 'polygon';

export interface SectionRectParams {
  width: number;
  height: number;
}

export interface SectionCircleParams {
  diameter: number;
}

export interface SectionHollowCircleParams {
  outerDiameter: number;
  innerDiameter: number;
}

export interface SectionTShapeParams {
  flangeWidth: number;
  flangeThickness: number;
  webHeight: number;
  webThickness: number;
}

export interface SectionPolygonParams {
  vertices: Point2D[];
}

export type SectionParams = SectionRectParams | SectionCircleParams | SectionHollowCircleParams | SectionTShapeParams | SectionPolygonParams;

export interface SectionProperties {
  area: number;
  Ix: number;
  Iy: number;
  Ip: number;
  Wx: number;
  Wy: number;
  centroidX: number;
  centroidY: number;
  maxX: number;
  maxY: number;
}

export interface CrossSection {
  id: string;
  name: string;
  type: SectionType;
  params: SectionParams;
  properties: SectionProperties;
  createdAt: number;
  updatedAt: number;
}

export interface SectionValidationErrors {
  [key: string]: string;
}

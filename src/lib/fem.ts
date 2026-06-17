import { Node, TriangleElement, Polygon } from './types.js';
import type { Point2D, MeshStats, BodyForce, EdgeLoad, MaterialData } from './types.js';
import { zeros, zerosVec, matMul, matTranspose, matScalar, solveLinearSystem, type Matrix, type Vector } from './matrix.js';

export interface MeshAnimStep {
  type: string;
  triangles?: Array<Record<string, unknown>>;
  points?: Point2D[];
  badTriangles?: Array<Record<string, unknown>>;
  newTriangles?: Array<Record<string, unknown>>;
  allTriangles?: Array<Record<string, unknown>>;
  nodes?: Point2D[];
  desc?: string;
  point?: Point2D;
}

export interface BowyerWatsonResult {
  triangles: TriangleElement[];
  nodes: Node[];
  steps: MeshAnimStep[];
}

export function bowyerWatson(points: Point2D[], boundaryPolygons: Polygon[] = [], holePolygons: Polygon[] = [], animate: boolean = false): BowyerWatsonResult {
  const steps: MeshAnimStep[] = [];
  const pts: Node[] = points.map((p, i) => new Node(i, p.x, p.y));
  if (pts.length < 3) return { triangles: [], nodes: pts, steps };

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX, dy = maxY - minY;
  const delta = Math.max(dx, dy) * 10;
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;

  let nodeIdCounter = pts.length;
  const p1 = new Node(nodeIdCounter++, midX - delta, midY - delta);
  const p2 = new Node(nodeIdCounter++, midX + delta, midY - delta);
  const p3 = new Node(nodeIdCounter++, midX, midY + delta);
  const allNodes = [...pts, p1, p2, p3];
  const superTri = new TriangleElement(-1, p1, p2, p3);
  const superIds = new Set<number>([p1.id, p2.id, p3.id]);

  let triangles: TriangleElement[] = [superTri];

  if (animate) {
    steps.push({ type: 'init', triangles: serializeTriangles(triangles), points: pts.map(p => ({ x: p.x, y: p.y, id: p.id })), desc: '初始化超级三角形' });
  }

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const badTriangles: TriangleElement[] = [];
    for (const t of triangles) {
      if (t.containsPoint(p.x, p.y)) badTriangles.push(t);
    }
    const polygon: Array<[Node, Node]> = [];
    for (let a = 0; a < badTriangles.length; a++) {
      const ta = badTriangles[a];
      const edges: Array<[Node, Node]> = [
        [ta.nodes[0], ta.nodes[1]],
        [ta.nodes[1], ta.nodes[2]],
        [ta.nodes[2], ta.nodes[0]]
      ];
      for (const e of edges) {
        let shared = false;
        for (let b = 0; b < badTriangles.length; b++) {
          if (a === b) continue;
          const tb = badTriangles[b];
          const e2s: Array<[Node, Node]> = [
            [tb.nodes[0], tb.nodes[1]],
            [tb.nodes[1], tb.nodes[2]],
            [tb.nodes[2], tb.nodes[0]]
          ];
          for (const e2 of e2s) {
            if ((edgeEq(e, e2) || edgeEq(e, [e2[1], e2[0]]))) { shared = true; break; }
          }
          if (shared) break;
        }
        if (!shared) polygon.push(e);
      }
    }
    triangles = triangles.filter(t => !badTriangles.includes(t));
    for (const e of polygon) {
      const newTri = new TriangleElement(triangles.length, e[0], e[1], p);
      triangles.push(newTri);
    }
    if (animate) {
      steps.push({
        type: 'insert',
        point: { x: p.x, y: p.y, id: p.id },
        badTriangles: serializeTriangles(badTriangles),
        newTriangles: serializeTriangles(triangles.filter(t => t.nodes.includes(p))),
        allTriangles: serializeTriangles(triangles),
        desc: `插入节点 ${i + 1}：删除 ${badTriangles.length} 个外接圆包含该点的三角形，重建多边形空洞`
      });
    }
  }

  triangles = triangles.filter(t => !t.nodes.some(n => superIds.has(n.id)));
  const finalNodes = allNodes.filter(n => !superIds.has(n.id));
  for (let i = 0; i < finalNodes.length; i++) finalNodes[i].id = i;
  const idMap: Record<number, Node> = {};
  finalNodes.forEach((n, i) => { idMap[pts[i].id] = n; });
  triangles = triangles.map((t, i) => {
    const nt = new TriangleElement(i, idMap[t.nodes[0].id] || t.nodes[0], idMap[t.nodes[1].id] || t.nodes[1], idMap[t.nodes[2].id] || t.nodes[2]);
    return nt;
  });

  if (boundaryPolygons.length > 0 || holePolygons.length > 0) {
    triangles = triangles.filter(t => {
      const c = t.centroid;
      let insideOuter = boundaryPolygons.length === 0;
      for (const bp of boundaryPolygons) {
        if (bp.pointInPolygon(c.x, c.y)) { insideOuter = true; break; }
      }
      let inHole = false;
      for (const hp of holePolygons) {
        if (hp.pointInPolygon(c.x, c.y)) { inHole = true; break; }
      }
      return insideOuter && !inHole;
    });
  }

  for (const t of triangles) t.computeAngles();

  if (animate) {
    steps.push({ type: 'done', triangles: serializeTriangles(triangles), nodes: finalNodes.map(n => ({ x: n.x, y: n.y, id: n.id })), desc: '完成网格生成' });
  }

  return { triangles, nodes: finalNodes, steps };
}

function serializeTriangles(tris: TriangleElement[]): Array<Record<string, unknown>> {
  return tris.map(t => ({
    id: t.id,
    nodes: t.nodes.map(n => ({ x: n.x, y: n.y, id: n.id })),
    circumcircle: t.circumcircle
  }));
}

function edgeEq(e1: [Node, Node], e2: [Node, Node]): boolean {
  return e1[0].id === e2[0].id && e1[1].id === e2[1].id;
}

export function generateSeedsOnBoundary(polygons: Polygon[], spacing: number): Point2D[] {
  const seeds: Point2D[] = [];
  for (const poly of polygons) {
    const pts = poly.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const n = Math.max(1, Math.ceil(len / spacing));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        seeds.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
      }
    }
  }
  return mergeClosePoints(seeds, spacing * 0.5);
}

export function generateInteriorSeeds(polygon: Polygon, holePolygons: Polygon[], spacing: number): Point2D[] {
  const seeds: Point2D[] = [];
  const bb = polygon.boundingBox;
  const margin = spacing * 0.1;
  const minX = bb.minX + margin, maxX = bb.maxX - margin;
  const minY = bb.minY + margin, maxY = bb.maxY - margin;
  let row = 0;
  for (let y = minY; y <= maxY; y += spacing * Math.sqrt(3) / 2) {
    const offset = (row % 2) * spacing / 2;
    for (let x = minX + offset; x <= maxX; x += spacing) {
      if (polygon.pointInPolygon(x, y)) {
        let inHole = false;
        for (const hp of holePolygons) {
          if (hp.pointInPolygon(x, y)) { inHole = true; break; }
        }
        if (!inHole) seeds.push({ x, y });
      }
    }
    row++;
  }
  return seeds;
}

function mergeClosePoints(pts: Point2D[], tol: number): Point2D[] {
  const out: Point2D[] = [];
  const tol2 = tol * tol;
  for (const p of pts) {
    let dup = false;
    for (const q of out) {
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy < tol2) { dup = true; break; }
    }
    if (!dup) out.push(p);
  }
  return out;
}

export interface ElementStiffnessResult {
  Ke: Matrix;
  B: Matrix;
  D: Matrix;
  A: number;
  coeffs: Array<{ a: number; b: number; c: number }>;
  BtDB: Matrix;
}

export function computeElementStiffness(element: TriangleElement, material: MaterialData, planeStress: boolean = true): ElementStiffnessResult {
  const [n1, n2, n3] = element.nodes;
  const x1 = n1.x, y1 = n1.y;
  const x2 = n2.x, y2 = n2.y;
  const x3 = n3.x, y3 = n3.y;
  const A = element.area;
  if (A < 1e-12) return { Ke: zeros(6, 6), B: zeros(3, 6), D: zeros(3, 3), A: 0, coeffs: [], BtDB: zeros(6, 6) };

  const a1 = x2 * y3 - x3 * y2;
  const a2 = x3 * y1 - x1 * y3;
  const a3 = x1 * y2 - x2 * y1;
  const b1 = y2 - y3, b2 = y3 - y1, b3 = y1 - y2;
  const c1 = x3 - x2, c2 = x1 - x3, c3 = x2 - x1;
  const coeffs = [
    { a: a1, b: b1, c: c1 },
    { a: a2, b: b2, c: c2 },
    { a: a3, b: b3, c: c3 }
  ];

  const B: Matrix = [
    [b1, 0, b2, 0, b3, 0],
    [0, c1, 0, c2, 0, c3],
    [c1, b1, c2, b2, c3, b3]
  ].map(r => r.map(v => v / (2 * A)));

  const D = material.getDMatrix(planeStress);
  const Bt = matTranspose(B);
  const BtD = matMul(Bt, D);
  const BtDB = matMul(BtD, B);
  const Ke = matScalar(BtDB, element.t * A);

  return { Ke, B, D, A, coeffs, BtDB };
}

export interface AssemblyResult {
  K: Matrix;
  F: Vector;
  elementKeList: Array<{ element: TriangleElement; Ke: Matrix }>;
}

export function assembleGlobalSystem(nodes: Node[], elements: TriangleElement[], material: MaterialData, planeStress: boolean = true, bodyForce: BodyForce | null = null): AssemblyResult {
  const N = nodes.length;
  const K = zeros(2 * N, 2 * N);
  const F = zerosVec(2 * N);
  const elementKeList: Array<{ element: TriangleElement; Ke: Matrix }> = [];

  for (const el of elements) {
    const { Ke } = computeElementStiffness(el, material, planeStress);
    elementKeList.push({ element: el, Ke });
    const dofs: number[] = [];
    for (const n of el.nodes) {
      dofs.push(n.dofX, n.dofY);
    }
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K[dofs[i]][dofs[j]] += Ke[i][j];
      }
    }
    if (bodyForce) {
      const A = el.area;
      for (let k = 0; k < 3; k++) {
        const dofX = el.nodes[k].dofX;
        const dofY = el.nodes[k].dofY;
        F[dofX] += bodyForce.fx * A * el.t / 3;
        F[dofY] += bodyForce.fy * A * el.t / 3;
      }
    }
  }

  return { K, F, elementKeList };
}

export function applyNodalLoads(nodes: Node[], F: Vector): Vector {
  for (const n of nodes) {
    if (n.fx || n.fy) {
      F[n.dofX] += n.fx;
      F[n.dofY] += n.fy;
    }
  }
  return F;
}

export function applyEdgeLoads(nodes: Node[], elements: TriangleElement[], edgeLoads: EdgeLoad[], F: Vector): Vector {
  for (const load of edgeLoads) {
    const n1 = nodes[(load as unknown as { node1Id: number }).node1Id];
    const n2 = nodes[(load as unknown as { node2Id: number }).node2Id];
    if (!n1 || !n2) continue;
    const len = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    const dx = (n2.x - n1.x) / len;
    const dy = (n2.y - n1.y) / len;
    let fx1, fy1, fx2, fy2;
    if ((load as unknown as { type: string }).type === 'normal') {
      const nx = -dy, ny = dx;
      const totF = (load as unknown as { value: number }).value * len;
      fx1 = nx * totF / 2;
      fy1 = ny * totF / 2;
      fx2 = nx * totF / 2;
      fy2 = ny * totF / 2;
    } else {
      const tx = dx, ty = dy;
      const totF = (load as unknown as { value: number }).value * len;
      fx1 = tx * totF / 2;
      fy1 = ty * totF / 2;
      fx2 = tx * totF / 2;
      fy2 = ty * totF / 2;
    }
    F[n1.dofX] += fx1;
    F[n1.dofY] += fy1;
    F[n2.dofX] += fx2;
    F[n2.dofY] += fy2;
  }
  return F;
}

export interface ConstraintResult {
  constraints: boolean[];
  springs: Array<{ dof: number; k: number }>;
}

export function getConstraintVector(nodes: Node[]): ConstraintResult {
  const N = nodes.length;
  const c: boolean[] = zerosVec(2 * N) as unknown as boolean[];
  const springMods: Array<{ dof: number; k: number }> = [];
  for (const n of nodes) {
    if (n.constraints.ux) c[n.dofX] = true;
    if (n.constraints.uy) c[n.dofY] = true;
    if (n.constraints.kx != null) springMods.push({ dof: n.dofX, k: n.constraints.kx });
    if (n.constraints.ky != null) springMods.push({ dof: n.dofY, k: n.constraints.ky });
  }
  return { constraints: c, springs: springMods };
}

export interface FEMOptions {
  planeStress?: boolean;
  bodyForce?: BodyForce | null;
  edgeLoads?: EdgeLoad[];
}

export interface FEMResult {
  U: Vector;
  K: Matrix;
  F: Vector;
  elementKeList: Array<{ element: TriangleElement; Ke: Matrix }>;
  constraints: boolean[];
}

export function solveFEM(nodes: Node[], elements: TriangleElement[], material: MaterialData, options: FEMOptions = {}): FEMResult {
  const { planeStress = true, bodyForce = null, edgeLoads = [] } = options;
  let { K, F, elementKeList } = assembleGlobalSystem(nodes, elements, material, planeStress, bodyForce);
  F = applyNodalLoads(nodes, F);
  F = applyEdgeLoads(nodes, elements, edgeLoads, F);

  const { constraints, springs } = getConstraintVector(nodes);
  for (const s of springs) K[s.dof][s.dof] += s.k;
  const U = solveLinearSystem(K, F, constraints);

  for (const n of nodes) {
    n.ux = U[n.dofX];
    n.uy = U[n.dofY];
  }

  computeStresses(nodes, elements, material, planeStress);

  return { U, K, F, elementKeList, constraints };
}

export function computeStresses(nodes: Node[], elements: TriangleElement[], material: MaterialData, planeStress: boolean = true): void {
  for (const el of elements) {
    const { B, D } = computeElementStiffness(el, material, planeStress);
    const u: number[] = [];
    for (const n of el.nodes) u.push(n.ux, n.uy);
    const strain: number[] = [];
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let j = 0; j < 6; j++) s += B[i][j] * u[j];
      strain.push(s);
    }
    const stress: number[] = [];
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let j = 0; j < 3; j++) s += D[i][j] * strain[j];
      stress.push(s);
    }
    el.strain = { ex: strain[0], ey: strain[1], gxy: strain[2] };
    const sx = stress[0], sy = stress[1], sxy = stress[2];
    el.stress = { sx, sy, sxy, vm: Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * sxy * sxy) };
  }
}

export function getMeshStats(elements: TriangleElement[]): MeshStats | null {
  if (elements.length === 0) return null;
  let minQ = Infinity, maxQ = -Infinity, sumQ = 0;
  let minA = Infinity, minAngle = Infinity, maxAngle = -Infinity;
  for (const el of elements) {
    minQ = Math.min(minQ, el.quality);
    maxQ = Math.max(maxQ, el.quality);
    sumQ += el.quality;
    minA = Math.min(minA, el.area);
    minAngle = Math.min(minAngle, el.minAngle);
    maxAngle = Math.max(maxAngle, el.maxAngle);
  }
  return {
    elementCount: elements.length,
    nodeCount: new Set(elements.flatMap(e => e.nodeIds)).size,
    minQuality: minQ,
    maxQuality: maxQ,
    avgQuality: sumQ / elements.length,
    minArea: minA,
    minAngle,
    maxAngle
  } as unknown as MeshStats;
}

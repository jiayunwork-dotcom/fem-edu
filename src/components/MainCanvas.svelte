<script lang="ts">
import { onMount, onDestroy, afterUpdate } from 'svelte';
import type { Node, TriangleElement, Polygon } from '$lib/types.js';
import type { CanvasTransform as CanvasTransformType } from '$lib/canvasUtils.js';
import {
  CanvasTransform, drawGrid, drawAxes, drawArrow,
  findNearestPoint, findNearestNode, findNearestElement,
  findNearestEdge, stressToColor, pointInTriangle
} from '$lib/canvasUtils.js';
import {
  polygons as polysStore, currentPolygonPoints as curPtsStore,
  drawingMode as drawModeStore, holeMode as holeStore,
  selectedVertex as selVertStore, nodes as nodesStore,
  elements as elemsStore, meshAnimStep as meshStepStore,
  meshAnimSteps as meshStepsStore, material as matStore,
  planeStress as psStore, thickness as thickStore,
  bodyForce as bfStore, edgeLoads as eloadsStore,
  selectedNodes as selNodesStore, selectedEdges as selEdgesStore,
  femResults as femResStore, postProcessMode as postModeStore,
  deformationScale as defScaleStore, stressType as sTypeStore,
  selectedElement as selElStore, pushUndo, resetGeometry,
  clearMesh, meshSpacing as spacingStore,
  showPrincipalStress as spsStore, principalStressScale as pssStore,
  refineMode as rfModeStore, refineSelection as rfSelStore,
  measurements as measStore, measurementFirstPoint as measFirstStore,
  meshStats as msStore
} from '$lib/stores.js';
import { refineElementsInRegion } from '$lib/fem.js';
import {
  generateSeedsOnBoundary, generateInteriorSeeds,
  bowyerWatson, solveFEM
} from '$lib/fem.js';

export let width = 800;
export let height = 600;
export let onMeshGenerated;
export let onFEMComplete;

let canvas, ctx;
let transform;
let isDragging = false;
let isPanning = false;
let dragStart = { x: 0, y: 0 };
let hoverPos = { x: 0, y: 0 };
let rafId = null;

let curUnsubs = [];
let st_polys, st_curPts, st_drawMode, st_hole, st_selVert, st_nodes, st_elems;
let st_meshStep, st_meshSteps, st_mat, st_ps, st_thickness, st_bf, st_eloads, st_selNodes, st_selEdges;
let st_femRes, st_postMode, st_defScale, st_sType, st_spacing, st_selEl;
let st_showPS, st_psScale, st_rfMode, st_rfSel, st_measurements, st_measFirst, st_ms;
let hoverEdge = null;
let rectDragStart: { x: number; y: number } | null = null;
let rectDragCurrent: { x: number; y: number } | null = null;

onMount(() => {
  transform = new CanvasTransform(width, height);
  ctx = canvas.getContext('2d');
  transform.scale = 2;
  transform.offsetX = width / 2;
  transform.offsetY = height / 2;
  curUnsubs = [
    polysStore.subscribe(v => st_polys = Array.isArray(v) ? v : []),
    curPtsStore.subscribe(v => st_curPts = Array.isArray(v) ? v : []),
    drawModeStore.subscribe(v => st_drawMode = v || 'select'),
    holeStore.subscribe(v => st_hole = !!v),
    selVertStore.subscribe(v => st_selVert = v),
    nodesStore.subscribe(v => st_nodes = Array.isArray(v) ? v : []),
    elemsStore.subscribe(v => st_elems = Array.isArray(v) ? v : []),
    meshStepStore.subscribe(v => st_meshStep = Number(v) || -1),
    meshStepsStore.subscribe(v => st_meshSteps = Array.isArray(v) ? v : []),
    matStore.subscribe(v => st_mat = v),
    psStore.subscribe(v => st_ps = v !== false),
    thickStore.subscribe(v => st_thickness = Number(v) || 0.01),
    bfStore.subscribe(v => st_bf = v),
    eloadsStore.subscribe(v => st_eloads = Array.isArray(v) ? v : []),
    selNodesStore.subscribe(v => st_selNodes = v instanceof Set ? v : new Set()),
    selEdgesStore.subscribe(v => st_selEdges = Array.isArray(v) ? v : []),
    femResStore.subscribe(v => st_femRes = v),
    postModeStore.subscribe(v => st_postMode = v || 'deformation'),
    defScaleStore.subscribe(v => st_defScale = Number(v) || 0),
    sTypeStore.subscribe(v => st_sType = v || 'vm'),
    spacingStore.subscribe(v => st_spacing = Number(v) || 30),
    selElStore.subscribe(v => st_selEl = v),
    spsStore.subscribe(v => st_showPS = !!v),
    pssStore.subscribe(v => st_psScale = Number(v) || 50),
    rfModeStore.subscribe(v => st_rfMode = !!v),
    rfSelStore.subscribe(v => st_rfSel = v),
    measStore.subscribe(v => st_measurements = Array.isArray(v) ? v : []),
    measFirstStore.subscribe(v => st_measFirst = v),
    msStore.subscribe(v => st_ms = v)
  ];
  render();
});

onDestroy(() => {
  curUnsubs.forEach(u => u());
  if (rafId) cancelAnimationFrame(rafId);
});

afterUpdate(() => { render(); });

function render() {
  if (!ctx || !transform) return;
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, transform);
  drawAxes(ctx, transform);
  drawPolygons();
  drawEdgeSelections();
  drawEdgeLoads();
  drawCurrentDrawing();
  drawMeshAnim();
  drawFinalMesh();
  drawPrincipalStress();
  drawMeasurements();
  drawConstraints();
  drawPostProcess();
  drawRefineSelection();
  drawMeasurementFirstPoint();
  drawHoverEdgeHighlight();
  drawHoverInfo();
}

function drawPolygons() {
  for (const poly of st_polys || []) {
    if (!poly.points || poly.points.length < 2) continue;
    const isHole = !!poly.isHole;
    const sp = poly.points.map(p => transform.worldToScreen(p.x, p.y));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    if (isHole) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = 'rgba(52,152,219,0.08)';
      ctx.fill();
      ctx.strokeStyle = '#2980b9';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < poly.points.length - 1; i++) {
      ctx.beginPath();
      ctx.arc(sp[i].x, sp[i].y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isHole ? '#e67e22' : '#2980b9';
      ctx.fill();
    }
  }
}

function drawEdgeSelections() {
  if (!st_selEdges || !st_selEdges.length) return;
  ctx.save();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const e of st_selEdges) {
    const p1 = transform.worldToScreen(e.p1.x, e.p1.y);
    const p2 = transform.worldToScreen(e.p2.x, e.p2.y);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHoverEdgeHighlight() {
  if (st_drawMode !== 'edge' || !hoverEdge) return;
  const p1 = transform.worldToScreen(hoverEdge.p1.x, hoverEdge.p1.y);
  const p2 = transform.worldToScreen(hoverEdge.p2.x, hoverEdge.p2.y);
  ctx.save();
  ctx.strokeStyle = 'rgba(241,196,15,0.6)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
}

function drawEdgeLoads() {
  if (!st_eloads || !st_eloads.length) return;
  for (const el of st_eloads) {
    const p1 = transform.worldToScreen(el.p1.x, el.p1.y);
    const p2 = transform.worldToScreen(el.p2.x, el.p2.y);
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const L = Math.hypot(dx, dy);
    if (L < 1) continue;
    const tx = dx / L, ty = dy / L;
    const nx = -ty, ny = tx;
    const nSteps = Math.max(3, Math.floor(L / 18));
    const maxP = Math.max(Math.abs(el.normal || 0), Math.abs(el.shear || 0), 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(231,76,60,0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i <= nSteps; i++) {
      const t = i / nSteps;
      const cx = p1.x + tx * L * t;
      const cy = p1.y + ty * L * t;
      if (Math.abs(el.normal || 0) > 1e-6) {
        const len = Math.min(40, 8 + Math.log10(Math.abs(el.normal) + 1) * 12);
        const sign = el.normal > 0 ? 1 : -1;
        drawArrow(ctx, cx, cy, cx + nx * len * sign, cy + ny * len * sign, '#e74c3c', 7);
      }
      if (Math.abs(el.shear || 0) > 1e-6) {
        const len = Math.min(35, 7 + Math.log10(Math.abs(el.shear) + 1) * 11);
        const sign = el.shear > 0 ? 1 : -1;
        drawArrow(ctx, cx, cy, cx + tx * len * sign, cy + ty * len * sign, '#8e44ad', 6);
      }
    }
  }
}

function drawCurrentDrawing() {
  const pts = st_curPts || [];
  if (!pts.length) return;
  const sp = pts.map(p => transform.worldToScreen(p.x, p.y));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
  if (st_drawMode === 'draw' && hoverPos) {
    ctx.lineTo(hoverPos.x, hoverPos.y);
    ctx.lineTo(sp[0].x, sp[0].y);
  }
  ctx.strokeStyle = st_hole ? '#e67e22' : '#3498db';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  for (let i = 0; i < sp.length; i++) {
    ctx.beginPath();
    ctx.arc(sp[i].x, sp[i].y, 5, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#e74c3c' : '#3498db';
    ctx.fill();
  }
}

function drawMeshAnim() {
  if (st_meshStep < 0 || !st_meshSteps || !st_meshSteps.length) return;
  const step = st_meshSteps[st_meshStep];
  if (!step || step.type !== 'insert') return;
  if (step.badTriangles) {
    for (const t of step.badTriangles) drawTriNodes(t.nodes, 'rgba(231,76,60,0.45)', '#e74c3c', 2);
  }
  if (step.point) {
    const sp = transform.worldToScreen(step.point.x, step.point.y);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f';
    ctx.fill();
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  if (step.newTriangles) {
    for (const t of step.newTriangles) drawTriNodes(t.nodes, 'rgba(46,204,113,0.4)', '#27ae60', 2.5);
  }
}

function drawFinalMesh() {
  if (!st_elems || !st_elems.length) return;
  if (st_meshStep >= 0 && st_meshSteps && st_meshSteps.length) return;
  let minV = Infinity, maxV = -Infinity;
  const color = st_femRes && (st_postMode === 'stress');
  if (color) {
    for (const el of st_elems) {
      const s = el.stress || { sx: 0, sy: 0, sxy: 0, vm: 0 };
      const v = st_sType === 'sx' ? s.sx : st_sType === 'sy' ? s.sy : st_sType === 'sxy' ? s.sxy : s.vm;
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
  }
  for (const el of st_elems) {
    const ns = el.nodes.map(n => {
      const sc = st_defScale || 0;
      if (st_femRes && st_postMode !== 'stress') {
        return transform.worldToScreen(n.x + (n.ux || 0) * sc, n.y + (n.uy || 0) * sc);
      }
      return transform.worldToScreen(n.x, n.y);
    });
    ctx.save();
    const isSel = st_selEl && st_selEl.id === el.id;
    if (color) {
      const s = el.stress || {};
      const v = st_sType === 'sx' ? (s.sx || 0) : st_sType === 'sy' ? (s.sy || 0) : st_sType === 'sxy' ? (s.sxy || 0) : (s.vm || 0);
      ctx.fillStyle = stressToColor(v, minV, maxV);
      ctx.beginPath();
      ctx.moveTo(ns[0].x, ns[0].y);
      ctx.lineTo(ns[1].x, ns[1].y);
      ctx.lineTo(ns[2].x, ns[2].y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(ns[0].x, ns[0].y);
    ctx.lineTo(ns[1].x, ns[1].y);
    ctx.lineTo(ns[2].x, ns[2].y);
    ctx.closePath();
    ctx.strokeStyle = isSel ? '#e74c3c' : '#7f8c8d';
    ctx.lineWidth = isSel ? 2.2 : 0.7;
    ctx.stroke();
    ctx.restore();
  }
  if (st_femRes && st_postMode === 'deformation' && (st_defScale || 0) > 0) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(149,165,166,0.7)';
    ctx.lineWidth = 1;
    for (const el of st_elems) {
      const ns = el.nodes.map(n => transform.worldToScreen(n.x, n.y));
      ctx.beginPath();
      ctx.moveTo(ns[0].x, ns[0].y);
      ctx.lineTo(ns[1].x, ns[1].y);
      ctx.lineTo(ns[2].x, ns[2].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const n of st_nodes || []) {
    const sp = transform.worldToScreen(n.x, n.y);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = st_selNodes && st_selNodes.has(n.id) ? '#e74c3c' : '#2c3e50';
    ctx.fill();
  }
}

function drawTriNodes(ns, fill, stroke, lw) {
  const sp = ns.map(n => transform.worldToScreen(n.x, n.y));
  ctx.save();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    ctx.lineTo(sp[1].x, sp[1].y);
    ctx.lineTo(sp[2].x, sp[2].y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(sp[0].x, sp[0].y);
  ctx.lineTo(sp[1].x, sp[1].y);
  ctx.lineTo(sp[2].x, sp[2].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawConstraints() {
  for (const n of st_nodes || []) {
    const sp = transform.worldToScreen(n.x, n.y);
    const c = n.constraints || {};
    if (c.ux || c.uy || c.kx != null || c.ky != null) {
      ctx.save();
      ctx.fillStyle = '#27ae60';
      ctx.strokeStyle = '#1e8449';
      ctx.lineWidth = 1.5;
      if (c.ux && c.uy) {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - 9);
        ctx.lineTo(sp.x + 8, sp.y + 6);
        ctx.lineTo(sp.x - 8, sp.y + 6);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (c.ux) {
        ctx.fillRect(sp.x - 9, sp.y - 2, 18, 4);
      } else if (c.uy) {
        ctx.fillRect(sp.x - 2, sp.y - 9, 4, 18);
      }
      if (c.kx != null || c.ky != null) {
        ctx.strokeStyle = '#8e44ad';
        ctx.beginPath();
        ctx.moveTo(sp.x - 10, sp.y - 12);
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(sp.x + (i % 2 ? 10 : -10), sp.y - 12 + (i + 1) * 3);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if ((n.fx || n.fy) && (Math.abs(n.fx) > 1e-9 || Math.abs(n.fy) > 1e-9)) {
      const mag = Math.hypot(n.fx, n.fy);
      const len = Math.min(60, Math.max(18, 10 + Math.log10(mag + 1) * 14));
      const nx = n.fx / mag, ny = n.fy / mag;
      const ws = transform.worldToScreen(n.x, n.y);
      const we = transform.worldToScreen(n.x + nx * len / transform.scale, n.y + ny * len / transform.scale);
      drawArrow(ctx, ws.x, ws.y, we.x, we.y, '#e74c3c', 9);
    }
  }
}

function drawPostProcess() {
  if (!st_femRes || st_postMode !== 'contour') return;
  const vals = (st_nodes || []).map(n => Math.hypot(n.ux || 0, n.uy || 0));
  const levels = 10;
  const minV = Math.min(...vals, 1e-99), maxV = Math.max(...vals, -1e-99);
  if (maxV - minV < 1e-20) return;
  const sc = st_defScale || 0;
  for (let l = 1; l < levels; l++) {
    const target = minV + (maxV - minV) * (l / levels);
    ctx.save();
    ctx.strokeStyle = `hsl(${(l / levels) * 240},70%,45%)`;
    ctx.lineWidth = 1.5;
    for (const el of st_elems || []) {
      const segs = [];
      const ids = el.nodes.map(n => n.id);
      const vs = ids.map(i => vals[i] || 0);
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if ((vs[i] - target) * (vs[j] - target) < 0) {
          const t = (target - vs[i]) / (vs[j] - vs[i]);
          const ni = el.nodes[i], nj = el.nodes[j];
          const ux = (ni.ux || 0) + ((nj.ux || 0) - (ni.ux || 0)) * t;
          const uy = (ni.uy || 0) + ((nj.uy || 0) - (ni.uy || 0)) * t;
          const wx = ni.x + (nj.x - ni.x) * t + ux * sc;
          const wy = ni.y + (nj.y - ni.y) * t + uy * sc;
          segs.push(transform.worldToScreen(wx, wy));
        }
      }
      if (segs.length === 2) {
        ctx.beginPath();
        ctx.moveTo(segs[0].x, segs[0].y);
        ctx.lineTo(segs[1].x, segs[1].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawPrincipalStress() {
  if (!st_showPS || !st_femRes || !st_elems || !st_elems.length) return;
  let maxAbs = 0;
  for (const el of st_elems) {
    if (el.stress && el.stress.s1 != null && el.stress.s2 != null) {
      maxAbs = Math.max(maxAbs, Math.abs(el.stress.s1), Math.abs(el.stress.s2));
    }
  }
  if (maxAbs < 1e-9) return;
  const scale = (st_psScale || 50) / transform.scale;
  for (const el of st_elems) {
    if (!el.stress || el.stress.s1 == null || el.stress.s2 == null || el.stress.theta1 == null || el.stress.theta2 == null) continue;
    const c = el.centroid;
    const sc = transform.worldToScreen(c.x, c.y);
    const { s1, s2, theta1, theta2 } = el.stress;
    const len1 = (Math.abs(s1) / maxAbs) * scale;
    const len2 = (Math.abs(s2) / maxAbs) * scale;
    if (len1 > 0.5 / transform.scale) {
      const dx1 = Math.cos(theta1) * len1;
      const dy1 = Math.sin(theta1) * len1;
      const p1s = transform.worldToScreen(c.x - dx1 / 2, c.y - dy1 / 2);
      const p1e = transform.worldToScreen(c.x + dx1 / 2, c.y + dy1 / 2);
      ctx.save();
      ctx.strokeStyle = s1 > 0 ? '#e74c3c' : '#3498db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      ctx.lineTo(p1e.x, p1e.y);
      ctx.stroke();
      ctx.restore();
    }
    if (len2 > 0.5 / transform.scale) {
      const dx2 = Math.cos(theta2) * len2;
      const dy2 = Math.sin(theta2) * len2;
      const p2s = transform.worldToScreen(c.x - dx2 / 2, c.y - dy2 / 2);
      const p2e = transform.worldToScreen(c.x + dx2 / 2, c.y + dy2 / 2);
      ctx.save();
      ctx.strokeStyle = s2 > 0 ? '#e74c3c' : '#3498db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p2s.x, p2s.y);
      ctx.lineTo(p2e.x, p2e.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawMeasurements() {
  if (!st_measurements || !st_measurements.length) return;
  for (const m of st_measurements) {
    const p1 = transform.worldToScreen(m.p1.x, m.p1.y);
    const p2 = transform.worldToScreen(m.p2.x, m.p2.y);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.save();
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9b59b6';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
    ctx.fill();
    const label = m.distance.toFixed(3);
    ctx.font = 'bold 12px monospace';
    const w = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(155, 89, 182, 0.9)';
    ctx.fillRect(midX - w / 2 - 6, midY - 10, w + 12, 18);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY - 1);
    ctx.restore();
  }
}

function drawRefineSelection() {
  if (!st_rfMode || !rectDragStart || !rectDragCurrent) return;
  const x1 = Math.min(rectDragStart.x, rectDragCurrent.x);
  const y1 = Math.min(rectDragStart.y, rectDragCurrent.y);
  const w = Math.abs(rectDragCurrent.x - rectDragStart.x);
  const h = Math.abs(rectDragCurrent.y - rectDragStart.y);
  ctx.save();
  ctx.strokeStyle = '#e67e22';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x1, y1, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(230, 126, 34, 0.1)';
  ctx.fillRect(x1, y1, w, h);
  ctx.restore();
}

function drawMeasurementFirstPoint() {
  if (st_drawMode !== 'measure' || !st_measFirst) return;
  const p = transform.worldToScreen(st_measFirst.x, st_measFirst.y);
  ctx.save();
  ctx.strokeStyle = '#9b59b6';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(155, 89, 182, 0.3)';
  ctx.fill();
  ctx.fillStyle = '#9b59b6';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('P1', p.x, p.y - 14);
  ctx.restore();
}

function drawHoverInfo() {
  if (!hoverPos) return;
  const wp = transform.screenToWorld(hoverPos.x, hoverPos.y);
  if (st_nodes && st_nodes.length) {
    const nearN = findNearestNode(st_nodes, wp.x, wp.y, 15 / transform.scale);
    if (nearN) {
      const sp = transform.worldToScreen(nearN.x, nearN.y);
      ctx.save();
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      let label = `节点${nearN.id} (${nearN.x.toFixed(1)},${nearN.y.toFixed(1)})`;
      if (st_femRes) label += ` u=(${nearN.ux.toExponential(2)},${nearN.uy.toExponential(2)})`;
      if (nearN.constraints) {
        const c = nearN.constraints;
        if (c.ux || c.uy) label += ` 约束:${c.ux ? 'x' : ''}${c.uy ? 'y' : ''}`;
      }
      if (nearN.fx || nearN.fy) label += ` F=(${nearN.fx.toFixed(0)},${nearN.fy.toFixed(0)})`;
      ctx.font = '12px monospace';
      const w = ctx.measureText(label).width;
      ctx.fillRect(sp.x + 14, sp.y - 20, w + 10, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, sp.x + 19, sp.y - 5);
      ctx.restore();
      return;
    }
  }
}

function handleMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const wp = transform.screenToWorld(sx, sy);
  if (e.button === 1 || e.shiftKey) {
    isPanning = true;
    dragStart = { x: sx, y: sy };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (st_rfMode && e.button === 0) {
    rectDragStart = { x: sx, y: sy };
    rectDragCurrent = { x: sx, y: sy };
    canvas.style.cursor = 'crosshair';
    return;
  }
  if (st_drawMode === 'measure' && e.button === 0) {
    if (!st_measFirst) {
      measFirstStore.set({ x: wp.x, y: wp.y });
    } else {
      const p1 = st_measFirst;
      const p2 = { x: wp.x, y: wp.y };
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const newMeas = {
        id: Date.now(),
        p1, p2, distance,
        timestamp: Date.now()
      };
      measStore.set([...(st_measurements || []), newMeas]);
      measFirstStore.set(null);
    }
    return;
  }
  if (st_drawMode === 'draw') {
    if (e.button === 0) {
      const pts = [...(st_curPts || [])];
      if (pts.length > 2 && Math.hypot(wp.x - pts[0].x, wp.y - pts[0].y) < 15 / transform.scale) {
        finishPolygon();
      } else {
        pts.push({ x: wp.x, y: wp.y });
        curPtsStore.set(pts);
      }
    }
  } else if (st_drawMode === 'edge') {
    let found = null;
    for (let pi = 0; pi < (st_polys || []).length; pi++) {
      const poly = st_polys[pi];
      const ne = findNearestEdge(poly, wp.x, wp.y);
      if (ne && ne.dist < 20 / transform.scale) {
        found = { polyId: poly.id, polyIdx: pi, edgeIdx: ne.index, p1: ne.p1, p2: ne.p2 };
        break;
      }
    }
    if (found) {
      const exists = (st_selEdges || []).some(se => se.polyId === found.polyId && se.edgeIdx === found.edgeIdx);
      if (e.ctrlKey || e.metaKey) {
        if (exists) selEdgesStore.set(st_selEdges.filter(se => !(se.polyId === found.polyId && se.edgeIdx === found.edgeIdx)));
        else selEdgesStore.set([...st_selEdges, found]);
      } else {
        selEdgesStore.set(exists ? [] : [found]);
      }
    } else {
      selEdgesStore.set([]);
    }
  } else if (st_drawMode === 'select') {
    const nearN = findNearestNode(st_nodes || [], wp.x, wp.y, 15 / transform.scale);
    if (nearN) {
      const s = new Set(st_selNodes || []);
      if (e.ctrlKey || e.metaKey) {
        if (s.has(nearN.id)) s.delete(nearN.id); else s.add(nearN.id);
      } else { s.clear(); s.add(nearN.id); }
      selNodesStore.set(s);
      selElStore.set(null);
      return;
    }
    const nearEl = findNearestElement(st_elems || [], wp.x, wp.y);
    if (nearEl) { selElStore.set(nearEl); selNodesStore.set(new Set()); return; }
    for (let pi = 0; pi < (st_polys || []).length; pi++) {
      const poly = st_polys[pi];
      const ni = findNearestPoint(poly.points, wp.x, wp.y, 15 / transform.scale);
      if (ni !== null) {
        selVertStore.set({ polyIdx: pi, vertexIdx: ni });
        isDragging = true;
        canvas.style.cursor = 'pointer';
        return;
      }
    }
    selNodesStore.set(new Set());
    selElStore.set(null);
  } else if (st_drawMode === 'constraint') {
    const nearN = findNearestNode(st_nodes || [], wp.x, wp.y, 18 / transform.scale);
    if (nearN) {
      nearN.constraints.ux = !nearN.constraints.ux;
      nearN.constraints.uy = nearN.constraints.ux;
      nodesStore.set([...st_nodes]);
    }
  } else if (st_drawMode === 'load') {
    const nearN = findNearestNode(st_nodes || [], wp.x, wp.y, 18 / transform.scale);
    if (nearN) {
      const f = parseFloat(prompt('输入集中力 Fy (N，正向上):', '-1000')) || 0;
      nearN.fy = (nearN.fy || 0) + f;
      nodesStore.set([...st_nodes]);
    }
  }
}

function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  hoverPos = { x: sx, y: sy };
  const wp = transform.screenToWorld(sx, sy);
  if (isPanning) {
    transform.pan(sx - dragStart.x, sy - dragStart.y);
    dragStart = { x: sx, y: sy };
    requestRender();
    return;
  }
  if (st_rfMode && rectDragStart) {
    rectDragCurrent = { x: sx, y: sy };
    requestRender();
    return;
  }
  if (st_drawMode === 'measure') {
    canvas.style.cursor = 'crosshair';
  }
  if (st_drawMode === 'edge') {
    let found = null;
    for (const poly of (st_polys || [])) {
      const ne = findNearestEdge(poly, wp.x, wp.y);
      if (ne && ne.dist < 20 / transform.scale) { found = ne; break; }
    }
    hoverEdge = found;
    canvas.style.cursor = found ? 'pointer' : st_drawMode === 'measure' ? 'crosshair' : 'default';
  } else {
    hoverEdge = null;
  }
  if (isDragging && st_selVert) {
    const sv = st_selVert;
    const newPolys = JSON.parse(JSON.stringify(st_polys || []));
    newPolys[sv.polyIdx].points[sv.vertexIdx] = { x: wp.x, y: wp.y };
    if (sv.vertexIdx === 0 && newPolys[sv.polyIdx].points.length > 1) {
      newPolys[sv.polyIdx].points[newPolys[sv.polyIdx].points.length - 1] = { x: wp.x, y: wp.y };
    }
    polysStore.set(newPolys.map(sp => {
      const p = new Polygon(sp.points, sp.isHole);
      p.id = sp.id || Math.random().toString(36).slice(2, 9);
      return p;
    }));
    clearMesh();
    requestRender();
    return;
  }
  requestRender();
}

function handleMouseUp() {
  if (isDragging && st_selVert) pushUndo();
  if (st_rfMode && rectDragStart && rectDragCurrent) {
    const wp1 = transform.screenToWorld(rectDragStart.x, rectDragStart.y);
    const wp2 = transform.screenToWorld(rectDragCurrent.x, rectDragCurrent.y);
    const dx = Math.abs(wp2.x - wp1.x);
    const dy = Math.abs(wp2.y - wp1.y);
    if (dx > 1 && dy > 1 && st_nodes && st_elems && st_elems.length > 0) {
      try {
        const { nodes: newNodes, elements: newElements } = refineElementsInRegion(
          st_nodes, st_elems,
          wp1.x, wp1.y, wp2.x, wp2.y,
          st_thickness || 0.01
        );
        nodesStore.set(newNodes);
        elemsStore.set(newElements);
        import('$lib/fem.js').then(m => {
          const ms = m.getMeshStats(newElements);
          import('$lib/stores.js').then(m2 => m2.meshStats.set(ms));
        });
        if (st_femRes) {
          try {
            const result = solveFEM(newNodes, newElements, st_mat, {
              planeStress: st_ps !== false,
              bodyForce: st_bf,
              edgeLoads: st_eloads || []
            });
            femResStore.set(result);
          } catch (err) {
            console.error('Re-solve error:', err);
          }
        }
      } catch (err) {
        console.error('Refine error:', err);
        alert('网格加密失败: ' + (err.message || err));
      }
    }
    rectDragStart = null;
    rectDragCurrent = null;
    rfModeStore.set(false);
  }
  isDragging = false;
  isPanning = false;
  selVertStore.set(null);
  canvas.style.cursor = 'default';
  requestRender();
}

function handleWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  transform.zoom(factor, sx, sy);
  requestRender();
}

function handleDblClick() {
  if (st_drawMode === 'draw' && (st_curPts || []).length >= 3) finishPolygon();
}

function finishPolygon() {
  const pts = [...(st_curPts || [])];
  if (pts.length >= 3) {
    const poly = new Polygon([...pts, { ...pts[0] }], st_hole);
    pushUndo();
    polysStore.set([...(st_polys || []), poly]);
  }
  curPtsStore.set([]);
}

function requestRender() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(render);
}

export function generateMesh() {
  if (!st_polys || !st_polys.length) return;
  const spacing = st_spacing || 30;
  const outer = (st_polys || []).filter(p => !p.isHole);
  const holes = (st_polys || []).filter(p => p.isHole);
  if (!outer.length) return;
  const seeds = [];
  for (const p of outer) seeds.push(...generateSeedsOnBoundary([p], spacing));
  for (const p of holes) seeds.push(...generateSeedsOnBoundary([p], spacing * 0.8));
  for (const op of outer) seeds.push(...generateInteriorSeeds(op, holes, spacing));
  const { triangles, nodes: ns, steps } = bowyerWatson(seeds, outer, holes, true);
  triangles.forEach((t, i) => { t.id = i; t.t = st_thickness || 0.01; });
  nodesStore.set(ns);
  elemsStore.set(triangles);
  import('$lib/fem.js').then(m => {
    const ms = m.getMeshStats(triangles);
    import('$lib/stores.js').then(m2 => m2.meshStats.set(ms));
  });
  meshStepsStore.set(steps);
  meshStepStore.set(-1);
  if (onMeshGenerated) onMeshGenerated({ triangles, nodes: ns, steps });
  requestRender();
}

export function runFEM() {
  if (!st_elems || !st_elems.length) return;
  for (const el of st_elems) el.t = st_thickness || 0.01;
  try {
    const result = solveFEM(st_nodes, st_elems, st_mat, {
      planeStress: st_ps !== false,
      bodyForce: st_bf,
      edgeLoads: st_eloads || []
    });
    femResStore.set(result);
    if (onFEMComplete) onFEMComplete(result);
  } catch (err) {
    console.error('solveFEM error:', err);
    alert('求解失败: ' + (err.message || err));
  }
  requestRender();
}

export function fitView() {
  if (!st_polys || !st_polys.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of st_polys) {
    const bb = p.boundingBox;
    minX = Math.min(minX, bb.minX); maxX = Math.max(maxX, bb.maxX);
    minY = Math.min(minY, bb.minY); maxY = Math.max(maxY, bb.maxY);
  }
  transform.fitToBounds({ minX, maxX, minY, maxY }, 60);
  requestRender();
}
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseUp}
  on:dblclick={handleDblClick}
  on:wheel={handleWheel}
  style="display: block; background: #fafbfc; border-radius: 6px; border: 1px solid #e1e8ed; flex: 1; min-height: 400px;"
/>

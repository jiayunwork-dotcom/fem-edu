import { Node, TriangleElement, Polygon, Material } from './types.js';
import type { Point2D, EdgeLoad, SelectedEdge, ConvergenceEntry, MeshStats, BodyForce, PolygonState } from './types.js';
import { writable, derived, type Writable, type Readable } from 'svelte/store';
import { UndoRedoManager } from './canvasUtils.js';

export const viewMode: Writable<string> = writable('sandbox');
export const currentLevelId: Writable<number | null> = writable(null);
export const unlockedLevels: Writable<Set<number>> = writable(new Set([1]));
export const levelAnswers: Writable<Record<number, { passed: boolean; time: number }>> = writable({});

export const polygons: Writable<Polygon[]> = writable([]);
export const currentPolygonPoints: Writable<Point2D[]> = writable([]);
export const drawingMode: Writable<string> = writable('select');
export const holeMode: Writable<boolean> = writable(false);
export const selectedVertex: Writable<{ polyIdx: number; vertexIdx: number } | null> = writable(null);
export const selectedPolygon: Writable<number | null> = writable(null);

export const meshSpacing: Writable<number> = writable(30);
export const localDensityRegions: Writable<Array<{ x: number; y: number; r: number; s: number }>> = writable([]);
export const nodes: Writable<Node[]> = writable([]);
export const elements: Writable<TriangleElement[]> = writable([]);
export const meshStats: Writable<MeshStats | null> = writable(null);
export const meshAnimStep: Writable<number> = writable(-1);
export const meshAnimSteps: Writable<Array<Record<string, unknown>>> = writable([]);
export const meshAnimPlaying: Writable<boolean> = writable(false);

export const material: Writable<Material> = writable(new Material(210e9, 0.3));
export const planeStress: Writable<boolean> = writable(true);
export const thickness: Writable<number> = writable(0.01);
export const bodyForce: Writable<BodyForce | null> = writable(null);
export const edgeLoads: Writable<EdgeLoad[]> = writable([]);

export const selectedNodes: Writable<Set<number>> = writable(new Set());
export const selectedEdges: Writable<SelectedEdge[]> = writable([]);
export const selectedElement: Writable<TriangleElement | null> = writable(null);

export const femResults: Writable<Record<string, unknown> | null> = writable(null);
export const postProcessMode: Writable<string> = writable('deformation');
export const deformationScale: Writable<number> = writable(100);
export const stressType: Writable<string> = writable('vm');
export const contourLevels: Writable<number> = writable(10);

export const assemblyAnimStep: Writable<number> = writable(-1);
export const assemblyAnimPlaying: Writable<boolean> = writable(false);
export const solverAnimStep: Writable<number> = writable(-1);
export const solverAnimPlaying: Writable<boolean> = writable(false);
export const elementAnimStep: Writable<number> = writable(0);
export const elementAnimPlaying: Writable<boolean> = writable(false);

export const convergenceData: Writable<ConvergenceEntry[]> = writable([]);

export const undoRedo: UndoRedoManager = new UndoRedoManager();

export function pushUndo(): void {
  let polyState: PolygonState[] | undefined;
  polygons.subscribe(v => {
    polyState = JSON.parse(JSON.stringify(v.map(p => ({ points: p.points, isHole: p.isHole, id: p.id }))));
  })();
  if (polyState) undoRedo.push({ polygons: polyState });
}

export function doUndo(): void {
  let cur: Polygon[] | undefined;
  polygons.subscribe(v => { cur = v; })();
  if (!cur) return;
  const state = undoRedo.undo(cur.map(p => ({ points: p.points, isHole: p.isHole, id: p.id })));
  if (state) {
    polygons.set((state as { polygons: PolygonState[] }).polygons.map(sp => {
      const p = new Polygon(sp.points, sp.isHole);
      p.id = sp.id;
      return p;
    }));
  }
}

export function doRedo(): void {
  let cur: Polygon[] | undefined;
  polygons.subscribe(v => { cur = v; })();
  if (!cur) return;
  const state = undoRedo.redo(cur.map(p => ({ points: p.points, isHole: p.isHole, id: p.id })));
  if (state) {
    polygons.set((state as { polygons: PolygonState[] }).polygons.map(sp => {
      const p = new Polygon(sp.points, sp.isHole);
      p.id = sp.id;
      return p;
    }));
  }
}

export function resetGeometry(): void {
  polygons.set([]);
  currentPolygonPoints.set([]);
  nodes.set([]);
  elements.set([]);
  meshStats.set(null);
  femResults.set(null);
  selectedNodes.set(new Set());
  selectedEdges.set([]);
  edgeLoads.set([]);
  convergenceData.set([]);
}

export function clearMesh(): void {
  nodes.set([]);
  elements.set([]);
  meshStats.set(null);
  femResults.set(null);
}

export const hasGeometry: Readable<boolean> = derived(polygons, ($p: Polygon[]) => $p.length > 0);
export const hasMesh: Readable<boolean> = derived(elements, ($e: TriangleElement[]) => $e.length > 0);
export const hasResults: Readable<boolean> = derived(femResults, ($r: unknown) => $r != null);

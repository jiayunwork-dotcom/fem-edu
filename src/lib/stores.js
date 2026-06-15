import { writable, derived } from 'svelte/store';
import { Polygon, Material, Node, TriangleElement } from './types.js';
import { UndoRedoManager } from './canvasUtils.js';

export const viewMode = writable('sandbox');
export const currentLevelId = writable(null);
export const unlockedLevels = writable(new Set([1]));
export const levelAnswers = writable({});

export const polygons = writable([]);
export const currentPolygonPoints = writable([]);
export const drawingMode = writable('select');
export const holeMode = writable(false);
export const selectedVertex = writable(null);
export const selectedPolygon = writable(null);

export const meshSpacing = writable(30);
export const localDensityRegions = writable([]);
export const nodes = writable([]);
export const elements = writable([]);
export const meshStats = writable(null);
export const meshAnimStep = writable(-1);
export const meshAnimSteps = writable([]);
export const meshAnimPlaying = writable(false);

export const material = writable(new Material(210e9, 0.3));
export const planeStress = writable(true);
export const thickness = writable(0.01);
export const bodyForce = writable(null);
export const edgeLoads = writable([]);

export const selectedNodes = writable(new Set());
export const selectedEdges = writable([]);
export const selectedElement = writable(null);

export const femResults = writable(null);
export const postProcessMode = writable('deformation');
export const deformationScale = writable(100);
export const stressType = writable('vm');
export const contourLevels = writable(10);

export const assemblyAnimStep = writable(-1);
export const assemblyAnimPlaying = writable(false);
export const solverAnimStep = writable(-1);
export const solverAnimPlaying = writable(false);
export const elementAnimStep = writable(0);
export const elementAnimPlaying = writable(false);

export const convergenceData = writable([]);

export const undoRedo = new UndoRedoManager();

export function pushUndo() {
  let polyState;
  polygons.subscribe(v => polyState = JSON.parse(JSON.stringify(v.map(p => ({ points: p.points, isHole: p.isHole, id: p.id })))));
  undoRedo.push({ polygons: polyState });
}

export function doUndo() {
  let cur;
  polygons.subscribe(v => cur = v);
  const state = undoRedo.undo(cur.map(p => ({ points: p.points, isHole: p.isHole, id: p.id })));
  if (state) {
    polygons.set(state.polygons.map(sp => {
      const p = new Polygon(sp.points, sp.isHole);
      p.id = sp.id;
      return p;
    }));
  }
}

export function doRedo() {
  let cur;
  polygons.subscribe(v => cur = v);
  const state = undoRedo.redo(cur.map(p => ({ points: p.points, isHole: p.isHole, id: p.id })));
  if (state) {
    polygons.set(state.polygons.map(sp => {
      const p = new Polygon(sp.points, sp.isHole);
      p.id = sp.id;
      return p;
    }));
  }
}

export function resetGeometry() {
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

export function clearMesh() {
  nodes.set([]);
  elements.set([]);
  meshStats.set(null);
  femResults.set(null);
}

export const hasGeometry = derived(polygons, $p => $p.length > 0);
export const hasMesh = derived(elements, $e => $e.length > 0);
export const hasResults = derived(femResults, $r => $r != null);

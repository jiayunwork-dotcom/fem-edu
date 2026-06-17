<script lang="ts">
import { onDestroy } from 'svelte';
import { createEventDispatcher } from 'svelte';
import type { Polygon } from '$lib/types.js';
import {
  drawingMode as dmStore, holeMode as hmStore, polygons as pStore,
  currentPolygonPoints as cppStore, doUndo, doRedo, resetGeometry,
  meshSpacing as msStore, clearMesh, hasGeometry as hgStore,
  hasMesh as hmStore2, hasResults as hrStore, refineMode as rfModeStore,
  measurementFirstPoint as measFirstStore
} from '$lib/stores.js';
import { createRectTemplate, createLShape, createIShape, createHoleCircle } from '$lib/canvasUtils.js';

const dispatch = createEventDispatcher();

let curUnsubs = [];
let st_p = [], st_dm = 'select', st_hm = false, st_hg = false, st_hm2 = false, st_hr = false, st_ms = 30;
let st_rfMode = false, st_measFirst = null;

function init() {
  curUnsubs = [
    pStore.subscribe(v => st_p = Array.isArray(v) ? v : []),
    dmStore.subscribe(v => st_dm = v || 'select'),
    hmStore.subscribe(v => st_hm = !!v),
    hgStore.subscribe(v => st_hg = !!v),
    hmStore2.subscribe(v => st_hm2 = !!v),
    hrStore.subscribe(v => st_hr = !!v),
    msStore.subscribe(v => st_ms = Number(v) || 30),
    rfModeStore.subscribe(v => st_rfMode = !!v),
    measFirstStore.subscribe(v => st_measFirst = v)
  ];
}
init();
onDestroy(() => curUnsubs.forEach(u => u()));

let showTemplates = false;
let showMeshPanel = false;
let rectW = 200, rectH = 100;
let l_w1 = 200, l_h1 = 200, l_w2 = 50, l_h2 = 50;
let i_H = 200, i_B = 100, i_tf = 15, i_tw = 8;
let ph_W = 200, ph_H = 100, ph_r = 15, ph_cx = 100, ph_cy = 50;

function setPolygons(arr) {
  pStore.set(arr);
}

function addRect() {
  try {
    const w = Math.max(10, Number(rectW) || 200);
    const h = Math.max(10, Number(rectH) || 100);
    const p = createRectTemplate(w, h);
    const next = [...st_p, p];
    setPolygons(next);
    showTemplates = false;
    clearMesh();
  } catch (e) {
    console.error('addRect error:', e);
  }
}
function addLShape() {
  try {
    const w1 = Math.max(10, Number(l_w1) || 200);
    const h1 = Math.max(10, Number(l_h1) || 200);
    const w2 = Math.max(5, Number(l_w2) || 50);
    const h2 = Math.max(5, Number(l_h2) || 50);
    const p = createLShape(w1, h1, w2, h2);
    setPolygons([...st_p, p]);
    showTemplates = false;
    clearMesh();
  } catch (e) { console.error(e); }
}
function addIShape() {
  try {
    const H = Math.max(20, Number(i_H) || 200);
    const B = Math.max(10, Number(i_B) || 100);
    const tf = Math.max(1, Number(i_tf) || 15);
    const tw = Math.max(1, Number(i_tw) || 8);
    const p = createIShape(H, B, tf, tw);
    setPolygons([...st_p, p]);
    showTemplates = false;
    clearMesh();
  } catch (e) { console.error(e); }
}
function addPlate() {
  try {
    const W = Math.max(10, Number(ph_W) || 200);
    const H = Math.max(10, Number(ph_H) || 100);
    const cx = Number(ph_cx) || W / 2;
    const cy = Number(ph_cy) || H / 2;
    const r = Math.max(1, Number(ph_r) || 15);
    const plate = createRectTemplate(W, H);
    const hole = createHoleCircle(cx - W / 2, cy - H / 2, r);
    setPolygons([...st_p, plate, hole]);
    showTemplates = false;
    clearMesh();
  } catch (e) { console.error(e); }
}

function setMode(m) {
  dmStore.set(m);
  if (m !== 'draw') cppStore.set([]);
  if (m !== 'measure') {
    measFirstStore.set(null);
  }
  if (m !== 'refine') {
    rfModeStore.set(false);
  }
}

function toggleRefineMode() {
  if (st_rfMode) {
    rfModeStore.set(false);
  } else {
    dmStore.set('select');
    measFirstStore.set(null);
    rfModeStore.set(true);
  }
}

function toggleTpl() {
  showTemplates = !showTemplates;
  showMeshPanel = false;
}
function toggleMesh() {
  showMeshPanel = !showMeshPanel;
  showTemplates = false;
}
</script>

<svelte:window on:click={(e) => {
  if (!e.target.closest('.dropdown-wrap')) { showTemplates = false; showMeshPanel = false; }
}} />

<div class="toolbar">
  <div class="group">
    <button class={st_dm === 'select' ? 'active' : ''} on:click={() => setMode('select')}>🖱 选择</button>
    <button class={st_dm === 'draw' ? 'active' : ''} on:click={() => setMode('draw')}>✏️ 绘制</button>
    <button class={st_dm === 'edge' ? 'active' : ''} on:click={() => setMode('edge')} title="选择边施加均布载荷">📐 选边</button>
    <label class="chk">
      <input type="checkbox" checked={st_hm} on:change={(e) => hmStore.set(e.target.checked)} />
      挖孔
    </label>
    <button class={st_dm === 'constraint' ? 'active' : ''} on:click={() => setMode('constraint')}>🔒 约束</button>
    <button class={st_dm === 'load' ? 'active' : ''} on:click={() => setMode('load')}>⬇ 载荷</button>
    <button class={st_dm === 'measure' ? 'active' : ''} on:click={() => setMode('measure')} title="测量两点距离">📏 测量</button>
  </div>
  <div class="group">
    <button on:click={doUndo} title="撤销">↶ 撤销</button>
    <button on:click={doRedo} title="重做">↷ 重做</button>
    <button on:click={() => cppStore.set([])} disabled={st_dm !== 'draw'}>取消绘制</button>
    <div class="sep"></div>
    <div class="dropdown-wrap">
      <button class:open={showTemplates} on:click={toggleTpl} on:mousedown|stopPropagation on:click|stopPropagation>📐 模板 ▾</button>
      {#if showTemplates}
      <div class="dropdown" on:mousedown|stopPropagation on:click|stopPropagation>
        <h4>矩形梁</h4>
        <div class="row"><label>宽</label><input type="number" min="1" step="1" bind:value={rectW} /></div>
        <div class="row"><label>高</label><input type="number" min="1" step="1" bind:value={rectH} /></div>
        <button class="sm primary" on:click={addRect}>生成矩形</button>
        <h4>L形截面</h4>
        <div class="row"><label>外宽</label><input type="number" min="1" step="1" bind:value={l_w1} /></div>
        <div class="row"><label>外高</label><input type="number" min="1" step="1" bind:value={l_h1} /></div>
        <div class="row"><label>内宽</label><input type="number" min="1" step="1" bind:value={l_w2} /></div>
        <div class="row"><label>内高</label><input type="number" min="1" step="1" bind:value={l_h2} /></div>
        <button class="sm primary" on:click={addLShape}>生成L形</button>
        <h4>I形截面</h4>
        <div class="row"><label>梁高H</label><input type="number" min="1" step="1" bind:value={i_H} /></div>
        <div class="row"><label>翼缘宽B</label><input type="number" min="1" step="1" bind:value={i_B} /></div>
        <div class="row"><label>翼缘厚</label><input type="number" min="1" step="1" bind:value={i_tf} /></div>
        <div class="row"><label>腹板厚</label><input type="number" min="1" step="1" bind:value={i_tw} /></div>
        <button class="sm primary" on:click={addIShape}>生成I形</button>
        <h4>带圆孔板</h4>
        <div class="row"><label>板宽</label><input type="number" min="1" step="1" bind:value={ph_W} /></div>
        <div class="row"><label>板高</label><input type="number" min="1" step="1" bind:value={ph_H} /></div>
        <div class="row"><label>孔X</label><input type="number" step="1" bind:value={ph_cx} /></div>
        <div class="row"><label>孔Y</label><input type="number" step="1" bind:value={ph_cy} /></div>
        <div class="row"><label>孔半径</label><input type="number" min="1" step="1" bind:value={ph_r} /></div>
        <button class="sm primary" on:click={addPlate}>生成板+孔</button>
      </div>
      {/if}
    </div>
  </div>
  <div class="group">
    <div class="dropdown-wrap">
      <button class:open={showMeshPanel} on:click={toggleMesh} on:mousedown|stopPropagation on:click|stopPropagation>🔲 网格 ▾</button>
      {#if showMeshPanel}
      <div class="dropdown wide" on:mousedown|stopPropagation on:click|stopPropagation>
        <div class="row"><label>全局间距</label>
          <input type="number" value={st_ms} step="1" min="2" on:input={(e) => msStore.set(parseFloat(e.target.value) || 30)} />
        </div>
        <button class="sm primary" on:click={() => { dispatch('generateMesh'); showMeshPanel = false; }} disabled={!st_hg}>🚀 生成网格</button>
      </div>
      {/if}
    </div>
    <button on:click={() => dispatch('generateMesh')} disabled={!st_hg} title="生成Delaunay三角网格">🔲 生成网格</button>
    <button class={st_rfMode ? 'active' : ''} on:click={toggleRefineMode} disabled={!st_hm2} title="框选区域进行局部网格加密">🔍 局部加密</button>
    <button on:click={() => dispatch('runFEM')} disabled={!st_hm2} title="执行有限元求解">🧮 求解</button>
    <button on:click={() => clearMesh()} disabled={!st_hm2}>清除网格</button>
  </div>
  <div class="group">
    <button on:click={() => dispatch('openAnim')} title="打开动画面板">🎬 动画</button>
    <button on:click={() => dispatch('fitView')} title="适应视图">🔍 适应</button>
    <button on:click={() => { if (confirm('确认清空全部几何、网格和结果？')) resetGeometry(); }}>🗑 清空</button>
  </div>
</div>

<style>
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: linear-gradient(180deg, #f8fafc, #eef2f7); border-bottom: 1px solid #d9e2ec; align-items: center; user-select: none; }
.group { display: flex; gap: 4px; align-items: center; padding: 2px 8px; border-right: 1px solid #dde3ea; }
.group:last-child { border-right: none; }
button { padding: 6px 12px; border: 1px solid #c8d1dc; background: #fff; border-radius: 5px; font-size: 13px; cursor: pointer; transition: all 0.15s; color: #2c3e50; }
button:hover:not(:disabled) { background: #eaf2fb; border-color: #3498db; color: #2980b9; }
button.active { background: #3498db; color: #fff; border-color: #2980b9; }
button.open { background: #d6eaf8; color: #2980b9; border-color: #3498db; }
button.primary { background: #3498db; color: #fff; border-color: #2980b9; }
button.primary:hover:not(:disabled) { background: #2980b9; color: #fff; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.sm { padding: 4px 10px; font-size: 12px; }
.sep { width: 1px; height: 24px; background: #dde3ea; }
.chk { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #555; cursor: pointer; padding: 0 4px; }
.dropdown-wrap { position: relative; }
.dropdown { position: absolute; top: 100%; left: 0; margin-top: 4px; background: #fff; border: 1px solid #c8d1dc; border-radius: 6px; padding: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.15); z-index: 1000; min-width: 210px; max-height: 80vh; overflow-y: auto; }
.dropdown.wide { min-width: 240px; }
.dropdown h4 { font-size: 12px; color: #34495e; margin: 10px 0 4px; padding-bottom: 3px; border-bottom: 1px solid #eee; font-weight: 600; }
.dropdown h4:first-child { margin-top: 0; }
.row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.row label { font-size: 12px; min-width: 56px; color: #555; }
.row input { flex: 1; padding: 4px 7px; border: 1px solid #ccd3dc; border-radius: 3px; font-size: 12px; width: 80px; min-width: 0; }
.row input:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52,152,219,0.15); }
button.sm.primary { width: 100%; margin: 4px 0 6px; }
</style>

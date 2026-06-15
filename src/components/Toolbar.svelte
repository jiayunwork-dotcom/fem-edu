<script>
import { createEventDispatcher } from 'svelte';
import { drawingMode as dmStore, holeMode as hmStore, polygons as pStore, currentPolygonPoints as cppStore, doUndo, doRedo, resetGeometry, meshSpacing as msStore, clearMesh, hasGeometry as hgStore, hasMesh as hmStore2, hasResults as hrStore } from '$lib/stores.js';
import { createRectTemplate, createLShape, createIShape, createHoleCircle } from '$lib/canvasUtils.js';
import { Polygon } from '$lib/types.js';

const dispatch = createEventDispatcher();

let curUnsubs = [];
let st_p, st_dm, st_hm, st_hg, st_hm2, st_hr, st_ms;

function init() {
  curUnsubs = [
    pStore.subscribe(v => st_p = v),
    dmStore.subscribe(v => st_dm = v),
    hmStore.subscribe(v => st_hm = v),
    hgStore.subscribe(v => st_hg = v),
    hmStore2.subscribe(v => st_hm2 = v),
    hrStore.subscribe(v => st_hr = v),
    msStore.subscribe(v => st_ms = v)
  ];
}
init();

import { onDestroy } from 'svelte';
onDestroy(() => curUnsubs.forEach(u => u()));

let showTemplates = false;
let showMeshPanel = false;
let rectW = 200, rectH = 100;
let l_w1 = 200, l_h1 = 200, l_w2 = 50, l_h2 = 50;
let i_H = 200, i_B = 100, i_tf = 15, i_tw = 8;
let ph_W = 200, ph_H = 100, ph_r = 15, ph_cx = 100, ph_cy = 50;

function addRect() {
  const p = createRectTemplate(rectW, rectH);
  pStore.set([...(st_p || []), p]);
  showTemplates = false;
  clearMesh();
}
function addLShape() {
  const p = createLShape(l_w1, l_h1, l_w2, l_h2);
  pStore.set([...(st_p || []), p]);
  showTemplates = false;
  clearMesh();
}
function addIShape() {
  const p = createIShape(i_H, i_B, i_tf, i_tw);
  pStore.set([...(st_p || []), p]);
  showTemplates = false;
  clearMesh();
}
function addPlate() {
  const plate = createRectTemplate(ph_W, ph_H);
  const hole = createHoleCircle(ph_cx - ph_W / 2, ph_cy - ph_H / 2, ph_r);
  pStore.set([...(st_p || []), plate, hole]);
  showTemplates = false;
  clearMesh();
}

function setMode(m) {
  dmStore.set(m);
  if (m !== 'draw') cppStore.set([]);
}
</script>

<div class="toolbar">
  <div class="group">
    <button class={st_dm === 'select' ? 'active' : ''} on:click={() => setMode('select')}>🖱 选择</button>
    <button class={st_dm === 'draw' ? 'active' : ''} on:click={() => setMode('draw')}>✏️ 绘制</button>
    <label class="chk">
      <input type="checkbox" checked={st_hm} on:change={(e) => hmStore.set(e.target.checked)} />
      挖孔
    </label>
    <button class={st_dm === 'constraint' ? 'active' : ''} on:click={() => setMode('constraint')}>🔒 约束</button>
    <button class={st_dm === 'load' ? 'active' : ''} on:click={() => setMode('load')}>⬇ 载荷</button>
  </div>
  <div class="group">
    <button on:click={doUndo}>↶ 撤销</button>
    <button on:click={doRedo}>↷ 重做</button>
    <button on:click={() => cppStore.set([])} disabled={st_dm !== 'draw'}>取消绘制</button>
    <div class="sep"></div>
    <div class="dropdown-wrap">
      <button on:click={() => showTemplates = !showTemplates}>📐 模板 ▾</button>
      {#if showTemplates}
      <div class="dropdown">
        <h4>矩形梁</h4>
        <div class="row"><label>宽</label><input type="number" bind:value={rectW} /></div>
        <div class="row"><label>高</label><input type="number" bind:value={rectH} /></div>
        <button class="sm" on:click={addRect}>生成矩形</button>
        <h4>L形截面</h4>
        <div class="row"><label>外宽</label><input type="number" bind:value={l_w1} /></div>
        <div class="row"><label>外高</label><input type="number" bind:value={l_h1} /></div>
        <div class="row"><label>内宽</label><input type="number" bind:value={l_w2} /></div>
        <div class="row"><label>内高</label><input type="number" bind:value={l_h2} /></div>
        <button class="sm" on:click={addLShape}>生成L形</button>
        <h4>I形截面</h4>
        <div class="row"><label>梁高H</label><input type="number" bind:value={i_H} /></div>
        <div class="row"><label>翼缘宽B</label><input type="number" bind:value={i_B} /></div>
        <div class="row"><label>翼缘厚</label><input type="number" bind:value={i_tf} /></div>
        <div class="row"><label>腹板厚</label><input type="number" bind:value={i_tw} /></div>
        <button class="sm" on:click={addIShape}>生成I形</button>
        <h4>带圆孔板</h4>
        <div class="row"><label>板宽</label><input type="number" bind:value={ph_W} /></div>
        <div class="row"><label>板高</label><input type="number" bind:value={ph_H} /></div>
        <div class="row"><label>孔X</label><input type="number" bind:value={ph_cx} /></div>
        <div class="row"><label>孔Y</label><input type="number" bind:value={ph_cy} /></div>
        <div class="row"><label>孔半径</label><input type="number" bind:value={ph_r} /></div>
        <button class="sm" on:click={addPlate}>生成板+孔</button>
      </div>
      {/if}
    </div>
  </div>
  <div class="group">
    <div class="dropdown-wrap">
      <button on:click={() => showMeshPanel = !showMeshPanel}>🔲 网格 ▾</button>
      {#if showMeshPanel}
      <div class="dropdown wide">
        <div class="row"><label>全局间距</label>
          <input type="number" value={st_ms || 30} step="1" min="2" on:input={(e) => msStore.set(parseFloat(e.target.value) || 30)} />
        </div>
        <button class="sm" on:click={() => { dispatch('generateMesh'); showMeshPanel = false; }} disabled={!st_hg}>🚀 生成网格</button>
      </div>
      {/if}
    </div>
    <button on:click={() => dispatch('generateMesh')} disabled={!st_hg}>🔲 生成网格</button>
    <button on:click={() => dispatch('runFEM')} disabled={!st_hm2}>🧮 求解</button>
    <button on:click={() => clearMesh()} disabled={!st_hm2}>清除网格</button>
  </div>
  <div class="group">
    <button on:click={() => dispatch('fitView')}>🔍 适应视图</button>
    <button on:click={() => { if (confirm('确认清空全部？')) resetGeometry(); }}>🗑 清空</button>
  </div>
</div>

<style>
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: linear-gradient(180deg, #f8fafc, #eef2f7); border-bottom: 1px solid #d9e2ec; align-items: center; user-select: none; }
.group { display: flex; gap: 4px; align-items: center; padding: 2px 8px; border-right: 1px solid #dde3ea; }
.group:last-child { border-right: none; }
button { padding: 6px 12px; border: 1px solid #c8d1dc; background: #fff; border-radius: 5px; font-size: 13px; cursor: pointer; transition: all 0.15s; color: #2c3e50; }
button:hover:not(:disabled) { background: #eaf2fb; border-color: #3498db; color: #2980b9; }
button.active { background: #3498db; color: #fff; border-color: #2980b9; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.sm { padding: 4px 8px; font-size: 12px; }
.sep { width: 1px; height: 24px; background: #dde3ea; }
.chk { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #555; cursor: pointer; padding: 0 4px; }
.dropdown-wrap { position: relative; }
.dropdown { position: absolute; top: 100%; left: 0; margin-top: 4px; background: #fff; border: 1px solid #c8d1dc; border-radius: 6px; padding: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); z-index: 100; min-width: 200px; max-height: 70vh; overflow-y: auto; }
.dropdown.wide { min-width: 240px; }
.dropdown h4 { font-size: 12px; color: #7f8c8d; margin: 8px 0 4px; padding-bottom: 3px; border-bottom: 1px solid #eee; }
.dropdown h4:first-child { margin-top: 0; }
.row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.row label { font-size: 12px; min-width: 56px; color: #555; }
.row input { flex: 1; padding: 3px 6px; border: 1px solid #ccd3dc; border-radius: 3px; font-size: 12px; width: 80px; }
</style>

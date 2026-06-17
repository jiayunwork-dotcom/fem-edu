<script lang="ts">
import { onDestroy } from 'svelte';
import type { Node, TriangleElement, MaterialData } from '$lib/types.js';
import type { Matrix, Vector, GaussStep } from '$lib/matrix.js';
import {
  meshAnimStep, meshAnimSteps, meshAnimPlaying, nodes, elements, material, planeStress,
  femResults, assemblyAnimStep, assemblyAnimPlaying, solverAnimStep, solverAnimPlaying,
  elementAnimStep, elementAnimPlaying, selectedElement
} from '$lib/stores.js';
import { computeElementStiffness } from '$lib/fem.js';
import type { ElementStiffnessResult } from '$lib/fem.js';
import { formatNumber, gaussEliminationSteps } from '$lib/matrix.js';

export let panel: boolean;

let current = 'mesh';
let st_meshStep, st_meshSteps, st_meshPlaying;
let st_nodes, st_elements, st_material, st_planeStress, st_femResults;
let st_assStep, st_assPlaying, st_solStep, st_solPlaying;
let st_elemStep, st_elemPlaying, st_selEl;

let animTimer = null;
let assemblySteps = [];
let solverSteps = [];
let solverResult = null;

let unsubs = [];
function init() {
  unsubs = [
    meshAnimStep.subscribe(v => st_meshStep = v),
    meshAnimSteps.subscribe(v => st_meshSteps = v),
    meshAnimPlaying.subscribe(v => { st_meshPlaying = v; if (v) startMeshAnim(); }),
    nodes.subscribe(v => st_nodes = v),
    elements.subscribe(v => st_elements = v),
    material.subscribe(v => st_material = v),
    planeStress.subscribe(v => st_planeStress = v),
    femResults.subscribe(v => { st_femResults = v; if (v) prepareSolverData(); }),
    assemblyAnimStep.subscribe(v => st_assStep = v),
    assemblyAnimPlaying.subscribe(v => { st_assPlaying = v; if (v) startAssAnim(); else stopAnim(); }),
    solverAnimStep.subscribe(v => st_solStep = v),
    solverAnimPlaying.subscribe(v => { st_solPlaying = v; if (v) startSolAnim(); else stopAnim(); }),
    elementAnimStep.subscribe(v => st_elemStep = v),
    elementAnimPlaying.subscribe(v => { st_elemPlaying = v; if (v) startElemAnim(); else stopAnim(); }),
    selectedElement.subscribe(v => st_selEl = v)
  ];
}
init();

onDestroy(() => { stopAnim(); unsubs.forEach(u => u()); });

function stopAnim() { if (animTimer) { clearInterval(animTimer); animTimer = null; } }

function startMeshAnim() {
  stopAnim();
  animTimer = setInterval(() => {
    let next = st_meshStep + 1;
    if (!st_meshSteps || next >= st_meshSteps.length) { stopAnim(); meshAnimPlaying.set(false); meshAnimStep.set(-1); return; }
    meshAnimStep.set(next);
  }, 400);
}

function startAssAnim() {
  stopAnim();
  if (assemblySteps.length === 0) prepareAssemblyData();
  animTimer = setInterval(() => {
    let next = st_assStep + 1;
    if (next >= assemblySteps.length) { stopAnim(); assemblyAnimPlaying.set(false); return; }
    assemblyAnimStep.set(next);
  }, 200);
}

function startSolAnim() {
  stopAnim();
  if (solverSteps.length === 0) prepareSolverData();
  animTimer = setInterval(() => {
    let next = st_solStep + 1;
    if (next >= solverSteps.length) { stopAnim(); solverAnimPlaying.set(false); return; }
    solverAnimStep.set(next);
  }, 500);
}

function startElemAnim() {
  stopAnim();
  animTimer = setInterval(() => {
    let next = st_elemStep + 1;
    if (next > 4) { stopAnim(); elementAnimPlaying.set(false); return; }
    elementAnimStep.set(next);
  }, 1200);
}

function prepareAssemblyData() {
  if (!st_elements || st_elements.length === 0) return;
  const steps = [];
  const dofs = 2 * st_nodes.length;
  const K = Array.from({ length: dofs }, () => Array(dofs).fill(0));
  steps.push({ K: K.map(r => [...r]), currentEl: -1, highlight: null, desc: '初始化整体刚度矩阵 [K]（零矩阵）' });
  for (let i = 0; i < st_elements.length; i++) {
    const el = st_elements[i];
    const { Ke } = computeElementStiffness(el, st_material, st_planeStress);
    const edofs = [];
    for (const n of el.nodes) edofs.push(n.dofX, n.dofY);
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) {
        K[edofs[a]][edofs[b]] += Ke[a][b];
      }
    }
    steps.push({
      K: K.map(r => [...r]),
      currentEl: i,
      Ke,
      dofs: edofs,
      highlight: { rows: edofs, cols: edofs },
      desc: `装配单元 #${i} 到行 [${edofs.join(',')}]，列 [${edofs.join(',')}]`
    });
  }
  steps.push({ K: K.map(r => [...r]), currentEl: -1, highlight: null, desc: '整体刚度矩阵装配完成' });
  assemblySteps = steps;
}

function prepareSolverData() {
  if (!st_femResults) return;
  const { K, F, constraints, U } = st_femResults;
  const N = K.length;
  const Kc = K.map(r => [...r]);
  const Fc = [...F];
  for (let i = 0; i < N; i++) {
    if (constraints[i]) {
      const big = 1e18;
      Kc[i][i] = big;
      Fc[i] = big * 0;
    }
  }
  if (N <= 200) {
    const { steps, result } = gaussEliminationSteps(Kc, Fc);
    solverSteps = steps;
    solverResult = result;
  } else {
    solverSteps = [{ desc: '模型节点数 > 100，直接给出求解结果（跳过逐步动画）', M: null, pivot: -1, eliminated: -1 }];
    solverResult = U;
  }
}

function matCell(v, scale = 1) {
  const av = Math.abs(v) * scale;
  if (av < 1e-9) return 'rgba(255,255,255,1)';
  const t = Math.min(1, Math.log10(av + 1) / 6);
  return `rgba(52,152,219,${0.15 + t * 0.75})`;
}

function getElemResult() {
  if (!st_selEl) return null;
  return computeElementStiffness(st_selEl, st_material, st_planeStress);
}
function getAssStep() {
  return assemblySteps[Math.max(0, st_assStep || 0)] || null;
}
function getSolStep() {
  return solverSteps[Math.max(0, st_solStep || 0)] || null;
}
</script>

<div class="anim-panel" class:open={panel}>
  <div class="tabs">
    {#each [['mesh', '网格生成'], ['elem', '单元刚度'], ['ass', '整体装配'], ['solver', '方程求解']] as [k, n]}
      <button class={current === k ? 'active' : ''} on:click={() => { current = k; stopAnim(); }}>{n}</button>
    {/each}
    <button class="close" on:click={() => panel = false}>✕</button>
  </div>

  <div class="body">
    {#if current === 'mesh'}
      <h3>Delaunay 三角剖分 (Bowyer-Watson)</h3>
      <div class="desc">
        {#if st_meshStep >= 0 && st_meshSteps && st_meshSteps[st_meshStep]}
          {st_meshSteps[st_meshStep].desc}
        {:else}
          点击播放查看节点插入过程：红色=外接圆包含新点而被删除的三角形，绿色=重新连接生成的新三角形
        {/if}
      </div>
      <div class="progress">
        进度：{st_meshStep + 1} / {st_meshSteps ? st_meshSteps.length : 0}
        <div class="bar"><div class="fill" style="width:{st_meshSteps && st_meshSteps.length ? (((st_meshStep + 1) / st_meshSteps.length) * 100) : 0}%"></div></div>
      </div>
      <div class="ctrls">
        <button on:click={() => meshAnimStep.set(Math.max(-1, st_meshStep - 1))} disabled={st_meshPlaying}>⏮ 上一步</button>
        <button on:click={() => meshAnimPlaying.set(!st_meshPlaying)}>{st_meshPlaying ? '⏸ 暂停' : '▶ 播放'}</button>
        <button on:click={() => meshAnimStep.set(st_meshSteps ? Math.min(st_meshSteps.length - 1, st_meshStep + 1) : st_meshStep)} disabled={st_meshPlaying}>⏭ 下一步</button>
        <button on:click={() => { meshAnimStep.set(-1); meshAnimPlaying.set(false); }}>重置</button>
      </div>

    {:else if current === 'elem'}
      <h3>单元刚度矩阵计算（4步）</h3>
      {#if st_selEl && getElemResult()}
        <div class="elem-steps">
          <div class={'step ' + (st_elemStep >= 1 ? 'active' : '')}>
            <div class="tag">Step 1</div>
            <h4>三节点坐标与面积</h4>
            {#each st_selEl.nodes as n, i}
              <div class="coord">节点{i + 1}: ({formatNumber(n.x, 2)}, {formatNumber(n.y, 2)})</div>
            {/each}
            <div class="formula">
              A = ½ |(x₂−x₁)(y₃−y₁) − (x₃−x₁)(y₂−y₁)| = <b>{formatNumber(getElemResult().A, 4)}</b>
            </div>
          </div>
          <div class={'step ' + (st_elemStep >= 2 ? 'active' : '')}>
            <div class="tag">Step 2</div>
            <h4>形函数系数 & B 矩阵</h4>
            {#each getElemResult().coeffs as c, i}
              <div class="coord small">a{i+1}={formatNumber(c.a,2)}, b{i+1}={formatNumber(c.b,2)}, c{i+1}={formatNumber(c.c,2)}</div>
            {/each}
            <pre class="mat">B = 1/(2A) ×
{getElemResult().B.map(row => row.map(v => formatNumber(v, 3).padStart(8)).join(' ')).join('\n')}</pre>
          </div>
          <div class={'step ' + (st_elemStep >= 3 ? 'active' : '')}>
            <div class="tag">Step 3</div>
            <h4>本构 D 矩阵 ({st_planeStress ? '平面应力' : '平面应变'})</h4>
            <pre class="mat">{getElemResult().D.map(row => row.map(v => (v/1e9).toFixed(1).padStart(6)+'G').join('  ')).join('\n')}</pre>
          </div>
          <div class={'step ' + (st_elemStep >= 4 ? 'active' : '')}>
            <div class="tag">Step 4</div>
            <h4>Ke = t·A·Bᵀ·D·B</h4>
            <div class="formula">t = {st_selEl.t} m, A·t = {formatNumber(getElemResult().A * st_selEl.t, 6)} m³</div>
            <div class="mat-wrap"><pre class="mat">{getElemResult().Ke.map(row => row.map(v => (v/1e6).toFixed(2).padStart(7)+'M').join(' ')).join('\n')}</pre></div>
          </div>
        </div>
        <div class="ctrls">
          <button on:click={() => elementAnimStep.set(Math.max(0, st_elemStep - 1))} disabled={st_elemPlaying}>⏮ 上一步</button>
          <button on:click={() => elementAnimPlaying.set(!st_elemPlaying)}>{st_elemPlaying ? '⏸ 暂停' : '▶ 自动播放'}</button>
          <button on:click={() => elementAnimStep.set(Math.min(4, st_elemStep + 1))} disabled={st_elemPlaying}>⏭ 下一步</button>
          <button on:click={() => elementAnimStep.set(0)}>重置</button>
        </div>
      {:else}
        <div class="empty">请先在画布上点选一个三角形单元</div>
      {/if}

    {:else if current === 'ass'}
      <h3>整体刚度矩阵装配</h3>
      {#if st_elements && st_elements.length > 0}
        {#if assemblySteps.length === 0}
          <div class="empty">
            <button on:click={prepareAssemblyData}>准备装配动画数据</button>
          </div>
        {:else if getAssStep()}
          <div class="desc">{getAssStep().desc || ''}</div>
          <div class="progress">
            装配进度：{Math.max(0, st_assStep)} / {assemblySteps.length - 1}
            <div class="bar"><div class="fill" style="width:{st_assStep / (assemblySteps.length - 1) * 100}%"></div></div>
          </div>
          <div class="two-col">
            <div class="col">
              <h4>当前单元 Ke (6×6)</h4>
              {#if getAssStep().Ke}
                <pre class="mat small">{getAssStep().Ke.map(row => row.map(v => (Math.abs(v) < 1e-6 ? '0 ' : (v/1e6).toFixed(1).padStart(4)+'M')).join('')).join('\n')}</pre>
              {:else}
                <div class="empty small">无</div>
              {/if}
            </div>
            <div class="col">
              <h4>整体 K 矩阵 ({2 * (st_nodes ? st_nodes.length : 0)}×{2 * (st_nodes ? st_nodes.length : 0)})</h4>
              <div class="k-sparse">
                {#each getAssStep().K || [] as row, i}
                  <div class="k-row">
                    {#each row as cell, j}
                      <div class="k-cell"
                           style="background:{matCell(cell,1)}; {getAssStep().highlight && (getAssStep().highlight.rows.includes(i) || getAssStep().highlight.cols.includes(j)) ? 'box-shadow:inset 0 0 0 1px #e74c3c;' : ''}"
                           title="K[{i}][{j}] = {cell.toExponential(2)}"></div>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
          </div>
          <div class="ctrls">
            <button on:click={() => assemblyAnimStep.set(Math.max(0, st_assStep - 1))} disabled={st_assPlaying}>⏮ 上一单元</button>
            <button on:click={() => assemblyAnimPlaying.set(!st_assPlaying)}>{st_assPlaying ? '⏸ 暂停' : '▶ 自动装配'}</button>
            <button on:click={() => assemblyAnimStep.set(Math.min(assemblySteps.length - 1, st_assStep + 1))} disabled={st_assPlaying}>⏭ 下一单元</button>
            <button on:click={() => { assemblyAnimStep.set(0); }}>重置</button>
          </div>
        {/if}
      {:else}
        <div class="empty">请先生成网格并求解</div>
      {/if}

    {:else if current === 'solver'}
      <h3>KU=F 方程求解</h3>
      {#if st_femResults}
        {#if solverSteps.length === 0}
          <div class="empty"><button on:click={prepareSolverData}>准备求解动画</button></div>
        {:else if getSolStep()}
          <div class="desc">{getSolStep().desc || ''}</div>
          <div class="progress">
            进度：{Math.max(0, st_solStep) + 1} / {solverSteps.length}
            <div class="bar"><div class="fill" style="width:{((st_solStep + 1) / solverSteps.length) * 100}%"></div></div>
          </div>
          {#if getSolStep().M}
            <div class="sol-mat">
              <table>
                {#each getSolStep().M as row, i}
                  <tr>
                    {#each row.slice(0, -1) as cell, j}
                      <td class={i === getSolStep().pivot ? 'pivot' : i === getSolStep().eliminated && j <= getSolStep().pivot ? 'el' : ''}>{formatNumber(cell, 2)}</td>
                    {/each}
                    <td class="bar">│</td>
                    <td class="bcol">{formatNumber(row[row.length - 1], 3)}</td>
                  </tr>
                {/each}
              </table>
            </div>
          {/if}
          {#if solverResult && (st_solStep >= solverSteps.length - 1 || (st_nodes && st_nodes.length > 100))}
            <h4>位移结果 U</h4>
            <div class="disp-list">
              {#each (st_nodes || []).slice(0, 20) as n}
                <div class="disp-item">节点{n.id}: ux={(n.ux || 0).toExponential(3)}, uy={(n.uy || 0).toExponential(3)}</div>
              {/each}
              {#if st_nodes && st_nodes.length > 20}<div class="hint small">（仅显示前20个节点）</div>{/if}
            </div>
          {/if}
          <div class="ctrls">
            <button on:click={() => solverAnimStep.set(Math.max(0, st_solStep - 1))} disabled={st_solPlaying}>⏮ 上一步</button>
            <button on:click={() => solverAnimPlaying.set(!st_solPlaying)}>{st_solPlaying ? '⏸ 暂停' : '▶ 自动消元'}</button>
            <button on:click={() => solverAnimStep.set(Math.min(solverSteps.length - 1, st_solStep + 1))} disabled={st_solPlaying}>⏭ 下一步</button>
            <button on:click={() => solverAnimStep.set(0)}>重置</button>
          </div>
        {/if}
      {:else}
        <div class="empty">请先执行求解操作（🧮 求解）</div>
      {/if}
    {/if}
  </div>
</div>

<style>
.anim-panel {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: #fff;
  border-top: 2px solid #3498db;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
  height: 460px;
  transform: translateY(100%);
  transition: transform 0.3s ease;
  z-index: 200;
  display: flex;
  flex-direction: column;
}
.anim-panel.open { transform: translateY(0); }
.tabs {
  display: flex;
  border-bottom: 1px solid #e1e8ed;
  background: #f4f7fa;
}
.tabs button {
  padding: 11px 20px;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  color: #6b7c93;
  border-bottom: 2px solid transparent;
}
.tabs button.active {
  background: #fff;
  color: #2980b9;
  border-bottom-color: #3498db;
  font-weight: 600;
}
.tabs .close {
  margin-left: auto;
  color: #999;
  padding: 11px 16px;
}
.tabs .close:hover { color: #e74c3c; }
.body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.body h3 { font-size: 15px; margin-bottom: 10px; color: #2c3e50; }
.body h4 { font-size: 12px; color: #34495e; margin: 8px 0 5px; }
.desc {
  background: #eaf4fc;
  border-left: 4px solid #3498db;
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 0 4px 4px 0;
  color: #2c3e50;
  margin-bottom: 10px;
}
.progress {
  font-size: 12px;
  color: #555;
  margin-bottom: 6px;
}
.progress .bar {
  height: 6px;
  background: #ecf0f1;
  border-radius: 3px;
  margin-top: 4px;
  overflow: hidden;
}
.progress .fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2980b9);
  transition: width 0.3s;
}
.ctrls {
  display: flex;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid #eef2f7;
  margin-top: 12px;
  flex-wrap: wrap;
}
.ctrls button {
  padding: 7px 14px;
  border: 1px solid #c8d1dc;
  background: #fff;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  color: #2c3e50;
}
.ctrls button:hover:not(:disabled) {
  background: #eaf2fb;
  border-color: #3498db;
}
.ctrls button:disabled { opacity: 0.4; cursor: not-allowed; }
.elem-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.step {
  padding: 10px 12px;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  background: #fafbfc;
  opacity: 0.45;
  transition: all 0.3s;
}
.step.active {
  opacity: 1;
  background: #fff;
  border-color: #3498db;
  box-shadow: 0 2px 10px rgba(52,152,219,0.15);
  transform: translateY(-2px);
}
.tag {
  display: inline-block;
  padding: 2px 8px;
  background: #3498db;
  color: #fff;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  margin-bottom: 4px;
}
.coord { font-size: 12px; color: #555; margin: 2px 0; }
.coord.small { font-size: 11px; }
.formula {
  background: #fffbe6;
  border-left: 3px solid #f39c12;
  padding: 6px 10px;
  margin: 6px 0;
  font-size: 12px;
  border-radius: 0 3px 3px 0;
  color: #333;
}
.mat, .pre {
  background: #f6f9fc;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  padding: 6px 8px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 10.5px;
  line-height: 1.45;
  overflow-x: auto;
  color: #2c3e50;
}
.mat.small { font-size: 10px; }
.mat-wrap { overflow-x: auto; max-width: 100%; }
.empty {
  text-align: center;
  padding: 40px 20px;
  color: #95a5a6;
  font-size: 13px;
  background: #fafbfc;
  border-radius: 6px;
}
.empty.small { padding: 20px; }
.two-col {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: flex-start;
}
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
.col h4 { font-size: 12px; color: #555; margin-bottom: 6px; }
.k-sparse {
  background: #fafbfc;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  padding: 6px;
  overflow: auto;
  max-height: 220px;
  max-width: 100%;
}
.k-row { display: flex; gap: 1px; margin-bottom: 1px; }
.k-cell {
  width: 8px; height: 8px;
  flex-shrink: 0;
  border-radius: 1px;
  transition: all 0.15s;
}
.sol-mat {
  overflow-x: auto;
  max-height: 230px;
  background: #fafbfc;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  padding: 8px;
}
.sol-mat table {
  border-collapse: collapse;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 10.5px;
}
.sol-mat td {
  padding: 2px 8px;
  text-align: right;
  border-bottom: 1px solid #eee;
  white-space: nowrap;
  color: #333;
}
.sol-mat td.bar {
  color: #3498db;
  font-weight: 700;
  padding: 2px 4px;
}
.sol-mat td.bcol {
  background: #fff8e1;
  font-weight: 600;
  color: #d35400;
}
.sol-mat td.pivot {
  background: #e3f2fd !important;
  color: #1976d2;
  font-weight: 700;
  outline: 1px solid #2196f3;
}
.sol-mat td.el {
  background: #ffebee;
  color: #c62828;
}
.disp-list {
  max-height: 150px;
  overflow-y: auto;
  background: #f6f9fc;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  padding: 8px;
}
.disp-item {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11.5px;
  padding: 3px 6px;
  border-bottom: 1px solid #eee;
  color: #2c3e50;
}
.hint {
  font-size: 11px;
  color: #7f8c8d;
  padding: 6px 10px;
  background: #f7fafc;
  border-radius: 3px;
  margin: 4px 0;
}
.hint.small { font-size: 10.5px; }
</style>

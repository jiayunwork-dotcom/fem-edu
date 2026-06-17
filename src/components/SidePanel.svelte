<script lang="ts">
import { onDestroy } from 'svelte';
import type { ConvergenceEntry, SelectedEdge, EdgeLoad } from '$lib/types.js';
import {
  material as matStore, planeStress as psStore, thickness as tStore,
  bodyForce as bfStore, edgeLoads as eloadStore,
  selectedNodes as snStore, selectedEdges as seStore,
  nodes as nStore, elements as eStore,
  meshStats as msStore, femResults as frStore,
  postProcessMode as ppmStore, deformationScale as dsStore,
  stressType as stStore, contourLevels as clStore,
  selectedElement as selElemStore, convergenceData as cdStore,
  drawingMode as dmStore
} from '$lib/stores.js';
import { computeElementStiffness } from '$lib/fem.js';
import { formatNumber } from '$lib/matrix.js';

export let activeTab = 'material';

let unsubs = [];
let st_material, st_ps = true, st_ps_str = 'stress', st_t = 0.01, st_stats;
let st_nodes, st_elements, st_femRes, st_postMode, st_defScale;
let st_stress, st_contour, st_selEl, st_bf, st_eloads, st_selNodes, st_conv, st_selEdges, st_dm;

function init() {
  unsubs = [
    matStore.subscribe(v => st_material = v),
    psStore.subscribe(v => { st_ps = v !== false; st_ps_str = st_ps ? 'stress' : 'strain'; }),
    tStore.subscribe(v => st_t = Number(v) || 0.01),
    msStore.subscribe(v => st_stats = v),
    nStore.subscribe(v => st_nodes = v),
    eStore.subscribe(v => st_elements = v),
    frStore.subscribe(v => st_femRes = v),
    ppmStore.subscribe(v => st_postMode = v || 'deformation'),
    dsStore.subscribe(v => st_defScale = Number(v) || 100),
    stStore.subscribe(v => st_stress = v || 'vm'),
    clStore.subscribe(v => st_contour = Number(v) || 10),
    selElemStore.subscribe(v => st_selEl = v),
    bfStore.subscribe(v => st_bf = v),
    eloadStore.subscribe(v => st_eloads = Array.isArray(v) ? v : []),
    snStore.subscribe(v => st_selNodes = v),
    cdStore.subscribe(v => st_conv = Array.isArray(v) ? v : []),
    seStore.subscribe(v => st_selEdges = Array.isArray(v) ? v : []),
    dmStore.subscribe(v => st_dm = v || 'select')
  ];
}
init();
onDestroy(() => unsubs.forEach(u => u()));

let E_val = 210e9, nu_val = 0.3;
let fx = 0, fy = -9.8 * 7850;
let lcFx = 0, lcFy = -1000;
let edge_normal = 0, edge_shear = -1000;

function applyMaterial() {
  const E = Number(E_val) || 210e9;
  const nu = Number(nu_val) || 0.3;
  matStore.set({
    E, nu, rho: 7850,
    getDMatrix(ps) {
      if (ps) {
        const c = E / (1 - nu * nu);
        return [[c, c * nu, 0], [c * nu, c, 0], [0, 0, c * (1 - nu) / 2]];
      } else {
        const c = E / ((1 + nu) * (1 - 2 * nu));
        return [[c * (1 - nu), c * nu, 0], [c * nu, c * (1 - nu), 0], [0, 0, c * (1 - 2 * nu) / 2]];
      }
    }
  });
}

function applyBodyForce() {
  bfStore.set({ fx: Number(fx) || 0, fy: Number(fy) || 0 });
}

function applyNodalLoadToSelected() {
  if (!st_nodes || !st_nodes.length) return;
  const iter = st_selNodes instanceof Set ? st_selNodes : new Set(st_selNodes || []);
  if (!iter.size) return;
  const next = st_nodes.map(n => ({ ...n }));
  for (const nid of iter) {
    if (next[nid]) {
      next[nid].fx = (next[nid].fx || 0) + Number(lcFx || 0);
      next[nid].fy = (next[nid].fy || 0) + Number(lcFy || 0);
    }
  }
  nStore.set(next);
}

function applyConstraint(type) {
  if (!st_nodes || !st_nodes.length) return;
  const iter = st_selNodes instanceof Set ? st_selNodes : new Set(st_selNodes || []);
  if (!iter.size) return;
  const next = st_nodes.map(n => ({ ...n, constraints: { ...(n.constraints || {}) } }));
  for (const nid of iter) {
    if (!next[nid]) continue;
    const c = next[nid].constraints;
    switch (type) {
      case 'fixed': c.ux = true; c.uy = true; break;
      case 'hslide': c.uy = true; c.ux = false; break;
      case 'vslide': c.ux = true; c.uy = false; break;
      case 'spring': {
        const raw = prompt('弹簧刚度 k (N/m):', '1e6');
        const k = raw !== null ? (parseFloat(raw) || 0) : 0;
        c.kx = k; c.ky = k;
        break;
      }
      case 'none':
        c.ux = false; c.uy = false;
        c.kx = null; c.ky = null;
    }
  }
  nStore.set(next);
}

function clearLoadsOnSelected() {
  if (!st_nodes || !st_nodes.length) return;
  const iter = st_selNodes instanceof Set ? st_selNodes : new Set(st_selNodes || []);
  if (!iter.size) return;
  const next = st_nodes.map(n => ({ ...n }));
  for (const nid of iter) if (next[nid]) { next[nid].fx = 0; next[nid].fy = 0; }
  nStore.set(next);
}

function clearAllLoads() {
  if (!st_nodes) return;
  const next = st_nodes.map(n => ({ ...n, fx: 0, fy: 0 }));
  nStore.set(next);
  eloadStore.set([]);
  seStore.set([]);
}

function applyEdgeLoad() {
  if (!st_selEdges || !st_selEdges.length) return;
  const pn = Number(edge_normal) || 0;
  const pt = Number(edge_shear) || 0;
  const extras = st_selEdges.map(e => ({
    polyId: e.polyId, edgeIdx: e.edgeIdx, p1: { ...e.p1 }, p2: { ...e.p2 },
    normal: pn, shear: pt
  }));
  eloadStore.set([...(st_eloads || []), ...extras]);
  seStore.set([]);
}

function clearEdgeLoads() {
  eloadStore.set([]);
  seStore.set([]);
}

function addConvergenceRun() {
  if (!st_femRes || !st_elements || !st_elements.length) {
    alert('请先生成网格并求解后再记录');
    return;
  }
  let maxVM = 0;
  for (const el of st_elements) maxVM = Math.max(maxVM, (el.stress && el.stress.vm) || 0);
  const entry = { elements: st_elements.length, maxStress: maxVM, time: Date.now() };
  const next = [...st_conv, entry];
  cdStore.set(next);
}

function clearConvergence() { cdStore.set([]); }

function selNodesCount() {
  if (!st_selNodes) return 0;
  return st_selNodes instanceof Set ? st_selNodes.size : st_selNodes.length;
}
function selEdgesCount() { return (st_selEdges || []).length; }

function maxDisplacement() {
  if (!st_nodes || !st_nodes.length) return 0;
  return st_nodes.reduce((m, n) => Math.max(m, Math.hypot(n.ux || 0, n.uy || 0)), 0);
}
function maxVonMises() {
  if (!st_elements || !st_elements.length) return 0;
  return st_elements.reduce((m, e) => Math.max(m, (e.stress && e.stress.vm) || 0), 0);
}

function elementKeInfo() {
  if (!st_selEl || !st_material) return null;
  try { return computeElementStiffness(st_selEl, st_material, st_ps !== false); }
  catch (e) { console.error(e); return null; }
}

let convChart = null;
function buildConvChart() {
  if (!st_conv || !st_conv.length) { convChart = null; return; }
  const maxE = Math.max(...st_conv.map(d => d.elements));
  const values = st_conv.map(d => d.maxStress);
  let maxS = Math.max(...values), minS = Math.min(...values);
  if (maxS === minS) { maxS = maxS * 1.05 + 1; minS = minS * 0.95 - 1; }
  const pad = (maxS - minS) * 0.15 || 1;
  convChart = {
    maxE, minE: 0,
    maxS: maxS + pad, minS: minS - pad,
    range: maxS - minS + 2 * pad
  };
}
$: buildConvChart();
</script>

<div class="sidebar">
  <div class="tabs">
    {#each [['material', '材料'], ['bcs', '边界'], ['mesh', '网格'], ['post', '后处理'], ['element', '单元'], ['converge', '收敛']] as [k, n]}
      <button class={activeTab === k ? 'active' : ''} on:click={() => activeTab = k}>{n}</button>
    {/each}
  </div>

  <div class="content">
    {#if activeTab === 'material'}
      <h3>材料属性</h3>
      <div class="row"><label>弹性模量 E (Pa)</label><input type="number" bind:value={E_val} /></div>
      <div class="row"><label>泊松比 ν</label><input type="number" step="0.01" bind:value={nu_val} /></div>
      <div class="row"><label>厚度 t (m)</label><input type="number" step="0.001" bind:value={st_t} on:change={(e) => tStore.set(parseFloat(e.target.value) || 0.01)} /></div>
      <div class="row">
        <label>假设</label>
        <select bind:value={st_ps_str} on:change={() => psStore.set(st_ps_str === 'stress')}>
          <option value="stress">平面应力</option>
          <option value="strain">平面应变</option>
        </select>
      </div>
      <button class="sm primary" on:click={applyMaterial}>应用材料</button>
      <div class="hint">默认：钢材 E=210GPa, ν=0.3, 厚度=0.01m</div>

      <h3 style="margin-top:18px;">体力 (重力)</h3>
      <div class="row"><label>Fx (N/m³)</label><input type="number" bind:value={fx} /></div>
      <div class="row"><label>Fy (N/m³)</label><input type="number" bind:value={fy} /></div>
      <div class="btn-row">
        <button class="sm" on:click={applyBodyForce}>应用体力</button>
        <button class="sm ghost" on:click={() => bfStore.set(null)}>清除</button>
      </div>

    {:else if activeTab === 'bcs'}
      <h3>约束条件</h3>
      {#if st_dm !== 'constraint' && st_dm !== 'select'}
        <div class="warn">⚠ 请切换到「选择」或「约束」模式点选节点</div>
      {/if}
      <div class="stat-row"><span>已选节点</span><b>{selNodesCount()}</b></div>
      <div class="btn-row">
        <button class="sm" on:click={() => applyConstraint('fixed')} disabled={!selNodesCount()}>🔒 固定</button>
        <button class="sm" on:click={() => applyConstraint('hslide')} disabled={!selNodesCount()}>↔ 水平滑</button>
        <button class="sm" on:click={() => applyConstraint('vslide')} disabled={!selNodesCount()}>↕ 竖直滑</button>
      </div>
      <div class="btn-row">
        <button class="sm" on:click={() => applyConstraint('spring')} disabled={!selNodesCount()}>🌀 弹簧</button>
        <button class="sm ghost" on:click={() => applyConstraint('none')} disabled={!selNodesCount()}>清除约束</button>
      </div>

      <h3 style="margin-top:18px;">节点集中力</h3>
      <div class="row"><label>Fx (N)</label><input type="number" bind:value={lcFx} /></div>
      <div class="row"><label>Fy (N)</label><input type="number" bind:value={lcFy} /></div>
      <div class="btn-row">
        <button class="sm primary" on:click={applyNodalLoadToSelected} disabled={!selNodesCount()}>施加到选中</button>
        <button class="sm ghost" on:click={clearLoadsOnSelected} disabled={!selNodesCount()}>清除</button>
      </div>

      <h3 style="margin-top:18px;">边均布力</h3>
      {#if st_dm !== 'edge'}
        <div class="warn">⚠ 请切换到「📏 选边」模式，点击多边形边进行选择</div>
      {/if}
      <div class="stat-row"><span>已选边数</span><b>{selEdgesCount()}</b></div>
      <div class="row"><label>法向 p (Pa)</label><input type="number" bind:value={edge_normal} /></div>
      <div class="row"><label>切向 τ (Pa)</label><input type="number" bind:value={edge_shear} /></div>
      <div class="btn-row">
        <button class="sm primary" on:click={applyEdgeLoad} disabled={!selEdgesCount()}>施加均布力</button>
        <button class="sm ghost" on:click={() => seStore.set([])} disabled={!selEdgesCount()}>清选择</button>
        <button class="sm ghost" on:click={clearEdgeLoads}>清全部</button>
      </div>
      {#if (st_eloads || []).length > 0}
        <div class="hint small">已施加 {st_eloads.length} 条均布力边</div>
      {/if}

      <button class="sm full ghost" style="margin-top:10px" on:click={clearAllLoads}>清除所有载荷&约束</button>

      <h3 style="margin-top:18px;">操作提示</h3>
      <div class="hint small">
        • 绘制：点击添加顶点，点击起点闭合<br/>
        • 选择：单击节点，Ctrl+单击多选<br/>
        • 📏选边：单击多边形边缘高亮后加均布力<br/>
        • 约束：选节点后点「固定」等按钮<br/>
        • 载荷：选节点后输入Fy施加向下力
      </div>

    {:else if activeTab === 'mesh'}
      <h3>网格统计</h3>
      {#if st_stats}
        <div class="stat-row"><span>节点数</span><b>{st_stats.nodeCount}</b></div>
        <div class="stat-row"><span>单元数</span><b>{st_stats.elementCount}</b></div>
        <div class="stat-row"><span>最小角度</span><b>{(st_stats.minAngle || 0).toFixed(1)}°</b></div>
        <div class="stat-row"><span>最大角度</span><b>{(st_stats.maxAngle || 0).toFixed(1)}°</b></div>
        <div class="stat-row"><span>最小质量</span><b>{(st_stats.minQuality || 0).toFixed(3)}</b></div>
        <div class="stat-row"><span>平均质量</span><b>{(st_stats.avgQuality || 0).toFixed(3)}</b></div>
        <div class="quality-bar">
          <div class="fill" style="width:{(st_stats.avgQuality || 0) * 100}%; background:{(st_stats.avgQuality || 0) > 0.7 ? '#27ae60' : (st_stats.avgQuality || 0) > 0.5 ? '#f39c12' : '#e74c3c'}"></div>
        </div>
      {:else}
        <div class="empty">尚未生成网格<br/><span class="tiny">画好多边形后点「生成网格」</span></div>
      {/if}

    {:else if activeTab === 'post'}
      <h3>可视化模式</h3>
      <div class="btn-row">
        <button class="sm {st_postMode === 'deformation' ? 'active' : ''}" on:click={() => ppmStore.set('deformation')}>变形图</button>
        <button class="sm {st_postMode === 'stress' ? 'active' : ''}" on:click={() => ppmStore.set('stress')}>应力云图</button>
        <button class="sm {st_postMode === 'contour' ? 'active' : ''}" on:click={() => ppmStore.set('contour')}>等值线</button>
      </div>
      {#if st_postMode === 'deformation' || st_postMode === 'contour'}
        <div class="row">
          <label>放大系数</label>
          <input type="range" min="1" max="10000" bind:value={st_defScale} on:input={() => dsStore.set(st_defScale)} />
          <span class="num">{st_defScale}x</span>
        </div>
      {/if}
      {#if st_postMode === 'stress'}
        <div class="row">
          <label>应力分量</label>
          <select bind:value={st_stress} on:change={() => stStore.set(st_stress)}>
            <option value="vm">Von Mises</option>
            <option value="sx">σ_x</option>
            <option value="sy">σ_y</option>
            <option value="sxy">τ_xy</option>
          </select>
        </div>
      {/if}
      {#if st_postMode === 'contour'}
        <div class="row"><label>等值线数</label><input type="number" min="3" max="30" bind:value={st_contour} on:change={() => clStore.set(st_contour)} /></div>
      {/if}
      {#if st_femRes}
        <h3 style="margin-top:16px;">计算结果</h3>
        <div class="stat-row"><span>最大位移</span><b>{maxDisplacement().toExponential(3)} m</b></div>
        <div class="stat-row"><span>最大Von Mises</span><b>{(maxVonMises() / 1e6).toFixed(2)} MPa</b></div>
        {#if maxVonMises() > 0}
          <div class="hint small">建议：加密网格重复求解，在「收敛」标签观察应力是否趋于稳定</div>
        {/if}
      {:else}
        <div class="empty">尚未求解<br/><span class="tiny">生成网格后点「🧮 求解」</span></div>
      {/if}

    {:else if activeTab === 'element'}
      <h3>单元刚度矩阵</h3>
      {#if st_selEl}
        <div class="info">
          单元 #{st_selEl.id}<br/>
          节点：{(st_selEl.nodeIds || []).join(', ')}<br/>
          面积 A = {formatNumber(st_selEl.area, 4)}<br/>
          最小角 = {(st_selEl.minAngle || 0).toFixed(1)}°
        </div>
        {#if elementKeInfo()}
          <h4>B 矩阵 (3×6)</h4>
          <pre class="mat">{elementKeInfo().B.map(row => row.map(v => formatNumber(v, 3).padStart(9)).join(' ')).join('\n')}</pre>
          <h4>D 矩阵 (3×3)</h4>
          <pre class="mat">{elementKeInfo().D.map(row => row.map(v => formatNumber(v / 1e9, 3).padStart(7) + 'e9').join('  ')).join('\n')}</pre>
          <h4>Ke = t·A·Bᵀ·D·B (6×6)</h4>
          <div class="mat-scroll">
            <pre class="mat">{elementKeInfo().Ke.map(row => row.map(v => formatNumber(v / 1e6, 2).padStart(8) + 'M').join(' ')).join('\n')}</pre>
          </div>
        {/if}
        <h4 style="margin-top:12px;">单元应力</h4>
        <div class="stat-row"><span>σ_x</span><b>{formatNumber(((st_selEl.stress || {}).sx || 0) / 1e6, 2)} MPa</b></div>
        <div class="stat-row"><span>σ_y</span><b>{formatNumber(((st_selEl.stress || {}).sy || 0) / 1e6, 2)} MPa</b></div>
        <div class="stat-row"><span>τ_xy</span><b>{formatNumber(((st_selEl.stress || {}).sxy || 0) / 1e6, 2)} MPa</b></div>
        <div class="stat-row"><span>Von Mises</span><b>{formatNumber(((st_selEl.stress || {}).vm || 0) / 1e6, 2)} MPa</b></div>
      {:else}
        <div class="empty">在画布上点选一个单元<br/><span class="tiny">在「选择」模式下单击三角形内部</span></div>
      {/if}

    {:else if activeTab === 'converge'}
      <h3>收敛分析</h3>
      <div class="hint">
        <b>网格无关性验证：</b><br/>
        逐步减小网格间距 → 生成网格 → 求解 → 点「📊记录」
        观察最大应力是否趋于稳定值。
      </div>
      <div class="btn-row">
        <button class="sm primary" on:click={addConvergenceRun} disabled={!st_femRes}>📊 记录本次</button>
        <button class="sm ghost" on:click={clearConvergence} disabled={!st_conv.length}>清除全部</button>
      </div>

      {#if st_conv.length > 0}
        <h4 style="margin:14px 0 6px;font-size:12px;color:#34495e">单元数 vs 最大应力</h4>
        <div class="chart">
          <svg viewBox="0 0 300 200" preserveAspectRatio="none" width="100%">
            <rect x="0" y="0" width="300" height="200" fill="#fafbfc" stroke="#e1e8ed"/>
            {#each [0, 0.25, 0.5, 0.75, 1] as t}
              <line x1={40} y1={20 + t * 140} x2={290} y2={20 + t * 140} stroke="#eef2f7" stroke-dasharray="2 2"/>
              <text x="36" y={22 + t * 140} font-size="9" fill="#99a4b2" text-anchor="end">{formatNumber(convChart.maxS - t * convChart.range, 0)}</text>
            {/each}
            {#each [0, 0.5, 1] as t}
              <line x1={40 + t * 250} y1="20" x2={40 + t * 250} y2="160" stroke="#eef2f7" stroke-dasharray="2 2"/>
              <text x={40 + t * 250} y="180" font-size="9" fill="#99a4b2" text-anchor="middle">{Math.round(convChart.minE + t * convChart.maxE)}</text>
            {/each}
            {#each st_conv as d, i}
              {#if i > 0}
                <line
                  x1={40 + (st_conv[i - 1].elements / Math.max(convChart.maxE, 1)) * 250}
                  y1={160 - ((st_conv[i - 1].maxStress - convChart.minS) / convChart.range) * 140}
                  x2={40 + (d.elements / Math.max(convChart.maxE, 1)) * 250}
                  y2={160 - ((d.maxStress - convChart.minS) / convChart.range) * 140}
                  stroke="#3498db" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              {/if}
            {/each}
            {#each st_conv as d, i}
              <circle
                cx={40 + (d.elements / Math.max(convChart.maxE, 1)) * 250}
                cy={160 - ((d.maxStress - convChart.minS) / convChart.range) * 140}
                r="5" fill="#e74c3c" stroke="#fff" stroke-width="2"/>
              <text
                x={40 + (d.elements / Math.max(convChart.maxE, 1)) * 250}
                y={160 - ((d.maxStress - convChart.minS) / convChart.range) * 140 - 10}
                font-size="9" fill="#2c3e50" text-anchor="middle">{i + 1}</text>
            {/each}
            <text x="165" y="196" font-size="10" fill="#555" text-anchor="middle" font-weight="600">单元数 N</text>
            <text x="8" y="100" font-size="10" fill="#555" text-anchor="middle" transform="rotate(-90 8 100)" font-weight="600">σ_max (Pa)</text>
          </svg>
        </div>

        <h4 style="margin:14px 0 4px;font-size:12px;color:#34495e">记录数据</h4>
        <table>
          <tr><th>#</th><th>单元数</th><th>最大应力 (MPa)</th></tr>
          {#each st_conv as d, i}
            <tr>
              <td>{i + 1}</td>
              <td>{d.elements}</td>
              <td>{(d.maxStress / 1e6).toFixed(3)}</td>
            </tr>
          {/each}
          {#if st_conv.length >= 2}
            <tr style="background:#fff8e1;font-weight:600">
              <td colspan="2">相对误差 (末 vs 次末)</td>
              <td>{Math.abs(1 - st_conv[st_conv.length - 1].maxStress / st_conv[st_conv.length - 2].maxStress).toFixed(4)} ({(Math.abs(1 - st_conv[st_conv.length - 1].maxStress / st_conv[st_conv.length - 2].maxStress) * 100).toFixed(2)}%)</td>
            </tr>
          {/if}
        </table>
        {#if st_conv.length >= 2 && Math.abs(1 - st_conv[st_conv.length - 1].maxStress / st_conv[st_conv.length - 2].maxStress) < 0.05}
          <div class="hint ok">✅ 两次结果误差 &lt; 5%，网格已基本收敛</div>
        {:else if st_conv.length >= 2}
          <div class="hint warn">⚠ 误差仍较大，建议继续加密网格</div>
        {/if}
      {:else}
        <div class="empty">暂无数据<br/><span class="tiny">至少进行两次不同密度的求解</span></div>
      {/if}
    {/if}
  </div>
</div>

<style>
.sidebar { width: 330px; background: #fff; border-left: 1px solid #d9e2ec; display: flex; flex-direction: column; flex-shrink: 0; }
.tabs { display: flex; border-bottom: 1px solid #d9e2ec; background: #f4f7fa; }
.tabs button { flex: 1; padding: 9px 4px; border: none; background: transparent; font-size: 12px; cursor: pointer; color: #6b7c93; border-bottom: 2px solid transparent; transition: all 0.15s; }
.tabs button.active { background: #fff; color: #2980b9; border-bottom-color: #3498db; font-weight: 600; }
.content { flex: 1; overflow-y: auto; padding: 14px; }
h3 { font-size: 13px; color: #2c3e50; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 2px solid #e8eef5; }
h4 { font-size: 12px; color: #34495e; margin: 10px 0 5px; }
.row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.row label { font-size: 12px; color: #555; min-width: 80px; flex-shrink: 0; }
.row input, .row select { flex: 1; padding: 5px 7px; border: 1px solid #ccd3dc; border-radius: 4px; font-size: 12px; min-width: 0; }
.row input[type=range] { flex: 1; padding: 0; }
.row .num { font-size: 11px; color: #2980b9; min-width: 48px; text-align: right; }
.btn-row { display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; }
button.sm { padding: 5px 9px; font-size: 12px; border: 1px solid #ccd3dc; background: #fff; border-radius: 4px; cursor: pointer; color: #2c3e50; }
button.sm:hover:not(:disabled) { background: #eaf2fb; border-color: #3498db; color: #2980b9; }
button.sm.active { background: #3498db; color: #fff; border-color: #2980b9; }
button.sm.primary { background: #3498db; color: #fff; border-color: #2980b9; }
button.sm.primary:hover:not(:disabled) { background: #2980b9; }
button.sm.full { width: 100%; margin-top: 4px; }
button.sm.ghost { background: transparent; color: #95a5a6; }
button.sm:disabled { opacity: 0.4; cursor: not-allowed; }
.hint { font-size: 11px; color: #4a5568; padding: 8px 10px; background: #f0f6fc; border-left: 3px solid #3498db; border-radius: 3px; margin: 8px 0; line-height: 1.6; }
.hint.small { font-size: 11px; line-height: 1.7; }
.hint.ok { background: #eafaf1; border-left-color: #27ae60; color: #1e8449; }
.hint.warn { background: #fef6e4; border-left-color: #f39c12; color: #a65f00; }
.warn { font-size: 11px; padding: 6px 8px; background: #fff5e6; border-left: 3px solid #f39c12; border-radius: 3px; margin-bottom: 8px; color: #a65f00; }
.empty { text-align: center; padding: 28px 8px; color: #95a5a6; font-size: 13px; background: #fafbfc; border-radius: 6px; border: 1px dashed #dce4ec; }
.empty .tiny { display: block; font-size: 10.5px; margin-top: 4px; color: #b5bdc7; }
.stat-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #f0f3f7; }
.stat-row span { color: #6b7c93; }
.stat-row b { color: #2c3e50; }
.quality-bar { height: 8px; background: #ecf0f1; border-radius: 4px; overflow: hidden; margin: 6px 0; }
.quality-bar .fill { height: 100%; transition: all 0.3s; }
.info { background: #f4f8fc; border-left: 3px solid #3498db; padding: 8px 10px; font-size: 12px; line-height: 1.7; margin-bottom: 10px; color: #2c3e50; border-radius: 0 4px 4px 0; }
.mat { background: #f6f9fc; border: 1px solid #e1e8ed; border-radius: 4px; padding: 8px; font-family: 'SF Mono', Monaco, monospace; font-size: 10.5px; line-height: 1.5; overflow-x: auto; margin: 0; color: #2c3e50; white-space: pre; }
.mat-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
table th, table td { padding: 4px 8px; border-bottom: 1px solid #eee; text-align: right; font-size: 11.5px; color: #2c3e50; }
table th { background: #f4f7fa; color: #555; font-weight: 600; text-align: center; }
.chart { background: #fff; border: 1px solid #e1e8ed; border-radius: 6px; padding: 6px; margin-top: 8px; }
</style>

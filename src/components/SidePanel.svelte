<script>
import { onDestroy } from 'svelte';
import {
  material as matStore, planeStress as psStore, thickness as tStore,
  bodyForce as bfStore, edgeLoads as eloadStore,
  selectedNodes as snStore, nodes as nStore, elements as eStore,
  meshStats as msStore, femResults as frStore,
  postProcessMode as ppmStore, deformationScale as dsStore,
  stressType as stStore, contourLevels as clStore,
  selectedElement as seStore, convergenceData as cdStore,
  clearMesh
} from '$lib/stores.js';
import { computeElementStiffness } from '$lib/fem.js';
import { formatNumber } from '$lib/matrix.js';

export let activeTab = 'material';

let unsubs = [];
let st_material, st_ps = true, st_ps_str = 'stress', st_t, st_stats;
let st_nodes, st_elements, st_femRes, st_postMode, st_defScale;
let st_stress, st_contour, st_selEl, st_bf, st_eloads, st_selNodes, st_conv;

function init() {
  unsubs = [
    matStore.subscribe(v => st_material = v),
    psStore.subscribe(v => { st_ps = v; st_ps_str = v ? 'stress' : 'strain'; }),
    tStore.subscribe(v => st_t = v),
    msStore.subscribe(v => st_stats = v),
    nStore.subscribe(v => st_nodes = v),
    eStore.subscribe(v => st_elements = v),
    frStore.subscribe(v => st_femRes = v),
    ppmStore.subscribe(v => st_postMode = v),
    dsStore.subscribe(v => st_defScale = v),
    stStore.subscribe(v => st_stress = v),
    clStore.subscribe(v => st_contour = v),
    seStore.subscribe(v => st_selEl = v),
    bfStore.subscribe(v => st_bf = v),
    eloadStore.subscribe(v => st_eloads = v),
    snStore.subscribe(v => st_selNodes = v),
    cdStore.subscribe(v => st_conv = v)
  ];
}
init();
onDestroy(() => unsubs.forEach(u => u()));

let E_val = 210e9, nu_val = 0.3;
let fx = 0, fy = -9.8 * 7850;
let lcFx = 0, lcFy = -1000;

function applyMaterial() {
  const rho = 7850;
  const E = E_val, nu = nu_val;
  matStore.set({
    E, nu, rho,
    getDMatrix(ps) {
      if (ps) {
        const c = E / (1 - nu * nu);
        return [[c, c*nu, 0],[c*nu, c, 0],[0,0,c*(1-nu)/2]];
      } else {
        const c = E / ((1+nu)*(1-2*nu));
        return [[c*(1-nu), c*nu, 0],[c*nu, c*(1-nu), 0],[0,0,c*(1-2*nu)/2]];
      }
    }
  });
}

function applyBodyForce() {
  bfStore.set({ fx, fy });
}

function applyNodalLoadToSelected() {
  if (!st_nodes) return;
  for (const nid of (st_selNodes || [])) {
    const n = st_nodes[nid];
    if (n) { n.fx = (n.fx || 0) + lcFx; n.fy = (n.fy || 0) + lcFy; }
  }
  nStore.set([...st_nodes]);
}

function applyConstraint(type) {
  if (!st_nodes) return;
  const iter = st_selNodes instanceof Set ? st_selNodes : new Set(st_selNodes || []);
  for (const nid of iter) {
    const n = st_nodes[nid];
    if (!n) continue;
    n.constraints = n.constraints || {};
    switch (type) {
      case 'fixed': n.constraints.ux = true; n.constraints.uy = true; break;
      case 'hslide': n.constraints.uy = true; n.constraints.ux = false; break;
      case 'vslide': n.constraints.ux = true; n.constraints.uy = false; break;
      case 'spring':
        const k = parseFloat(prompt('弹簧刚度 k (N/m):', '1e6')) || 0;
        n.constraints.kx = k; n.constraints.ky = k;
        break;
      case 'none':
        n.constraints.ux = false; n.constraints.uy = false;
        n.constraints.kx = null; n.constraints.ky = null;
    }
  }
  nStore.set([...st_nodes]);
}

function clearLoadsOnSelected() {
  if (!st_nodes) return;
  for (const nid of (st_selNodes || [])) {
    const n = st_nodes[nid];
    if (n) { n.fx = 0; n.fy = 0; }
  }
  nStore.set([...st_nodes]);
}

function clearAll() {
  if (!st_nodes) return;
  for (const n of st_nodes) { n.fx = 0; n.fy = 0; }
  nStore.set([...st_nodes]);
  eloadStore.set([]);
}

function addConvergenceRun() {
  if (!st_femRes || !st_elements || !st_elements.length) return;
  let maxVM = 0;
  for (const el of st_elements) maxVM = Math.max(maxVM, (el.stress && el.stress.vm) || 0);
  cdStore.set([...(st_conv || []), { elements: st_elements.length, maxStress: maxVM, time: Date.now() }]);
}

function selNodesCount() {
  if (!st_selNodes) return 0;
  return st_selNodes instanceof Set ? st_selNodes.size : st_selNodes.length;
}

function maxDisplacement() {
  if (!st_nodes) return 0;
  return st_nodes.reduce((m, n) => Math.max(m, Math.hypot(n.ux || 0, n.uy || 0)), 0);
}
function maxVonMises() {
  if (!st_elements) return 0;
  return st_elements.reduce((m, e) => Math.max(m, (e.stress && e.stress.vm) || 0), 0);
}

function elementKeInfo() {
  if (!st_selEl || !st_material) return null;
  return computeElementStiffness(st_selEl, st_material, st_ps !== false);
}

function chartData() {
  if (!st_conv || !st_conv.length) return null;
  const maxE = Math.max(...st_conv.map(d => d.elements));
  const maxS = Math.max(...st_conv.map(d => d.maxStress));
  const minS = Math.min(...st_conv.map(d => d.maxStress)) * 0.95 || 1;
  const range = maxS - minS || 1;
  return { maxE, maxS, minS, range };
}
</script>

<div class="sidebar">
  <div class="tabs">
    {#each [['material','材料'],['bcs','边界'],['mesh','网格'],['post','后处理'],['element','单元'],['converge','收敛']] as [k,n]}
      <button class={activeTab === k ? 'active' : ''} on:click={() => activeTab = k}>{n}</button>
    {/each}
  </div>

  <div class="content">
    {#if activeTab === 'material'}
      <h3>材料属性</h3>
      <div class="row"><label>弹性模量 E (Pa)</label><input type="number" bind:value={E_val} /></div>
      <div class="row"><label>泊松比 ν</label><input type="number" step="0.01" bind:value={nu_val} /></div>
      <div class="row"><label>厚度 t (m)</label><input type="number" step="0.001" value={st_t} on:input={(e) => tStore.set(parseFloat(e.target.value) || 0.01)} /></div>
      <div class="row">
        <label>假设</label>
        <select bind:value={st_ps_str} on:change={() => psStore.set(st_ps_str === 'stress')}>
          <option value="stress">平面应力</option>
          <option value="strain">平面应变</option>
        </select>
      </div>
      <button class="sm" on:click={applyMaterial}>应用材料</button>
      <div class="hint">默认：钢材 E=210GPa, ν=0.3</div>
      <h3 style="margin-top:18px;">体力</h3>
      <div class="row"><label>Fx (N/m³)</label><input type="number" bind:value={fx} /></div>
      <div class="row"><label>Fy (N/m³)</label><input type="number" bind:value={fy} /></div>
      <div class="btn-row">
        <button class="sm" on:click={applyBodyForce}>应用体力</button>
        <button class="sm ghost" on:click={() => bfStore.set(null)}>清除体力</button>
      </div>

    {:else if activeTab === 'bcs'}
      <h3>约束条件</h3>
      <div class="hint">选中节点数：{selNodesCount()}</div>
      <div class="btn-row">
        <button class="sm" on:click={() => applyConstraint('fixed')} disabled={!selNodesCount()}>🔒 固定</button>
        <button class="sm" on:click={() => applyConstraint('hslide')} disabled={!selNodesCount()}>↔ 水平滑</button>
        <button class="sm" on:click={() => applyConstraint('vslide')} disabled={!selNodesCount()}>↕ 竖直滑</button>
      </div>
      <div class="btn-row">
        <button class="sm" on:click={() => applyConstraint('spring')} disabled={!selNodesCount()}>🌀 弹簧</button>
        <button class="sm ghost" on:click={() => applyConstraint('none')} disabled={!selNodesCount()}>清除约束</button>
      </div>
      <h3 style="margin-top:18px;">节点载荷</h3>
      <div class="row"><label>Fx (N)</label><input type="number" bind:value={lcFx} /></div>
      <div class="row"><label>Fy (N)</label><input type="number" bind:value={lcFy} /></div>
      <div class="btn-row">
        <button class="sm" on:click={applyNodalLoadToSelected} disabled={!selNodesCount()}>施加到选中</button>
        <button class="sm ghost" on:click={clearLoadsOnSelected} disabled={!selNodesCount()}>清除</button>
      </div>
      <button class="sm full ghost" on:click={clearAll}>清除所有载荷</button>
      <h3 style="margin-top:18px;">提示</h3>
      <div class="hint small">
        • 绘制模式：点击添加顶点，双击/点击起点闭合<br/>
        • 约束模式：点击节点切换固定约束<br/>
        • 载荷模式：点击节点输入集中力Fy<br/>
        • 选择模式：Ctrl+点选多选节点
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
          <div class="fill" style="width:{(st_stats.avgQuality || 0) * 100}%; background: {(st_stats.avgQuality || 0) > 0.7 ? '#27ae60' : (st_stats.avgQuality || 0) > 0.5 ? '#f39c12' : '#e74c3c'}"></div>
        </div>
      {:else}
        <div class="empty">尚未生成网格</div>
      {/if}

    {:else if activeTab === 'post'}
      <h3>可视化</h3>
      <div class="btn-row">
        <button class="sm {st_postMode === 'deformation' ? 'active' : ''}" on:click={() => ppmStore.set('deformation')}>变形图</button>
        <button class="sm {st_postMode === 'stress' ? 'active' : ''}" on:click={() => ppmStore.set('stress')}>应力云图</button>
        <button class="sm {st_postMode === 'contour' ? 'active' : ''}" on:click={() => ppmStore.set('contour')}>位移等值线</button>
      </div>
      {#if st_postMode === 'deformation' || st_postMode === 'contour'}
        <div class="row">
          <label>放大系数</label>
          <input type="range" min="1" max="10000" value={st_defScale || 100} on:input={(e) => dsStore.set(parseFloat(e.target.value))} />
          <span class="num">{st_defScale || 0}x</span>
        </div>
      {/if}
      {#if st_postMode === 'stress'}
        <div class="row">
          <label>应力分量</label>
          <select value={st_stress} on:change={(e) => stStore.set(e.target.value)}>
            <option value="vm">Von Mises</option>
            <option value="sx">σ_x</option>
            <option value="sy">σ_y</option>
            <option value="sxy">τ_xy</option>
          </select>
        </div>
      {/if}
      {#if st_postMode === 'contour'}
        <div class="row"><label>等值线数</label><input type="number" min="3" max="30" value={st_contour || 10} on:input={(e) => clStore.set(parseInt(e.target.value) || 10)} /></div>
      {/if}
      {#if st_femRes}
        <h3 style="margin-top:16px;">计算结果</h3>
        <div class="stat-row"><span>最大位移</span><b>{maxDisplacement().toExponential(3)}</b></div>
        <div class="stat-row"><span>最大Von Mises</span><b>{maxVonMises().toExponential(3)} Pa</b></div>
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
          <h4>Ke 矩阵 (6×6)</h4>
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
        <div class="empty">在画布上点选一个单元查看其刚度矩阵</div>
      {/if}

    {:else if activeTab === 'converge'}
      <h3>收敛分析</h3>
      <div class="hint">多次改变网格密度后求解，点击按钮记录结果</div>
      <div class="btn-row">
        <button class="sm" on:click={addConvergenceRun} disabled={!st_femRes}>📊 记录本次计算</button>
        <button class="sm ghost" on:click={() => cdStore.set([])} disabled={!st_conv || !st_conv.length}>清除记录</button>
      </div>
      {#if st_conv && st_conv.length > 0 && chartData()}
        <div class="chart" style="margin-top:12px;">
          <svg viewBox="0 0 280 180" preserveAspectRatio="none" width="100%" style="background:#fafbfc;border:1px solid #e1e8ed;border-radius:4px;">
            {#each st_conv as d, i}
              {#if i > 0}
                <line x1={20 + (st_conv[i - 1].elements / chartData().maxE) * 240} y1={160 - (((st_conv[i - 1].maxStress - chartData().minS) / chartData().range) * 130)}
                      x2={20 + (d.elements / chartData().maxE) * 240} y2={160 - (((d.maxStress - chartData().minS) / chartData().range) * 130)}
                      stroke="#3498db" stroke-width="2"/>
              {/if}
              <circle cx={20 + (d.elements / chartData().maxE) * 240} cy={160 - (((d.maxStress - chartData().minS) / chartData().range) * 130)} r="4" fill="#e74c3c"/>
            {/each}
            <line x1="20" y1="160" x2="270" y2="160" stroke="#999"/>
            <line x1="20" y1="20" x2="20" y2="160" stroke="#999"/>
            <text x="260" y="175" font-size="10" fill="#666">单元数</text>
            <text x="22" y="15" font-size="10" fill="#666">σ_max</text>
          </svg>
        </div>
        <table style="margin-top:10px;width:100%;font-size:11px;border-collapse:collapse;">
          <tr><th>#</th><th>单元数</th><th>最大应力(Pa)</th></tr>
          {#each st_conv as d, i}
            <tr><td>{i + 1}</td><td>{d.elements}</td><td>{d.maxStress.toExponential(3)}</td></tr>
          {/each}
        </table>
      {/if}
    {/if}
  </div>
</div>

<style>
.sidebar { width: 320px; background: #fff; border-left: 1px solid #d9e2ec; display: flex; flex-direction: column; flex-shrink: 0; }
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
button.sm.full { width: 100%; margin-top: 4px; }
button.sm.ghost { background: transparent; color: #95a5a6; }
button.sm:disabled { opacity: 0.4; cursor: not-allowed; }
.hint { font-size: 11px; color: #7f8c8d; padding: 8px 10px; background: #f7fafc; border-left: 3px solid #3498db; border-radius: 3px; margin: 8px 0; }
.hint.small { font-size: 11px; line-height: 1.7; }
.empty { text-align: center; padding: 24px 8px; color: #95a5a6; font-size: 12px; background: #fafbfc; border-radius: 4px; }
.stat-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #f0f3f7; }
.stat-row span { color: #6b7c93; }
.stat-row b { color: #2c3e50; }
.quality-bar { height: 8px; background: #ecf0f1; border-radius: 4px; overflow: hidden; margin: 6px 0; }
.quality-bar .fill { height: 100%; transition: all 0.3s; }
.info { background: #f4f8fc; border-left: 3px solid #3498db; padding: 8px 10px; font-size: 12px; line-height: 1.7; margin-bottom: 10px; color: #2c3e50; border-radius: 0 4px 4px 0; }
.mat { background: #f6f9fc; border: 1px solid #e1e8ed; border-radius: 4px; padding: 8px; font-family: 'SF Mono', Monaco, monospace; font-size: 10.5px; line-height: 1.5; overflow-x: auto; margin: 0; color: #2c3e50; white-space: pre; }
.mat-scroll { overflow-x: auto; }
table { border-collapse: collapse; }
table th, table td { padding: 3px 6px; border-bottom: 1px solid #eee; text-align: right; font-size: 11px; }
table th { background: #f4f7fa; color: #555; font-weight: 500; text-align: center; }
</style>

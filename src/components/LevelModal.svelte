<script lang="ts">
import { onDestroy } from 'svelte';
import { levels, getLevelById, getNextLevel } from '$lib/levels.js';
import type { Level, LevelQuestion, LevelScore } from '$lib/types.js';
import { viewMode, currentLevelId, unlockedLevels, levelAnswers, resetGeometry, polygons, meshSpacing, material, thickness, levelScores, levelAttempts, levelStartTime } from '$lib/stores.js';
import { createRectTemplate, createLShape, createIShape, createHoleCircle } from '$lib/canvasUtils.js';

export let onClose: () => void;

let selectedLevelId = 1;
let userAnswers = {};
let result = null;
let showCheckMsg = '';

let st_unlocked, st_answers, st_scores, st_attempts, st_startTimes;
const unsubsLv = [];
function initLv() {
  unsubsLv.push(unlockedLevels.subscribe(v => st_unlocked = v));
  unsubsLv.push(levelAnswers.subscribe(v => st_answers = v));
  unsubsLv.push(levelScores.subscribe(v => st_scores = Array.isArray(v) ? v : []));
  unsubsLv.push(levelAttempts.subscribe(v => st_attempts = v || {}));
  unsubsLv.push(levelStartTime.subscribe(v => st_startTimes = v || {}));
}
initLv();

function destroyLv() { unsubsLv.forEach(u => u()); }

const categories = [
  { id: '基础验证', color: '#3498db', range: [1, 3] },
  { id: '简单装配', color: '#27ae60', range: [4, 6] },
  { id: '经典结构', color: '#f39c12', range: [7, 10] },
  { id: '复杂结构', color: '#e74c3c', range: [11, 15] }
];

function getCatColor(id) {
  for (const c of categories) if (id >= c.range[0] && id <= c.range[1]) return c.color;
  return '#888';
}

function isUnlocked(id) { return st_unlocked && st_unlocked.has(id); }

function selectLevel(id) {
  if (!isUnlocked(id)) return;
  selectedLevelId = id;
  result = null;
  showCheckMsg = '';
  const lv = getLevelById(id);
  if (lv && lv.data && lv.data.questions) {
    userAnswers = {};
    for (const q of lv.data.questions) userAnswers[q.field] = '';
  }
}

function startLevel() {
  const lv = getLevelById(selectedLevelId);
  if (!lv) return;
  resetGeometry();
  currentLevelId.set(selectedLevelId);
  viewMode.set('level');
  applyLevelData(lv);
  const newStartTimes = { ...(st_startTimes || {}) };
  if (!newStartTimes[selectedLevelId]) {
    newStartTimes[selectedLevelId] = Date.now();
    levelStartTime.set(newStartTimes);
  }
  if (onClose) onClose();
}

function applyLevelData(lv) {
  const d = lv.data;
  if (d.template) {
    const hs = [];
    let outer = null;
    const p = d.params || {};
    switch (d.template) {
      case 'rect':
        outer = createRectTemplate(p.width || 200, p.height || 100);
        break;
      case 'lshape':
        outer = createLShape(p.w1 || 200, p.h1 || 200, p.w2 || 50, p.h2 || 50);
        break;
      case 'ishape':
        outer = createIShape(p.H || 200, p.B || 100, p.tf || 15, p.tw || 8);
        break;
      case 'plateWithHole':
        outer = createRectTemplate(p.width || 200, p.height || 100);
        hs.push(createHoleCircle((p.holeX || 100) - (p.width || 200) / 2, (p.holeY || 50) - (p.height || 100) / 2, p.holeR || 15));
        break;
    }
    if (outer) polygons.set([outer, ...hs]);
  }
  if (d.material) material.set({
    E: d.material.E, nu: d.material.nu, rho: d.material.rho || 7850,
    getDMatrix(ps) {
      const E = this.E, nu = this.nu;
      if (ps) {
        const c = E / (1 - nu * nu);
        return [[c, c*nu, 0],[c*nu, c, 0],[0,0,c*(1-nu)/2]];
      } else {
        const c = E / ((1+nu)*(1-2*nu));
        return [[c*(1-nu), c*nu, 0],[c*nu, c*(1-nu), 0],[0,0,c*(1-2*nu)/2]];
      }
    }
  });
  if (d.thickness != null) thickness.set(d.thickness);
  if (lv.data.meshSize) meshSpacing.set(lv.data.meshSize);
}

function checkManualAnswers() {
  const lv = getLevelById(selectedLevelId);
  if (!lv || !lv.data || !lv.data.questions) return;
  const newAttempts = { ...(st_attempts || {}) };
  newAttempts[selectedLevelId] = (newAttempts[selectedLevelId] || 0) + 1;
  levelAttempts.set(newAttempts);
  let allCorrect = true;
  const details = [];
  let correctCount = 0;
  for (const q of lv.data.questions) {
    const ua = parseFloat(userAnswers[q.field]);
    const diff = Math.abs(ua - q.answer);
    const rel = q.relative ? diff / Math.abs(q.answer) : diff;
    const tol = q.tolerance || 0.01;
    const ok = !isNaN(ua) && rel <= tol;
    if (ok) correctCount++;
    if (!ok) allCorrect = false;
    details.push({ q, ok, actual: ua, diff: rel });
  }
  if (allCorrect) {
    showCheckMsg = '✅ 全部正确！恭喜通过！';
    const nl = getNextLevel(selectedLevelId);
    if (nl && st_unlocked) {
      const ns = new Set(st_unlocked);
      ns.add(nl.id);
      unlockedLevels.set(ns);
    }
    const now = Date.now();
    const na = { ...(st_answers || {}) };
    na[selectedLevelId] = { passed: true, time: now };
    levelAnswers.set(na);
    const startTime = st_startTimes && st_startTimes[selectedLevelId] ? st_startTimes[selectedLevelId] : now;
    const timeTaken = now - startTime;
    const accuracy = lv.data.questions ? correctCount / lv.data.questions.length : 1;
    const score: LevelScore = {
      levelId: selectedLevelId,
      levelName: lv.name,
      category: lv.category,
      completed: true,
      completionTime: now,
      timeTaken,
      attempts: newAttempts[selectedLevelId],
      correctAnswers: correctCount,
      totalQuestions: lv.data.questions?.length || 0,
      accuracy
    };
    const existingScores = Array.isArray(st_scores) ? st_scores : [];
    const scoreIdx = existingScores.findIndex(s => s.levelId === selectedLevelId);
    if (scoreIdx >= 0) {
      existingScores[scoreIdx] = score;
    } else {
      existingScores.push(score);
    }
    levelScores.set(existingScores);
    result = { passed: true, details };
  } else {
    showCheckMsg = '❌ 存在错误，请检查标红的题目';
    result = { passed: false, details };
  }
}

function calculateLevel1Helpers(lv) {
  const d = lv.data;
  if (lv.id === 1) {
    const ns = d.nodes;
    const [n1, n2, n3] = [ns[0], ns[1], ns[2]];
    const A = Math.abs((n2.x - n1.x) * (n3.y - n1.y) - (n3.x - n1.x) * (n2.y - n1.y)) / 2;
    return { area: A };
  }
  if (lv.id === 2) {
    const ns = d.nodes;
    return {
      b1: ns[1].y - ns[2].y, b2: ns[2].y - ns[0].y, b3: ns[0].y - ns[1].y,
      c1: ns[2].x - ns[1].x, c2: ns[0].x - ns[2].x, c3: ns[1].x - ns[0].x
    };
  }
  return {};
}

function fillDemo(lv) {
  const expected = calculateLevel1Helpers(lv);
  for (const k in expected) {
    userAnswers[k] = Number.isInteger(expected[k]) ? expected[k] : parseFloat(expected[k].toFixed(6));
  }
  result = null;
  showCheckMsg = '';
}

onDestroy(() => destroyLv());
</script>

<div class="overlay" on:click={() => { if (event.target.classList.contains('overlay')) onClose && onClose(); }}>
  <div class="modal">
    <div class="header">
      <h2>🎯 教学关卡</h2>
      <button class="close" on:click={() => onClose && onClose()}>✕</button>
    </div>

    <div class="body">
      <div class="levels-grid">
        <h3>关卡进度</h3>
        {#each categories as cat}
          <div class="cat" style="border-left-color:{cat.color}">
            <div class="cat-title" style="color:{cat.color}">{cat.id}</div>
            <div class="levels-row">
              {#each levels.filter(l => l.id >= cat.range[0] && l.id <= cat.range[1]) as lvItem}
                <div class="lv-btn {selectedLevelId === lvItem.id ? 'sel' : ''} {isUnlocked(lvItem.id) ? '' : 'locked'}"
                     style="border-color:{getCatColor(lvItem.id)}"
                     on:click={() => selectLevel(lvItem.id)}>
                  <div class="lv-num">{lvItem.id}</div>
                  {#if !isUnlocked(lvItem.id)}<div class="lock">🔒</div>{/if}
                  {#if st_answers && st_answers[lvItem.id] && st_answers[lvItem.id].passed}<div class="done">✓</div>{/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="lv-detail">
        {#if getLevelById(selectedLevelId)}
          <div class="lv-head" style="border-top:3px solid {getCatColor(selectedLevelId)}">
            <div class="lv-cat" style="color:{getCatColor(selectedLevelId)}">{getLevelById(selectedLevelId).category}</div>
            <h3>{getLevelById(selectedLevelId).name}</h3>
            <p class="lv-desc">{getLevelById(selectedLevelId).description}</p>
            <div class="lv-cond">🎯 通关条件：{getLevelById(selectedLevelId).unlockCondition}</div>
          </div>

          {#if getLevelById(selectedLevelId).type === 'manual'}
            <div class="manual-area">
              <h4>题目数据</h4>
              {#if getLevelById(selectedLevelId).data.nodes}
                <div class="nodes-display">
                  {#each getLevelById(selectedLevelId).data.nodes as n, i}
                    <div class="coord-box">节点{i + 1}: ({n.x}, {n.y})</div>
                  {/each}
                </div>
                <div class="hint">
                  {#if getLevelById(selectedLevelId).id === 1}
                    提示：A = ½|(x₂−x₁)(y₃−y₁) − (x₃−x₁)(y₂−y₁)|
                  {:else if getLevelById(selectedLevelId).id === 2}
                    提示：bi = yj − yk, ci = xk − xj (循环指标1,2,3)
                  {:else if getLevelById(selectedLevelId).id === 3}
                    提示：D11 = E/(1-ν²) (平面应力), Ke = t·A·Bᵀ·D·B
                  {/if}
                </div>
              {/if}

              <h4 style="margin-top:14px">输入答案</h4>
              {#each getLevelById(selectedLevelId).data.questions as q}
                <div class="q-row">
                  <label>{q.label}</label>
                  <input type="number" step="any" bind:value={userAnswers[q.field]}
                         class="{result && result.details && result.details.find(d => d.q.field === q.field) && !result.details.find(d => d.q.field === q.field).ok ? 'wrong' : ''}"/>
                  {#if result && result.details && result.details.find(d => d.q.field === q.field)}
                    <span class="result-tag {result.details.find(d => d.q.field === q.field).ok ? 'ok' : 'bad'}">{result.details.find(d => d.q.field === q.field).ok ? '✓' : '✗'}</span>
                  {/if}
                </div>
              {/each}

              <div class="btn-row">
                <button on:click={checkManualAnswers}>✅ 提交答案</button>
                <button class="ghost" on:click={() => fillDemo(getLevelById(selectedLevelId))}>💡 演示答案</button>
              </div>
              {#if showCheckMsg}
                <div class="check-msg {result && result.passed ? 'ok' : ''}">{showCheckMsg}</div>
              {/if}
            </div>
          {:else}
            <div class="guided-area">
              <h4>执行步骤</h4>
              <ol class="steps-list">
                {#if getLevelById(selectedLevelId).type === 'guided' || getLevelById(selectedLevelId).type === 'analysis'}
                  <li>点击"开始关卡"进入主工作区，几何已载入</li>
                  <li>可在选择模式下拖拽顶点微调形状</li>
                  <li>设置网格密度后点击"生成网格"</li>
                  <li>切换到"约束/载荷"模式点选边界施加条件</li>
                  <li>点击"求解"查看变形图和应力云图</li>
                  <li>在侧栏"收敛"标签记录结果并对比误差</li>
                {:else}
                  <li>点击"开始关卡"进入自由建模工作区</li>
                  <li>根据提示在画布上绘制几何形状</li>
                  <li>完成"建模→网格→约束→载荷→求解"全流程</li>
                  <li>满足通关条件后系统自动解锁下一关</li>
                {/if}
              </ol>
              {#if getLevelById(selectedLevelId).data.hint}
                <div class="hint big">💡 {getLevelById(selectedLevelId).data.hint}</div>
              {/if}
              <div class="btn-row" style="margin-top:14px">
                <button class="primary" on:click={startLevel}>🚀 开始关卡</button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
.overlay {
  position: fixed; inset: 0;
  background: rgba(15, 30, 50, 0.55);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal {
  width: 960px;
  max-width: 100%;
  max-height: 90vh;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: pop 0.25s ease;
}
@keyframes pop { from { transform: translateY(20px); opacity: 0; } to { transform: none; } }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #2c3e50, #34495e);
  color: #fff;
}
.header h2 { font-size: 18px; margin: 0; }
.close {
  background: rgba(255,255,255,0.1);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 15px;
}
.close:hover { background: rgba(255,255,255,0.2); }
.body {
  display: grid;
  grid-template-columns: 280px 1fr;
  flex: 1;
  overflow: hidden;
}
.levels-grid {
  border-right: 1px solid #e9ecef;
  padding: 20px;
  overflow-y: auto;
  background: #f8fafc;
}
.levels-grid h3 { font-size: 13px; color: #34495e; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.5px; }
.cat { margin-bottom: 18px; padding-left: 10px; border-left: 3px solid; }
.cat-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.levels-row { display: flex; gap: 6px; flex-wrap: wrap; }
.lv-btn {
  width: 44px; height: 44px;
  border: 2px solid #cbd5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.15s;
  font-weight: 600;
}
.lv-btn:hover:not(.locked) {
  transform: translateY(-2px);
  box-shadow: 0 3px 8px rgba(0,0,0,0.1);
}
.lv-btn.sel {
  background: #3498db;
  color: #fff;
  border-color: #2980b9 !important;
  transform: scale(1.05);
}
.lv-btn.locked {
  opacity: 0.35;
  cursor: not-allowed;
  background: #e9ecef;
}
.lv-num { font-size: 14px; }
.lock, .done {
  position: absolute;
  font-size: 10px;
  bottom: 1px;
  right: 3px;
}
.done { color: #27ae60; font-weight: 900; }
.lv-detail {
  padding: 20px 24px;
  overflow-y: auto;
}
.lv-head {
  padding: 12px 16px;
  background: linear-gradient(180deg, #f8fafc, #fff);
  border-radius: 6px;
  margin-bottom: 16px;
}
.lv-cat { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.lv-head h3 { margin: 4px 0 6px; font-size: 17px; color: #2c3e50; }
.lv-desc { font-size: 13px; color: #555; line-height: 1.6; }
.lv-cond {
  margin-top: 8px; font-size: 12px; padding: 6px 10px; background: #fff8e1; color: #d35400; border-radius: 4px;
}
.manual-area h4 { font-size: 13px; color: #34495e; margin: 12px 0 8px; }
.nodes-display { display: flex; gap: 8px; flex-wrap: wrap; }
.coord-box {
  padding: 6px 10px; background: #fff; border: 1px solid #dee2e6; border-radius: 4px; font-size: 12px; font-family: monospace;
}
.hint {
  font-size: 12px; padding: 8px 10px; background: #e8f4fd; color: #0c5460; border-left: 3px solid #3498db; border-radius: 0 3px 3px 0; margin-top: 8px;
}
.hint.big { padding: 10px 12px; font-size: 13px; }
.q-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.q-row label { font-size: 12px; color: #555; min-width: 180px; }
.q-row input {
  flex: 1;
  padding: 7px 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px;
}
.q-row input.wrong { border-color: #e74c3c; background: #fff5f5; }
.result-tag {
  display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; font-weight: 700; border-radius: 50%; font-size: 12px;
}
.result-tag.ok { color: #fff; background: #27ae60; }
.result-tag.bad { color: #fff; background: #e74c3c; }
.btn-row { display: flex; gap: 8px; margin-top: 12px; }
button {
  padding: 8px 16px; border: 1px solid #3498db; background: #fff; color: #2980b9; border-radius: 5px; font-size: 13px; cursor: pointer;
}
button:hover { background: #eaf2fb; }
button.primary { background: #3498db; color: #fff; }
button.primary:hover { background: #2980b9; }
button.ghost { border-color: #999; color: #555; }
button.ghost:hover { background: #f5f5f5; }
.check-msg {
  margin-top: 12px; padding: 10px 14px; border-radius: 5px; font-size: 13px; background: #ffe8e8; color: #c0392b;
}
.check-msg.ok { background: #e8f8f0; color: #1e8449; }
.guided-area .steps-list {
  font-size: 13px; color: #444; padding-left: 20px; line-height: 2;
}
.guided-area .steps-list li { margin-bottom: 2px; }
</style>

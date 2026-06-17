<script lang="ts">
import { onDestroy } from 'svelte';
import type { LevelScore } from '$lib/types.js';
import { levelScores as lsStore, levelAnswers as laStore } from '$lib/stores.js';
import { levels } from '$lib/levels.js';

export let onClose: () => void;

let curUnsubs = [];
let st_scores: LevelScore[] = [];
let st_answers: Record<number, { passed: boolean; time: number }> = {};

function init() {
  curUnsubs = [
    lsStore.subscribe(v => st_scores = Array.isArray(v) ? v : []),
    laStore.subscribe(v => st_answers = v || {})
  ];
}
init();

function getScoresWithDetails(): LevelScore[] {
  return levels.map(lv => {
    const existing = st_scores.find(s => s.levelId === lv.id);
    const answer = st_answers[lv.id];
    if (existing) return existing;
    return {
      levelId: lv.id,
      levelName: lv.name,
      category: lv.category,
      completed: !!(answer && answer.passed),
      completionTime: answer?.time || 0,
      timeTaken: 0,
      attempts: 0,
      correctAnswers: 0,
      totalQuestions: lv.data?.questions?.length || 0,
      accuracy: 0
    };
  });
}

function formatTime(ms: number): string {
  if (!ms) return '--';
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

function getTotalTime(): number {
  return st_scores.reduce((sum, s) => sum + (s.completed ? s.timeTaken : 0), 0);
}

function getAvgAccuracy(): number {
  const completed = st_scores.filter(s => s.completed);
  if (!completed.length) return 0;
  const total = completed.reduce((sum, s) => sum + s.accuracy, 0);
  return total / completed.length;
}

function getCompletedCount(): number {
  return st_scores.filter(s => s.completed).length;
}

function buildChartData() {
  const scores = getScoresWithDetails();
  const completed = scores.filter(s => s.completed && s.timeTaken > 0);
  if (!completed.length) return { maxTime: 0, data: [] };
  const maxTime = Math.max(...completed.map(s => s.timeTaken), 1);
  return {
    maxTime,
    data: completed.map(s => ({
      id: s.levelId,
      time: s.timeTaken,
      name: `关卡${s.levelId}`
    }))
  };
}

function exportReport() {
  const scores = getScoresWithDetails();
  const completed = scores.filter(s => s.completed);
  const totalTime = getTotalTime();
  const avgAcc = getAvgAccuracy();

  let report = '='.repeat(60) + '\n';
  report += '           FEM-Edu 教学关卡成绩报告\n';
  report += '='.repeat(60) + '\n';
  report += `生成时间: ${new Date().toLocaleString()}\n`;
  report += `完成关卡: ${getCompletedCount()} / ${levels.length}\n`;
  report += `总学习时间: ${formatTime(totalTime)}\n`;
  report += `平均正确率: ${(avgAcc * 100).toFixed(1)}%\n`;
  report += '-'.repeat(60) + '\n\n';

  report += '各关卡详情：\n';
  report += '-'.repeat(60) + '\n';

  scores.forEach((s, i) => {
    report += `\n【关卡 ${s.levelId}】${s.levelName}\n`;
    report += `  分类: ${s.category}\n`;
    report += `  状态: ${s.completed ? '✅ 已完成' : '⏳ 未完成'}\n`;
    if (s.completed) {
      report += `  完成时间: ${new Date(s.completionTime).toLocaleString()}\n`;
      report += `  耗时: ${formatTime(s.timeTaken)}\n`;
      report += `  尝试次数: ${s.attempts}\n`;
      if (s.totalQuestions > 0) {
        report += `  答题: ${s.correctAnswers}/${s.totalQuestions} (${(s.accuracy * 100).toFixed(1)}%)\n`;
      }
    }
    report += '\n';
  });

  if (completed.length >= 2) {
    report += '-'.repeat(60) + '\n';
    report += '耗时统计（已完成关卡）：\n';
    report += '-'.repeat(60) + '\n';
    completed.forEach(s => {
      const barLen = Math.round((s.timeTaken / Math.max(...completed.map(x => x.timeTaken))) * 30);
      const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
      report += `  L${s.levelId.toString().padStart(2, ' ')} | ${bar} ${formatTime(s.timeTaken)}\n`;
    });
  }

  report += '\n' + '='.repeat(60) + '\n';
  report += '报告结束\n';
  report += '='.repeat(60) + '\n';

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FEM-Edu_成绩报告_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

onDestroy(() => curUnsubs.forEach(u => u()));
</script>

<div class="overlay" on:click={() => { if (event.target.classList.contains('overlay')) onClose && onClose(); }}>
  <div class="modal">
    <div class="header">
      <h2>📊 成绩报告</h2>
      <button class="close" on:click={() => onClose && onClose()}>✕</button>
    </div>

    <div class="body">
      <div class="summary">
        <div class="stat-card">
          <div class="stat-value">{getCompletedCount()}/{levels.length}</div>
          <div class="stat-label">已完成关卡</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{formatTime(getTotalTime())}</div>
          <div class="stat-label">总学习时间</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{(getAvgAccuracy() * 100).toFixed(1)}%</div>
          <div class="stat-label">平均正确率</div>
        </div>
      </div>

      <div class="section">
        <h3>各关卡详情</h3>
        <div class="scores-list">
          {#each getScoresWithDetails() as score}
            <div class="score-item {score.completed ? 'completed' : 'pending'}">
              <div class="score-header">
                <span class="lv-num">L{score.levelId}</span>
                <span class="lv-name">{score.levelName}</span>
                <span class="status {score.completed ? 'ok' : 'wait'}">
                  {score.completed ? '✓ 已完成' : '○ 未完成'}
                </span>
              </div>
              {#if score.completed}
                <div class="score-details">
                  <div class="detail-row">
                  <span>分类</span><span>{score.category}</span>
                </div>
                  <div class="detail-row">
                  <span>完成时间</span><span>{new Date(score.completionTime).toLocaleString()}</span>
                </div>
                {#if score.timeTaken > 0}
                  <div class="detail-row">
                  <span>耗时</span><span>{formatTime(score.timeTaken)}</span>
                </div>
                {/if}
                {#if score.attempts > 0}
                  <div class="detail-row">
                  <span>尝试次数</span><span>{score.attempts}</span>
                </div>
                {/if}
                {#if score.totalQuestions > 0}
                  <div class="detail-row">
                    <span>答题正确率</span>
                    <span>{score.correctAnswers}/{score.totalQuestions} ({(score.accuracy * 100).toFixed(1)}%)</span>
                  </div>
                {/if}
              </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      {#if buildChartData().data.length >= 2}
        <div class="section">
          <h3>各关卡耗时对比</h3>
          <div class="chart-container">
            <svg viewBox="0 0 600 300" preserveAspectRatio="none" width="100%">
              <rect x="0" y="0" width="600" height="300" fill="#fafbfc"/>
              {#each [0, 0.25, 0.5, 0.75, 1] as t}
                <line x1="60" y1={30 + t * 220} x2="580" y2={30 + t * 220} stroke="#eef2f7" stroke-dasharray="3 3"/>
                <text x="55" y={35 + t * 220} font-size="10" fill="#99a4b2" text-anchor="end">
                  {formatTime(buildChartData().maxTime * (1 - t))}
                </text>
              {/each}
              {#each buildChartData().data as d, i}
                <rect
                  x={70 + i * (520 / buildChartData().data.length) + 10}
                  y={250 - (d.time / buildChartData().maxTime) * 220}
                  width={(520 / buildChartData().data.length) - 15}
                  height={(d.time / buildChartData().maxTime) * 220}
                  fill="#3498db"
                  rx="4"
                />
                <text
                  x={70 + i * (520 / buildChartData().data.length) + (520 / buildChartData().data.length) / 2}
                  y="275"
                  font-size="11"
                  fill="#34495e"
                  text-anchor="middle"
                >
                  {d.name}
                </text>
                <text
                  x={70 + i * (520 / buildChartData().data.length) + (520 / buildChartData().data.length) / 2}
                  y={245 - (d.time / buildChartData().maxTime) * 220}
                  font-size="10"
                  fill="#2c3e50"
                  text-anchor="middle"
                  font-weight="600"
                >
                  {formatTime(d.time)}
                </text>
              {/each}
              <text x="320" y="295" font-size="12" fill="#555" text-anchor="middle" font-weight="600">关卡</text>
              <text x="20" y="140" font-size="12" fill="#555" text-anchor="middle" transform="rotate(-90 20 140)" font-weight="600">耗时</text>
            </svg>
          </div>
        </div>
      {/if}

      <div class="actions">
        <button class="primary" on:click={exportReport}>📥 导出报告</button>
        <button class="ghost" on:click={() => onClose && onClose()}>关闭</button>
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
  width: 900px;
  max-width: 100%;
  max-height: 90vh;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
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
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.stat-card {
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: #fff;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}
.stat-label {
  font-size: 12px;
  opacity: 0.9;
}
.section {
  margin-bottom: 24px;
}
.section h3 {
  font-size: 14px;
  color: #2c3e50;
  margin: 0 0 12px;
  padding-bottom: 6px;
  border-bottom: 2px solid #e8eef5;
}
.scores-list {
  max-height: 300px;
  overflow-y: auto;
}
.score-item {
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  margin-bottom: 10px;
  overflow: hidden;
}
.score-item.completed {
  border-left: 4px solid #27ae60;
}
.score-item.pending {
  border-left: 4px solid #95a5a6;
  opacity: 0.7;
}
.score-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
}
.lv-num {
  font-weight: 700;
  color: #3498db;
  font-size: 14px;
}
.lv-name {
  flex: 1;
  font-size: 13px;
  color: #2c3e50;
}
.status {
  font-size: 12px;
  font-weight: 600;
}
.status.ok { color: #27ae60; }
.status.wait { color: #95a5a6; }
.score-details {
  padding: 12px 16px;
  background: #fff;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid #f0f3f7;
}
.detail-row:last-child {
  border-bottom: none;
}
.detail-row span:first-child {
  color: #6b7c93;
}
.detail-row span:last-child {
  color: #2c3e50;
  font-weight: 500;
}
.chart-container {
  background: #fff;
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  padding: 10px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid #e8eef5;
}
button {
  padding: 10px 20px;
  border: 1px solid #3498db;
  background: #fff;
  color: #2980b9;
  border-radius: 5px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
button:hover {
  background: #eaf2fb;
}
button.primary {
  background: #3498db;
  color: #fff;
}
button.primary:hover {
  background: #2980b9;
}
button.ghost {
  border-color: #95a5a6;
  color: #555;
}
button.ghost:hover {
  background: #f5f5f5;
}
</style>

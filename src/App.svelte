<script>
import { onMount, onDestroy } from 'svelte';
import MainCanvas from './components/MainCanvas.svelte';
import Toolbar from './components/Toolbar.svelte';
import SidePanel from './components/SidePanel.svelte';
import AnimationPanel from './components/AnimationPanel.svelte';
import LevelModal from './components/LevelModal.svelte';
import { viewMode, currentLevelId, femResults } from '$lib/stores.js';
import { getLevelById } from '$lib/levels.js';

let canvasRef;
let showLevelModal = false;
let showAnimPanel = false;
let sideTab = 'material';

$: curLvObj = $currentLevelId ? getLevelById($currentLevelId) : null;
$: curLvName = curLvObj ? curLvObj.name : '';

onMount(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKey);
  }
});
onDestroy(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKey);
  }
});
function handleKey(e) {}

function handleMeshGenerated() {}
function handleFEMComplete() {}
</script>

<div class="app">
  <header class="topbar">
    <div class="brand">
      <div class="logo">🧊</div>
      <div>
        <h1>FEM-Edu</h1>
        <span class="sub">二维有限元分析交互式教学工具</span>
      </div>
    </div>
    <nav class="nav">
      <button class="nav-btn {$viewMode === 'sandbox' ? 'active' : ''}" on:click={() => { viewMode.set('sandbox'); currentLevelId.set(null); }}>
        🧪 自由工作区
      </button>
      <button class="nav-btn" on:click={() => showLevelModal = true}>
        🎯 教学关卡 {#if $currentLevelId}<span class="lv-badge">L{$currentLevelId}</span>{/if}
      </button>
      <button class="nav-btn" on:click={() => showAnimPanel = !showAnimPanel} class:hilite={$femResults}>
        🎬 动画演示
      </button>
      <a class="nav-btn help" href="https://zh.wikipedia.org/wiki/%E6%9C%89%E9%99%90%E5%85%83%E6%B3%95" target="_blank">
        📖 帮助
      </a>
    </nav>
    {#if $currentLevelId}
      <div class="level-info">
        <span class="tag">关卡 {$currentLevelId}</span>
        <span class="name">{curLvName}</span>
        <button class="exit" on:click={() => { currentLevelId.set(null); viewMode.set('sandbox'); }}>退出关卡 ✕</button>
      </div>
    {/if}
  </header>

  <Toolbar
    on:generateMesh={() => canvasRef && canvasRef.generateMesh && canvasRef.generateMesh()}
    on:runFEM={() => canvasRef && canvasRef.runFEM && canvasRef.runFEM()}
    on:fitView={() => canvasRef && canvasRef.fitView && canvasRef.fitView()}
  />

  <main class="workspace">
    <div class="canvas-wrap">
      <MainCanvas
        bind:this={canvasRef}
        width={900}
        height={640}
        onMeshGenerated={handleMeshGenerated}
        onFEMComplete={handleFEMComplete}
      />
      <div class="canvas-footer">
        <div class="tip">💡 提示：滚轮缩放 · Shift+拖拽平移 · 双击绘制闭合 · 点选单元查看刚度矩阵</div>
      </div>
    </div>
    <SidePanel bind:activeTab={sideTab} />
  </main>

  <AnimationPanel bind:panel={showAnimPanel} />
  {#if showLevelModal}
    <LevelModal onClose={() => showLevelModal = false} />
  {/if}
</div>

<style>
.app { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #eef2f7; overflow: hidden; }
.topbar { background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); color: #fff; padding: 10px 20px; display: flex; align-items: center; gap: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.15); flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo { font-size: 28px; background: rgba(255,255,255,0.15); padding: 6px 10px; border-radius: 8px; }
.brand h1 { font-size: 18px; font-weight: 700; letter-spacing: 0.5px; margin: 0; }
.sub { font-size: 11px; opacity: 0.75; letter-spacing: 0.2px; }
.nav { display: flex; gap: 6px; margin-left: 10px; }
.nav-btn { background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.12); padding: 7px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 0.15s; text-decoration: none; }
.nav-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
.nav-btn.active { background: rgba(255,255,255,0.95); color: #2c5282; font-weight: 600; border-color: #fff; }
.nav-btn.hilite { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(72,187,120,0.5); } 50% { box-shadow: 0 0 0 6px rgba(72,187,120,0); } }
.lv-badge { background: #e74c3c; color: #fff; padding: 1px 6px; border-radius: 8px; font-size: 10px; margin-left: 4px; font-weight: 700; }
.level-info { margin-left: auto; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.1); padding: 5px 10px 5px 5px; border-radius: 6px; }
.tag { background: #f39c12; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.name { font-size: 13px; opacity: 0.95; }
.exit { background: rgba(231,76,60,0.8); color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }
.exit:hover { background: #c0392b; }
.workspace { flex: 1; display: flex; overflow: hidden; }
.canvas-wrap { flex: 1; display: flex; flex-direction: column; padding: 14px; gap: 8px; overflow: hidden; align-items: center; justify-content: center; }
.canvas-footer { width: 900px; max-width: 100%; }
.tip { font-size: 11.5px; color: #718096; background: rgba(52,152,219,0.06); padding: 6px 12px; border-radius: 4px; border-left: 3px solid #3498db; }
</style>

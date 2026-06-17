<script lang="ts">
import { onMount, onDestroy, afterUpdate } from 'svelte';
import type { CrossSection } from '$lib/types.js';
import {
  crossSections as csStore,
  selectedSection as selSecStore,
  selectSection,
  deleteSectionById,
  duplicateSectionById,
  assignedSectionId as asgIdStore
} from '$lib/stores.js';
import { drawSection, createSectionThumbnail, drawComparisonSections } from '$lib/sectionDraw.js';
import {
  getSectionTypeLabel,
  formatArea,
  formatInertia,
  formatModulus
} from '$lib/sectionUtils.js';
import SectionEditor from './SectionEditor.svelte';

export let activeTab: string;

let previewCanvas: HTMLCanvasElement;
let previewCtx: CanvasRenderingContext2D;

let showEditor = false;
let editingSection: CrossSection | null = null;

let st_sections: CrossSection[] = [];
let st_selected: CrossSection | null = null;
let st_assignedId: string | null = null;

let comparisonMode = false;
let selectedSectionIds: Set<string> = new Set();
let sortBy: 'name' | 'area' | 'Ix' | 'createdAt' = 'name';
let searchQuery = '';

const COMPARISON_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea'];

let ctxMenu: { show: boolean; x: number; y: number; sectionId: string } = {
  show: false, x: 0, y: 0, sectionId: ''
};

let thumbnails: Record<string, string> = {};
let regenerateThumbs = false;

let unsubs: Array<() => void> = [];

$: filteredAndSortedSections = (() => {
  let result = [...st_sections];

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    result = result.filter(s => s.name.toLowerCase().includes(q));
  }

  result.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name, 'zh-CN');
      case 'area':
        return b.properties.area - a.properties.area;
      case 'Ix':
        return b.properties.Ix - a.properties.Ix;
      case 'createdAt':
        return b.createdAt - a.createdAt;
      default:
        return 0;
    }
  });

  return result;
})();

$: selectedForComparison = (() => {
  return st_sections.filter(s => selectedSectionIds.has(s.id));
})();

function findBestValues(sections: CrossSection[]): Record<string, number> {
  if (sections.length === 0) return {};
  return {
    area: Math.min(...sections.map(s => s.properties.area)),
    Ix: Math.max(...sections.map(s => s.properties.Ix)),
    Iy: Math.max(...sections.map(s => s.properties.Iy)),
    Ip: Math.max(...sections.map(s => s.properties.Ip)),
    Wx: Math.max(...sections.map(s => s.properties.Wx)),
    Wy: Math.max(...sections.map(s => s.properties.Wy))
  };
}

function buildThumbnails() {
  if (!regenerateThumbs) return;
  try {
    for (const sec of st_sections) {
      if (!thumbnails[sec.id]) {
        thumbnails[sec.id] = createSectionThumbnail(sec, 90, 65);
      }
    }
    const keepIds = new Set(st_sections.map(s => s.id));
    for (const k of Object.keys(thumbnails)) {
      if (!keepIds.has(k)) delete thumbnails[k];
    }
  } catch (e) {}
  regenerateThumbs = false;
}

function renderPreview() {
  if (!previewCtx || !previewCanvas) return;

  if (comparisonMode && selectedForComparison.length >= 2) {
    drawComparisonSections(
      previewCtx,
      previewCanvas.width,
      previewCanvas.height,
      selectedForComparison,
      COMPARISON_COLORS
    );
    return;
  }

  if (!st_selected) {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.fillStyle = '#f8fafc';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.fillStyle = '#94a3b8';
    previewCtx.font = '12px -apple-system, "PingFang SC", sans-serif';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText('点击下方列表选择截面', previewCanvas.width / 2, previewCanvas.height / 2);
    return;
  }
  drawSection(
    previewCtx,
    previewCanvas.width,
    previewCanvas.height,
    st_selected.type,
    st_selected.params,
    st_selected.properties,
    { showDimensions: true, showCentroid: true, padding: 32 }
  );
}

function exitComparisonMode() {
  comparisonMode = false;
  selectedSectionIds = new Set();
  renderPreview();
}

function init() {
  unsubs = [
    csStore.subscribe(v => {
      st_sections = Array.isArray(v) ? v : [];
      regenerateThumbs = true;
      buildThumbnails();
    }),
    selSecStore.subscribe(v => {
      st_selected = v || null;
      renderPreview();
    }),
    asgIdStore.subscribe(v => { st_assignedId = v; })
  ];
}

function onNewSection() {
  editingSection = null;
  showEditor = true;
}

function onSectionClick(e: MouseEvent, sec: CrossSection) {
  hideCtxMenu();

  if (e.ctrlKey || e.metaKey) {
    e.stopPropagation();
    e.preventDefault();
    if (selectedSectionIds.has(sec.id)) {
      const next = new Set(selectedSectionIds);
      next.delete(sec.id);
      selectedSectionIds = next;
      if (selectedSectionIds.size < 2) {
        comparisonMode = false;
      }
    } else {
      if (selectedSectionIds.size >= 4) {
      alert('最多只能选择4个截面进行对比');
      return;
    }
      const next = new Set(selectedSectionIds);
      next.add(sec.id);
      selectedSectionIds = next;
    if (selectedSectionIds.size >= 2) {
        comparisonMode = true;
      }
    }
    renderPreview();
  } else {
    if (comparisonMode) {
      exitComparisonMode();
    }
    selectSection(sec.id);
  }
}

function onSectionDblClick(sec: CrossSection) {
  hideCtxMenu();
  editingSection = sec;
  showEditor = true;
}

function onSectionRightClick(e: MouseEvent, sec: CrossSection) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenu = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    sectionId: sec.id
  };
}

function hideCtxMenu() {
  ctxMenu.show = false;
}

function onCopy() {
  duplicateSectionById(ctxMenu.sectionId);
  hideCtxMenu();
}

function onDelete() {
  const sec = st_sections.find(s => s.id === ctxMenu.sectionId);
  if (!sec) { hideCtxMenu(); return; }
  const ok = confirm(`确定删除截面「${sec.name}」吗？此操作不可撤销。`);
  if (ok) {
    deleteSectionById(ctxMenu.sectionId);
  }
  hideCtxMenu();
}

function onEditorClose() {
  showEditor = false;
  editingSection = null;
}

function onEditorSaved() {
  regenerateThumbs = true;
  buildThumbnails();
}

onMount(() => {
  init();
  if (previewCanvas) {
    previewCtx = previewCanvas.getContext('2d');
    renderPreview();
  }
  document.addEventListener('click', hideCtxMenu);
});

onDestroy(() => {
  unsubs.forEach(u => u && typeof u === 'function' && u());
  document.removeEventListener('click', hideCtxMenu);
});

afterUpdate(() => {
  if (previewCanvas && !previewCtx) {
    previewCtx = previewCanvas.getContext('2d');
  }
  if (activeTab === 'section') {
    renderPreview();
  }
});

$: {
  if (activeTab === 'section' && previewCtx) {
    renderPreview();
  }
}
</script>

<svelte:window on:scroll={hideCtxMenu} on:resize={hideCtxMenu} />

<div class="section-library">

  <div class="preview-block">
    <div class="block-header">
      <h3>📐 {comparisonMode ? '截面对比' : '截面预览'}</h3>
      {#if comparisonMode}
        <button class="exit-compare-btn" on:click={exitComparisonMode}>退出对比</button>
      {:else if st_selected}
        <span class="assigned-tag" class:active={st_assignedId === st_selected.id}>
          {st_assignedId === st_selected.id ? '✅ 已关联' : '未关联'}
        </span>
      {/if}
    </div>

    <div class="preview-canvas-wrap">
      <canvas bind:this={previewCanvas} width={280} height={210}></canvas>
    </div>

    {#if comparisonMode && selectedForComparison.length >= 2}
      {@const best = findBestValues(selectedForComparison)}
      <div class="comparison-legend">
        {#each selectedForComparison as sec, idx}
          <div class="legend-item">
            <span class="legend-color" style="background: {COMPARISON_COLORS[idx % COMPARISON_COLORS.length]}"></span>
            <span class="legend-name">{sec.name}</span>
          </div>
        {/each}
      </div>

      <div class="comparison-table-wrap">
        <table class="comparison-table">
          <thead>
            <tr>
              <th>属性</th>
              {#each selectedForComparison as sec, idx}
                <th style="color: {COMPARISON_COLORS[idx % COMPARISON_COLORS.length]}">{sec.name}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>面积 A</td>
              {#each selectedForComparison as sec}
                <td class={sec.properties.area === best.area ? 'best-value' : ''}>{formatArea(sec.properties.area)}</td>
              {/each}
            </tr>
            <tr>
              <td>惯性矩 Ix</td>
              {#each selectedForComparison as sec}
                <td class={sec.properties.Ix === best.Ix ? 'best-value' : ''}>{formatInertia(sec.properties.Ix)}</td>
              {/each}
            </tr>
            <tr>
              <td>惯性矩 Iy</td>
              {#each selectedForComparison as sec}
                <td class={sec.properties.Iy === best.Iy ? 'best-value' : ''}>{formatInertia(sec.properties.Iy)}</td>
              {/each}
            </tr>
            <tr>
              <td>极惯性矩 Ip</td>
              {#each selectedForComparison as sec}
                <td class={sec.properties.Ip === best.Ip ? 'best-value' : ''}>{formatInertia(sec.properties.Ip)}</td>
              {/each}
            </tr>
            <tr>
              <td>截面模量 Wx</td>
              {#each selectedForComparison as sec}
                <td class={sec.properties.Wx === best.Wx ? 'best-value' : ''}>{formatModulus(sec.properties.Wx)}</td>
              {/each}
            </tr>
            <tr>
              <td>截面模量 Wy</td>
              {#each selectedForComparison as sec}
                <td class={sec.properties.Wy === best.Wy ? 'best-value' : ''}>{formatModulus(sec.properties.Wy)}</td>
              {/each}
            </tr>
          </tbody>
        </table>
      </div>

      <div class="compare-hint">
        💡 按住 Ctrl 键点击截面卡片可多选/取消（最多4个）
      </div>
    {:else if st_selected}
      <div class="props-block">
        <div class="props-title">{st_selected.name}
          <span class="type-chip">{getSectionTypeLabel(st_selected.type)}</span>
        </div>
        <div class="props-list">
          <div class="prop">
            <span class="pl">面积 A</span>
            <span class="pv">{formatArea(st_selected.properties.area)}</span>
          </div>
          <div class="prop">
            <span class="pl">惯性矩 Ix</span>
            <span class="pv">{formatInertia(st_selected.properties.Ix)}</span>
          </div>
          <div class="prop">
            <span class="pl">惯性矩 Iy</span>
            <span class="pv">{formatInertia(st_selected.properties.Iy)}</span>
          </div>
          <div class="prop">
            <span class="pl">极惯性矩 Ip</span>
            <span class="pv">{formatInertia(st_selected.properties.Ip)}</span>
          </div>
          <div class="prop">
            <span class="pl">截面模量 Wx</span>
            <span class="pv">{formatModulus(st_selected.properties.Wx)}</span>
          </div>
          <div class="prop">
            <span class="pl">截面模量 Wy</span>
            <span class="pv">{formatModulus(st_selected.properties.Wy)}</span>
          </div>
        </div>
      </div>
    {:else}
      <div class="empty-hint">
        💡 从下方列表选择截面查看详情<br/>
        <span style="font-size: 10px; color: #94a3b8;">按住 Ctrl 键多选可进入对比模式</span>
      </div>
    {/if}
  </div>

  <div class="list-block">
    <div class="block-header with-btn">
      <h3>📚 截面列表</h3>
      <button class="new-btn" on:click={onNewSection}>
        <span class="plus">+</span> 新建
      </button>
    </div>

    <div class="list-controls">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          class="search-input"
          placeholder="搜索截面名称..."
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button class="clear-search" on:click={() => searchQuery = ''}>×</button>
        {/if}
      </div>
      <select class="sort-select" bind:value={sortBy}>
        <option value="name">按名称</option>
        <option value="area">按面积</option>
        <option value="Ix">按 Ix</option>
        <option value="createdAt">按创建时间</option>
      </select>
    </div>

    {#if filteredAndSortedSections.length > 0}
      <div class="section-list">
        {#each filteredAndSortedSections as sec (sec.id)}
          <div
            class={`sec-card ${st_selected?.id === sec.id ? 'selected' : ''} ${st_assignedId === sec.id ? 'assigned' : ''} ${selectedSectionIds.has(sec.id) ? 'multi-selected' : ''}`}
            on:click={(e) => onSectionClick(e, sec)}
            on:dblclick={() => onSectionDblClick(sec)}
            on:contextmenu={(e) => onSectionRightClick(e, sec)}
          >
            <div class="card-thumb">
              {#if selectedSectionIds.has(sec.id)}
                <div class="check-overlay">✓</div>
              {/if}
              {#if thumbnails[sec.id]}
                <img src={thumbnails[sec.id]} alt={sec.name} />
              {:else}
                <div class="thumb-fallback">{getSectionTypeLabel(sec.type).charAt(0)}</div>
              {/if}
            </div>
            <div class="card-info">
              <div class="card-name" title={sec.name}>
                {sec.name}
                {#if st_assignedId === sec.id}
                  <span class="assign-dot" title="已关联到求解"></span>
                {/if}
              </div>
              <div class="card-type">{getSectionTypeLabel(sec.type)}</div>
              <div class="card-area">A = {formatArea(sec.properties.area)}</div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-list">
        <div class="empty-icon">📭</div>
        <div class="empty-text">
          {searchQuery ? '没有匹配的截面' : '暂无已保存的截面'}
        </div>
        {#if !searchQuery}
          <button class="create-first-btn" on:click={onNewSection}>
            创建第一个截面
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if ctxMenu.show}
    <div class="ctx-menu" style="left:{ctxMenu.x}px; top:{ctxMenu.y}px;" on:mousedown|stopPropagation>
      <button class="ctx-item" on:click={onCopy}>
        <span class="ctx-icon">📋</span> 复制截面
      </button>
      <button class="ctx-item danger" on:click={onDelete}>
        <span class="ctx-icon">🗑</span> 删除截面
      </button>
    </div>
  {/if}

  <SectionEditor
    bind:visible={showEditor}
    bind:editingSection={editingSection}
    on:close={onEditorClose}
    on:saved={onEditorSaved}
  />
</div>

<style>
.section-library {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 2px solid #e8eef5;
  position: relative;
  z-index: 2;
}
.block-header.with-btn { margin-bottom: 8px; }

.block-header h3 {
  font-size: 13px;
  color: #2c3e50;
  margin: 0;
  padding: 0;
  border: none;
}

.assigned-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f1f5f9;
  color: #64748b;
  font-weight: 600;
}
.assigned-tag.active {
  background: #dcfce7;
  color: #15803d;
}

.preview-block {
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.preview-canvas-wrap {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.03);
  margin-bottom: 8px;
  position: relative;
  z-index: 1;
}
.preview-canvas-wrap canvas {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
}

.props-block {
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  position: relative;
  z-index: 1;
}
.props-title {
  font-size: 12.5px;
  font-weight: 700;
  color: #1e3a5f;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.type-chip {
  font-size: 10px;
  padding: 2px 7px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 10px;
  font-weight: 600;
}

.props-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 10px;
}
.prop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}
.pl {
  color: #64748b;
  font-weight: 500;
}
.pv {
  color: #1e293b;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 10.5px;
}

.empty-hint {
  text-align: center;
  padding: 12px;
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 8px;
  position: relative;
  z-index: 1;
}

.list-block {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  overflow: visible;
  position: relative;
  z-index: 5;
}

.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 12px;
  font-size: 11.5px;
  font-weight: 600;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 4px rgba(37,99,235,0.18);
  position: relative;
  z-index: 10;
  pointer-events: auto;
}
.new-btn:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(37,99,235,0.25);
}
.plus {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.section-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  position: relative;
  z-index: 3;
}
.section-list::-webkit-scrollbar { width: 6px; }
.section-list::-webkit-scrollbar-track { background: transparent; }
.section-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.section-list::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

.sec-card {
  display: flex;
  gap: 10px;
  padding: 8px;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
  position: relative;
  z-index: 2;
}
.sec-card:hover {
  border-color: #93c5fd;
  background: #f8faff;
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0,0,0,0.06);
}
.sec-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 2px rgba(37,99,235,0.1);
}
.sec-card.assigned::before {
  content: '';
  width: 3px;
  background: #22c55e;
  border-radius: 2px;
  margin: -8px 0 -8px -8px;
}

.card-thumb {
  flex-shrink: 0;
  width: 90px;
  height: 65px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb-fallback {
  font-size: 28px;
  color: #94a3b8;
}

.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.card-name {
  font-size: 12.5px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 5px;
}
.assign-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(34,197,94,0.18);
}
.card-type {
  font-size: 10.5px;
  color: #64748b;
  font-weight: 500;
}
.card-area {
  font-size: 11px;
  color: #3b82f6;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, monospace;
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 12px;
  background: #f8fafc;
  border: 1.5px dashed #cbd5e1;
  border-radius: 10px;
  position: relative;
  z-index: 3;
}
.empty-icon { font-size: 32px; opacity: 0.6; }
.empty-text {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}
.create-first-btn {
  margin-top: 6px;
  padding: 7px 16px;
  font-size: 11.5px;
  font-weight: 600;
  background: #dbeafe;
  color: #1d4ed8;
  border: 1.5px solid #93c5fd;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  z-index: 10;
  pointer-events: auto;
}
.create-first-btn:hover {
  background: #bfdbfe;
  border-color: #60a5fa;
}

.ctx-menu {
  position: fixed;
  z-index: 10000;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
  padding: 4px;
  min-width: 130px;
  animation: popIn 0.12s ease;
}
@keyframes popIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  color: #334155;
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.ctx-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.ctx-item.danger { color: #dc2626; }
.ctx-item.danger:hover { background: #fef2f2; color: #b91c1c; }
.ctx-icon { font-size: 13px; }

.exit-compare-btn {
  padding: 3px 10px;
  font-size: 10.5px;
  font-weight: 600;
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.exit-compare-btn:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}

.comparison-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #334155;
  font-weight: 500;
}
.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(0,0,0,0.15);
}

.comparison-table-wrap {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
}
.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5px;
}
.comparison-table th {
  position: sticky;
  top: 0;
  background: #f1f5f9;
  padding: 6px 8px;
  text-align: center;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
  font-size: 10px;
}
.comparison-table td {
  padding: 5px 8px;
  text-align: center;
  border-bottom: 1px solid #f1f5f9;
  font-family: 'SF Mono', Monaco, monospace;
  color: #1e293b;
}
.comparison-table tbody tr:hover {
  background: #f8fafc;
}
.comparison-table td:first-child {
  text-align: left;
  font-weight: 500;
  color: #64748b;
  font-family: inherit;
}
.comparison-table .best-value {
  color: #15803d !important;
  font-weight: 700;
  background: #dcfce7 !important;
}

.compare-hint {
  text-align: center;
  padding: 6px 10px;
  font-size: 10px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 6px;
}

.list-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 2px;
}
.search-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 10px;
  font-size: 11px;
  opacity: 0.5;
  pointer-events: none;
}
.search-input {
  flex: 1;
  padding: 6px 28px 6px 28px;
  font-size: 11.5px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  transition: all 0.15s;
}
.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
.clear-search {
  position: absolute;
  right: 6px;
  width: 18px;
  height: 18px;
  border: none;
  background: #e2e8f0;
  color: #64748b;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.clear-search:hover {
  background: #cbd5e1;
  color: #334155;
}
.sort-select {
  padding: 6px 28px 6px 10px;
  font-size: 11.5px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 8px center;
  background-size: 12px;
  appearance: none;
  cursor: pointer;
  font-weight: 500;
  color: #334155;
  transition: all 0.15s;
}
.sort-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}

.sec-card.multi-selected {
  border-color: #16a34a;
  background: #f0fdf4;
  box-shadow: 0 0 0 2px rgba(22,163,74,0.15);
}
.card-thumb {
  position: relative;
}
.check-overlay {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: #16a34a;
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.comparison-table-wrap::-webkit-scrollbar { width: 6px; }
.comparison-table-wrap::-webkit-scrollbar-track { background: transparent; }
.comparison-table-wrap::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
</style>

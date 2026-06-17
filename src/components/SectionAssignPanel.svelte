<script lang="ts">
import { onDestroy } from 'svelte';
import { createEventDispatcher } from 'svelte';
import type { CrossSection } from '$lib/types.js';
import {
  crossSections as csStore,
  assignedSectionId as asgIdStore,
  assignedSection as asgStore,
  assignSection
} from '$lib/stores.js';
import {
  getSectionTypeLabel,
  formatArea,
  formatInertia
} from '$lib/sectionUtils.js';
import { createSectionThumbnail } from '$lib/sectionDraw.js';

const dispatch = createEventDispatcher();

export let visible = false;

let st_sections: CrossSection[] = [];
let st_assignedId: string | null = null;
let st_assigned: CrossSection | null = null;
let selectedId: string | null = null;
let thumbnails: Record<string, string> = {};
let selectedSec: CrossSection | null = null;

let unsubs = [];

$: {
  if (visible) {
    selectedId = st_assignedId;
    buildThumbnails();
  }
}

$: {
  selectedSec = (selectedId && st_sections.find(s => s.id === selectedId)) || null;
}

function init() {
  unsubs = [
    csStore.subscribe(v => {
      st_sections = Array.isArray(v) ? v : [];
    }),
    asgIdStore.subscribe(v => { st_assignedId = v; }),
    asgStore.subscribe(v => { st_assigned = v || null; })
  ];
}
init();
onDestroy(() => unsubs.forEach(u => u()));

function buildThumbnails() {
  try {
    for (const sec of st_sections) {
      if (!thumbnails[sec.id]) {
        thumbnails[sec.id] = createSectionThumbnail(sec, 70, 50);
      }
    }
  } catch (e) {}
}

function onSelect(e: Event) {
  const target = e.target as HTMLSelectElement;
  selectedId = target.value || null;
}

function onSkip() {
  assignSection(null);
  close();
  dispatch('confirm');
}

function onApply() {
  assignSection(selectedId);
  close();
  dispatch('confirm');
}

function close() {
  visible = false;
  dispatch('close');
}

function handleBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) onSkip();
}
</script>

{#if visible}
<div class="backdrop" on:click={handleBackdrop}>
  <div class="panel" on:mousedown|stopPropagation>
    <div class="panel-header">
      <div class="title-wrap">
        <span class="icon">🔗</span>
        <h3>关联截面到求解</h3>
      </div>
      <button class="close-x" on:click={onSkip}>×</button>
    </div>

    <div class="panel-body">
      <div class="desc">
        选择一个已保存的截面，其惯性矩（Ix, Iy）将用于后续弯曲应力分量的计算显示。
        也可以跳过此步骤，不关联截面直接求解。
      </div>

      <div class="form-row">
        <label class="form-label">选择截面</label>
        <select class="form-select" value={selectedId || ''} on:change={onSelect}>
          <option value="">-- 不关联截面 --</option>
          {#each st_sections as sec}
            <option value={sec.id}>
              {sec.name}（{getSectionTypeLabel(sec.type)}）
            </option>
          {/each}
        </select>
      </div>

      {#if selectedId && selectedSec}
          <div class="selected-preview">
            <div class="prev-thumb">
              {#if thumbnails[selectedSec.id]}
                <img src={thumbnails[selectedSec.id]} alt="" />
              {/if}
            </div>
            <div class="prev-info">
              <div class="prev-name">
                {selectedSec.name}
                <span class="prev-type">{getSectionTypeLabel(selectedSec.type)}</span>
              </div>
              <div class="prev-meta">
                <span>面积 {formatArea(selectedSec.properties.area)}</span>
                <span>Ix {formatInertia(selectedSec.properties.Ix)}</span>
                <span>Iy {formatInertia(selectedSec.properties.Iy)}</span>
              </div>
            </div>
          </div>
      {:else if st_assigned}
        <div class="no-select-hint">
          💡 当前已关联：<b>{st_assigned.name}</b>，可在下方「跳过并保持当前关联」
        </div>
      {:else}
        <div class="no-select-hint">
          💡 未选择截面将直接进行常规平面应力求解
        </div>
      {/if}

      <div class="tip-box">
        <div class="tip-title">📌 关联后的效果</div>
        <ul>
          <li>后处理「应力云图」会额外显示弯曲应力分量 σ_bend_x, σ_bend_y</li>
          <li>弯曲应力基于截面惯性矩：σ = M·y/I</li>
          <li>可随时在「截面库」右键切换当前关联截面</li>
        </ul>
      </div>
    </div>

    <div class="panel-footer">
      <button class="btn btn-skip" on:click={onSkip}>
        {st_assigned ? '跳过并保持当前关联' : '不关联，直接求解'}
      </button>
      <button class="btn btn-apply" on:click={onApply} disabled={!selectedId}>
        ✅ 选择此截面并求解
      </button>
    </div>
  </div>
</div>
{/if}

<style>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  animation: fadeIn 0.18s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.panel {
  width: 480px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
  animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideIn {
  from { transform: translateY(-12px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: linear-gradient(135deg, #f0f7ff 0%, #e8f0fe 100%);
  border-bottom: 1px solid #dbe6f3;
}
.title-wrap { display: flex; align-items: center; gap: 8px; }
.title-wrap .icon { font-size: 18px; }
.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1e3a5f;
}
.close-x {
  width: 30px; height: 30px;
  border: none; background: transparent;
  font-size: 22px; color: #64748b;
  cursor: pointer; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.close-x:hover { background: rgba(220,38,38,0.08); color: #dc2626; }

.panel-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: #475569;
  background: #f8fafc;
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}
.form-select {
  padding: 8px 12px;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
  transition: all 0.15s;
  cursor: pointer;
}
.form-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}

.selected-preview {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1.5px solid #6ee7b7;
  border-radius: 10px;
}
.prev-thumb {
  width: 70px;
  height: 50px;
  flex-shrink: 0;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}
.prev-thumb img { width: 100%; height: 100%; object-fit: contain; }
.prev-info { flex: 1; min-width: 0; }
.prev-name {
  font-size: 13.5px;
  font-weight: 700;
  color: #065f46;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.prev-type {
  font-size: 10.5px;
  padding: 2px 7px;
  background: #059669;
  color: #fff;
  border-radius: 10px;
  font-weight: 600;
}
.prev-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 10.5px;
  color: #047857;
  font-family: 'SF Mono', Monaco, monospace;
}

.no-select-hint {
  font-size: 12px;
  padding: 10px 12px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 8px;
  border-left: 3px solid #f59e0b;
}
.no-select-hint b { color: #78350f; }

.tip-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 10px 14px;
}
.tip-title {
  font-size: 12px;
  font-weight: 700;
  color: #1e3a5f;
  margin-bottom: 6px;
}
.tip-box ul {
  margin: 0;
  padding-left: 18px;
  font-size: 11.5px;
  line-height: 1.75;
  color: #475569;
}
.tip-box li { margin: 0; }

.panel-footer {
  padding: 12px 20px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #f1f5f9;
  background: #fafbfc;
}

.btn {
  padding: 8px 18px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: all 0.15s;
}
.btn-skip {
  background: #fff;
  color: #475569;
  border-color: #cbd5e1;
}
.btn-skip:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  color: #1e293b;
}
.btn-apply {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
  box-shadow: 0 2px 6px rgba(37,99,235,0.22);
}
.btn-apply:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(37,99,235,0.3);
}
.btn-apply:disabled {
  background: #93c5fd;
  border-color: #93c5fd;
  cursor: not-allowed;
  opacity: 0.7;
  box-shadow: none;
  transform: none;
}
</style>

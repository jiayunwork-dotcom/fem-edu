<script lang="ts">
import { onMount, onDestroy, afterUpdate, createEventDispatcher } from 'svelte';
import type {
  SectionType,
  SectionRectParams,
  SectionCircleParams,
  SectionHollowCircleParams,
  SectionTShapeParams,
  SectionParams,
  SectionProperties,
  CrossSection,
  SectionValidationErrors
} from '$lib/types.js';
import {
  getDefaultParams,
  getParamLabels,
  getSectionTypeLabel,
  validateSectionParams,
  computeSectionProperties,
  createSection,
  formatArea,
  formatInertia,
  formatModulus
} from '$lib/sectionUtils.js';
import { drawSection } from '$lib/sectionDraw.js';
import { addSection, updateSectionById } from '$lib/stores.js';

const dispatch = createEventDispatcher();

export let visible = false;
export let editingSection: CrossSection | null = null;

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let sectionType: SectionType = 'rectangle';
let sectionName = '';
let params: any = {};
let errors: SectionValidationErrors = {};
let properties: SectionProperties;

let unsubs = [];

const sectionTypes: Array<{ key: SectionType; label: string; icon: string }> = [
  { key: 'rectangle', label: '矩形实心', icon: '▭' },
  { key: 'circle', label: '圆形实心', icon: '○' },
  { key: 'hollowCircle', label: '空心圆管', icon: '◎' },
  { key: 'tShape', label: 'T形截面', icon: '⊥' }
];

$: {
  if (visible) {
    if (editingSection) {
      sectionType = editingSection.type;
      sectionName = editingSection.name;
      params = JSON.parse(JSON.stringify(editingSection.params));
    } else {
      sectionType = sectionType || 'rectangle';
      sectionName = '';
      params = JSON.parse(JSON.stringify(getDefaultParams(sectionType)));
    }
    recomputeAll();
  }
}

function switchType(type: SectionType) {
  sectionType = type;
  params = JSON.parse(JSON.stringify(getDefaultParams(type)));
  errors = {};
  recomputeAll();
}

function updateParam(key: string, val: any) {
  const num = parseFloat(val);
  params[key] = isNaN(num) ? val : num;
  recomputeAll();
}

function recomputeAll() {
  errors = validateSectionParams(sectionType, params);
  properties = computeSectionProperties(sectionType, params);
  renderCanvas();
}

function renderCanvas() {
  if (!ctx || !canvas || !properties) return;
  drawSection(
    ctx,
    canvas.width,
    canvas.height,
    sectionType,
    params,
    properties,
    { showDimensions: true, showCentroid: true, padding: 45 }
  );
}

function hasErrors(): boolean {
  return Object.keys(errors).length > 0;
}

function saveToLibrary() {
  errors = validateSectionParams(sectionType, params);
  if (hasErrors()) {
    return;
  }
  if (!sectionName.trim()) {
    sectionName = getSectionTypeLabel(sectionType);
  }
  if (editingSection) {
    updateSectionById(editingSection.id, params, sectionName);
  } else {
    const newSec = createSection(sectionName, sectionType, params);
    addSection(newSec);
  }
  dispatch('saved');
  close();
}

function close() {
  visible = false;
  editingSection = null;
  dispatch('close');
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close();
}

onMount(() => {
  if (canvas) {
    ctx = canvas.getContext('2d');
    recomputeAll();
  }
});

afterUpdate(() => {
  if (canvas && !ctx) {
    ctx = canvas.getContext('2d');
  }
  renderCanvas();
});

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible) close();
}
</script>

<svelte:window on:keydown={onKeyDown} />

{#if visible}
<div class="modal-backdrop" on:click={handleBackdropClick} on:mousedown|stopPropagation>
  <div class="modal" on:mousedown|stopPropagation>
    <div class="modal-header">
      <h2>{editingSection ? '✏️ 编辑截面' : '➕ 新建截面'}</h2>
      <button class="close-btn" on:click={close}>×</button>
    </div>

    <div class="modal-body">
      <div class="left-panel">
        <div class="form-group">
          <label class="form-label">截面名称</label>
          <input
            type="text"
            class="form-input"
            placeholder={`默认：${getSectionTypeLabel(sectionType)}`}
            bind:value={sectionName}
          />
        </div>

        <div class="form-group">
          <label class="form-label">截面类型</label>
          <div class="type-grid">
            {#each sectionTypes as t}
              <button
                class={`type-btn ${sectionType === t.key ? 'active' : ''}`}
                on:click={() => switchType(t.key)}
              >
                <span class="type-icon">{t.icon}</span>
                <span class="type-label">{t.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">尺寸参数</label>
          <div class="params-form">
            {#each Object.entries(getParamLabels(sectionType)) as [key, label]}
              <div class="param-row">
                <label class="param-label">{label}</label>
                <div class="param-input-wrap">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    class={`param-input ${errors[key] ? 'error' : ''}`}
                    value={params[key]}
                    on:input={(e) => updateParam(key, e.target.value)}
                  />
                  {#if errors[key]}
                    <div class="error-msg">{errors[key]}</div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="right-panel">
        <div class="preview-header">
          <span class="preview-title">📐 实时预览</span>
          <span class="preview-type">{getSectionTypeLabel(sectionType)}</span>
        </div>
        <div class="canvas-wrap">
          <canvas bind:this={canvas} width={380} height={320}></canvas>
        </div>
        <div class="props-panel">
          <h4>截面属性</h4>
          <div class="props-grid">
            <div class="prop-item">
              <span class="prop-label">面积 A</span>
              <span class="prop-val">{formatArea(properties?.area || 0)}</span>
            </div>
            <div class="prop-item">
              <span class="prop-label">惯性矩 Ix</span>
              <span class="prop-val">{formatInertia(properties?.Ix || 0)}</span>
            </div>
            <div class="prop-item">
              <span class="prop-label">惯性矩 Iy</span>
              <span class="prop-val">{formatInertia(properties?.Iy || 0)}</span>
            </div>
            <div class="prop-item">
              <span class="prop-label">极惯性矩 Ip</span>
              <span class="prop-val">{formatInertia(properties?.Ip || 0)}</span>
            </div>
            <div class="prop-item">
              <span class="prop-label">截面模量 Wx</span>
              <span class="prop-val">{formatModulus(properties?.Wx || 0)}</span>
            </div>
            <div class="prop-item">
              <span class="prop-label">截面模量 Wy</span>
              <span class="prop-val">{formatModulus(properties?.Wy || 0)}</span>
            </div>
            <div class="prop-item">
              <span class="prop-label">质心 (Cx, Cy)</span>
              <span class="prop-val">({(properties?.centroidX || 0).toFixed(1)}, {(properties?.centroidY || 0).toFixed(1)}) mm</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" on:click={close}>取消</button>
      <button class="btn btn-primary" on:click={saveToLibrary} disabled={hasErrors()}>
        {editingSection ? '💾 更新截面' : '💾 保存到库'}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06);
  width: 820px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.modal-header {
  padding: 16px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #f0f7ff 0%, #e8f0fe 100%);
  border-bottom: 1px solid #dbe6f3;
}
.modal-header h2 {
  font-size: 16px;
  font-weight: 700;
  color: #1e3a5f;
  margin: 0;
}
.close-btn {
  width: 32px; height: 32px;
  border: none; background: transparent;
  font-size: 24px; color: #64748b;
  cursor: pointer; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.close-btn:hover { background: rgba(220,38,38,0.1); color: #dc2626; }

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
  display: flex;
  gap: 24px;
}

.left-panel {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
}

.form-input {
  padding: 7px 11px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  font-size: 13px;
  transition: all 0.15s;
  background: #fff;
}
.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}

.type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.15s;
}
.type-btn:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}
.type-btn.active {
  border-color: #2563eb;
  background: #dbeafe;
  box-shadow: 0 2px 6px rgba(37,99,235,0.12);
}
.type-icon { font-size: 22px; line-height: 1; color: #2563eb; }
.type-label { font-size: 11.5px; font-weight: 600; color: #334155; }

.params-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 9px;
  border: 1px solid #e2e8f0;
}

.param-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-label {
  font-size: 11.5px;
  color: #475569;
  font-weight: 500;
}

.param-input-wrap {
  position: relative;
}

.param-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
  transition: all 0.15s;
  background: #fff;
}
.param-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
.param-input.error {
  border-color: #ef4444;
  background: #fef2f2;
}
.param-input.error:focus {
  box-shadow: 0 0 0 3px rgba(239,68,68,0.12);
}

.error-msg {
  font-size: 11px;
  color: #dc2626;
  margin-top: 3px;
  font-weight: 500;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1.5px solid #e2e8f0;
}
.preview-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e3a5f;
}
.preview-type {
  font-size: 11px;
  padding: 3px 10px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 20px;
  font-weight: 600;
}

.canvas-wrap {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.04);
}

.canvas-wrap canvas {
  display: block;
  width: 100%;
  height: auto;
}

.props-panel {
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
}
.props-panel h4 {
  font-size: 12.5px;
  font-weight: 700;
  color: #1e3a5f;
  margin: 0 0 10px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
}

.props-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 14px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.prop-label {
  font-size: 10.5px;
  color: #64748b;
  font-weight: 500;
}
.prop-val {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
  font-family: 'SF Mono', Monaco, monospace;
}

.modal-footer {
  padding: 14px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.btn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: all 0.15s;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
  box-shadow: 0 2px 6px rgba(37,99,235,0.2);
}
.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(37,99,235,0.28);
}
.btn-primary:disabled {
  background: #93c5fd;
  border-color: #93c5fd;
  cursor: not-allowed;
  box-shadow: none;
  opacity: 0.7;
}
.btn-ghost {
  background: #fff;
  color: #475569;
  border-color: #cbd5e1;
}
.btn-ghost:hover {
  background: #f1f5f9;
  color: #1e293b;
  border-color: #94a3b8;
}
</style>

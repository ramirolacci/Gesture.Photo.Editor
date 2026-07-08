/**
 * FilterPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Advanced Photoshop-like filter panel with:
 *   - Tabs: Ajustes | Artísticos | Color | Presets
 *   - Live filter pipeline with toggle/remove/reorder
 *   - Per-filter parameter sliders
 *   - Preset grid with one-click apply
 *   - Apply / Cancel / Clear buttons
 */

import React, { useState, useCallback } from 'react';
import { FilterCategory, FilterId, FilterState } from '../types/filterTypes';
import { FILTER_DEFS } from '../utils/filterEngine';
import { useFilterPanel } from '../hooks/useFilterPanel';

interface FilterPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (pipeline: FilterState[]) => void;
    onPreview: (pipeline: FilterState[]) => void;
    onCancel: () => void;
    /** Distance between two hands [0–1] for gestural intensity control */
    gestureIntensity?: number | null;
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS: { id: FilterCategory | 'presets'; label: string; icon: string }[] = [
    { id: 'adjustment', label: 'Ajustes',   icon: '🎚️' },
    { id: 'artistic',   label: 'Artísticos', icon: '🎨' },
    { id: 'color',      label: 'Color',      icon: '🌈' },
    { id: 'presets',    label: 'Presets',    icon: '⚡' },
];

// ─── Slider sub-component ─────────────────────────────────────────────────────

interface ParamSliderProps {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    formatValue?: (v: number) => string;
}

const ParamSlider: React.FC<ParamSliderProps> = ({ label, min, max, step, value, onChange, formatValue }) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                    {formatValue ? formatValue(value) : value}
                </span>
            </div>
            <div className="relative h-5 flex items-center">
                {/* Track */}
                <div className="w-full h-1.5 rounded-full bg-gray-200 relative overflow-hidden">
                    <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {/* Thumb */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute w-full opacity-0 cursor-pointer h-5"
                    style={{ zIndex: 1 }}
                />
                {/* Visual thumb */}
                <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-indigo-600 border-2 border-white shadow-md pointer-events-none transition-all"
                    style={{ left: `calc(${pct}% - 7px)` }}
                />
            </div>
        </div>
    );
};

// ─── Pipeline item ────────────────────────────────────────────────────────────

interface PipelineItemProps {
    state: FilterState;
    isSelected: boolean;
    onSelect: () => void;
    onToggle: () => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

const PipelineItem: React.FC<PipelineItemProps> = ({
    state, isSelected, onSelect, onToggle, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown
}) => {
    const def = FILTER_DEFS.find(d => d.id === state.filterId);
    return (
        <div
            className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all cursor-pointer group ${
                isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
            }`}
            onClick={onSelect}
        >
            <span className="text-base shrink-0">{def?.icon ?? '🔧'}</span>
            <span className={`text-[11px] font-semibold flex-1 min-w-0 truncate ${state.enabled ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                {def?.label ?? state.filterId}
            </span>

            {/* Controls */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={e => { e.stopPropagation(); onMoveUp(); }}
                    disabled={!canMoveUp}
                    className="w-5 h-5 flex items-center justify-center text-[9px] rounded hover:bg-gray-200 disabled:opacity-20 text-gray-500"
                    title="Mover arriba"
                >▲</button>
                <button
                    onClick={e => { e.stopPropagation(); onMoveDown(); }}
                    disabled={!canMoveDown}
                    className="w-5 h-5 flex items-center justify-center text-[9px] rounded hover:bg-gray-200 disabled:opacity-20 text-gray-500"
                    title="Mover abajo"
                >▼</button>
            </div>

            {/* Toggle */}
            <button
                onClick={e => { e.stopPropagation(); onToggle(); }}
                className={`w-6 h-3.5 rounded-full transition-all shrink-0 ${state.enabled ? 'bg-indigo-500' : 'bg-gray-300'}`}
                title={state.enabled ? 'Desactivar' : 'Activar'}
            >
                <div className={`w-2.5 h-2.5 rounded-full bg-white shadow transition-transform mx-0.5 ${state.enabled ? 'translate-x-2.5' : 'translate-x-0'}`} />
            </button>

            {/* Remove */}
            <button
                onClick={e => { e.stopPropagation(); onRemove(); }}
                className="w-5 h-5 flex items-center justify-center text-[10px] rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                title="Eliminar filtro"
            >✕</button>
        </div>
    );
};

// ─── Main FilterPanel component ───────────────────────────────────────────────

export const FilterPanel: React.FC<FilterPanelProps> = ({
    isOpen, onClose, onApply, onPreview, onCancel, gestureIntensity
}) => {
    const [activeTab, setActiveTab] = useState<FilterCategory | 'presets'>('adjustment');

    const handlePipelineChange = useCallback((pipeline: FilterState[]) => {
        onPreview(pipeline);
    }, [onPreview]);

    const {
        pipeline,
        selectedInstanceId,
        selectedFilter,
        isDirty,
        presets,
        addFilter,
        removeFilter,
        toggleFilter,
        updateFilterParam,
        selectFilter,
        moveFilter,
        applyPreset,
        clearPipeline,
        commitPipeline,
        cancelPipeline,
    } = useFilterPanel(handlePipelineChange);

    const handleApply = () => {
        commitPipeline();
        onApply(pipeline);
    };

    const handleCancel = () => {
        cancelPipeline();
        onCancel();
    };

    const selectedDef = selectedFilter
        ? FILTER_DEFS.find(d => d.id === selectedFilter.filterId)
        : null;

    const filteredDefs = FILTER_DEFS.filter(d => d.category === activeTab);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
            {/* Backdrop (click to close) */}
            <div
                className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className="relative h-full w-80 bg-white shadow-2xl border-l border-gray-200 flex flex-col pointer-events-auto overflow-hidden"
                style={{ animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* ── Header ─────────────────────────────────────── */}
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">✨</span>
                        <div>
                            <h2 className="text-white text-sm font-bold leading-tight">Filtros Avanzados</h2>
                            <p className="text-indigo-200 text-[10px]">
                                {pipeline.length} filtro{pipeline.length !== 1 ? 's' : ''} activo{pipeline.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-sm transition-all"
                    >✕</button>
                </div>

                {/* ── Gesture indicator ──────────────────────────── */}
                {gestureIntensity !== null && gestureIntensity !== undefined && (
                    <div className="shrink-0 px-3 pt-2">
                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                            <span className="text-sm">🙌</span>
                            <div className="flex-1">
                                <div className="text-[10px] text-indigo-700 font-semibold mb-1">Control gestual</div>
                                <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 rounded-full transition-all"
                                        style={{ width: `${(gestureIntensity ?? 0) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-[10px] font-mono text-indigo-600">
                                {Math.round((gestureIntensity ?? 0) * 100)}%
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Tabs ───────────────────────────────────────── */}
                <div className="flex border-b border-gray-200 shrink-0 px-1 pt-1">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as FilterCategory | 'presets')}
                            className={`flex-1 py-2 px-1 text-[10px] font-semibold transition-all border-b-2 flex flex-col items-center gap-0.5 ${
                                activeTab === tab.id
                                    ? 'border-indigo-600 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <span className="text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Scrollable content ─────────────────────────── */}
                <div className="flex-1 overflow-y-auto min-h-0">

                    {/* ─ Filter catalogue (for non-preset tabs) ─── */}
                    {activeTab !== 'presets' && (
                        <div className="p-3">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
                                Agregar filtro
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {filteredDefs.map(def => (
                                    <button
                                        key={def.id}
                                        onClick={() => addFilter(def.id as FilterId)}
                                        className="flex items-center gap-1.5 p-2 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg text-left transition-all group"
                                        title={def.description}
                                    >
                                        <span className="text-base shrink-0">{def.icon}</span>
                                        <span className="text-[11px] font-semibold text-gray-700 group-hover:text-indigo-700 truncate">
                                            {def.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─ Presets grid ──────────────────────────────── */}
                    {activeTab === 'presets' && (
                        <div className="p-3">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
                                Presets
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {presets.map(preset => (
                                    <button
                                        key={preset.id}
                                        onClick={() => applyPreset(preset)}
                                        className="flex flex-col items-center gap-1.5 p-3 bg-gradient-to-br from-gray-50 to-indigo-50/30 hover:from-indigo-50 hover:to-violet-50 border border-gray-200 hover:border-indigo-300 rounded-xl transition-all group shadow-sm hover:shadow-md"
                                    >
                                        <span className="text-2xl">{preset.icon}</span>
                                        <span className="text-[11px] font-bold text-gray-700 group-hover:text-indigo-700">
                                            {preset.name}
                                        </span>
                                        <span className="text-[9px] text-gray-400">
                                            {preset.pipeline.length} filtros
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─ Active pipeline ───────────────────────────── */}
                    {pipeline.length > 0 && (
                        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                                    Pipeline activo
                                </p>
                                <button
                                    onClick={clearPipeline}
                                    className="text-[10px] text-red-500 hover:text-red-700 font-semibold transition-colors"
                                >
                                    🗑️ Limpiar
                                </button>
                            </div>
                            <div className="flex flex-col gap-1">
                                {pipeline.map((state, idx) => (
                                    <PipelineItem
                                        key={state.instanceId}
                                        state={state}
                                        isSelected={selectedInstanceId === state.instanceId}
                                        onSelect={() => selectFilter(state.instanceId)}
                                        onToggle={() => toggleFilter(state.instanceId)}
                                        onRemove={() => removeFilter(state.instanceId)}
                                        onMoveUp={() => moveFilter(state.instanceId, 'up')}
                                        onMoveDown={() => moveFilter(state.instanceId, 'down')}
                                        canMoveUp={idx > 0}
                                        canMoveDown={idx < pipeline.length - 1}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─ Parameter editor ──────────────────────────── */}
                    {selectedFilter && selectedDef && (
                        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-lg">{selectedDef.icon}</span>
                                <div>
                                    <p className="text-xs font-bold text-gray-800">{selectedDef.label}</p>
                                    <p className="text-[10px] text-gray-500">{selectedDef.description}</p>
                                </div>
                            </div>

                            {selectedDef.params.length === 0 && (
                                <p className="text-[11px] text-gray-400 italic text-center py-2">
                                    Sin parámetros ajustables
                                </p>
                            )}

                            <div className="flex flex-col gap-3">
                                {selectedDef.params.map(paramDef => {
                                    const currentVal = selectedFilter.params[paramDef.key] ?? paramDef.defaultValue;

                                    if (paramDef.type === 'range') {
                                        return (
                                            <ParamSlider
                                                key={paramDef.key}
                                                label={paramDef.label}
                                                min={paramDef.min ?? 0}
                                                max={paramDef.max ?? 100}
                                                step={paramDef.step ?? 1}
                                                value={Number(currentVal)}
                                                onChange={v => updateFilterParam(selectedFilter.instanceId, paramDef.key, v)}
                                                formatValue={v => {
                                                    if (paramDef.max === 2.2) return v.toFixed(2);
                                                    if (paramDef.max === 9.9) return v.toFixed(1);
                                                    return String(Math.round(v));
                                                }}
                                            />
                                        );
                                    }

                                    if (paramDef.type === 'select') {
                                        return (
                                            <div key={paramDef.key} className="flex flex-col gap-1">
                                                <span className="text-[11px] font-semibold text-gray-600">{paramDef.label}</span>
                                                <div className="grid grid-cols-2 gap-1">
                                                    {paramDef.options?.map(opt => (
                                                        <button
                                                            key={String(opt.value)}
                                                            onClick={() => updateFilterParam(selectedFilter.instanceId, paramDef.key, opt.value)}
                                                            className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border transition-all ${
                                                                currentVal === opt.value
                                                                    ? 'bg-indigo-600 border-indigo-700 text-white'
                                                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }

                                    return null;
                                })}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {pipeline.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
                            <span className="text-4xl">✨</span>
                            <p className="text-sm font-semibold text-gray-600">Sin filtros activos</p>
                            <p className="text-[11px] text-gray-400">
                                Hacé clic en cualquier filtro del catálogo para agregarlo al pipeline, o elegí un preset para aplicar varios a la vez.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Footer buttons ─────────────────────────────── */}
                <div className="shrink-0 border-t border-gray-200 p-3 bg-gray-50 flex gap-2">
                    <button
                        onClick={handleCancel}
                        className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-all"
                    >
                        ✖️ Cancelar
                    </button>
                    <button
                        onClick={handleApply}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                            isDirty
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-md hover:shadow-lg'
                                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                        disabled={!isDirty}
                    >
                        ✅ Aplicar
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
};

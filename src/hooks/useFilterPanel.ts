/**
 * useFilterPanel.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the filter pipeline state for the FilterPanel UI.
 * Holds the list of active FilterState[], selected filter for editing,
 * and exposes actions to add/remove/update/reorder filters and apply presets.
 */

import { useCallback, useRef, useState } from 'react';
import { FilterId, FilterPreset, FilterState } from '../types/filterTypes';
import { createFilterState, FILTER_PRESETS } from '../utils/filterEngine';

export interface UseFilterPanelReturn {
    // Pipeline state
    pipeline: FilterState[];
    selectedInstanceId: string | null;
    selectedFilter: FilterState | null;
    isDirty: boolean;

    // Presets
    presets: FilterPreset[];

    // Actions
    addFilter: (filterId: FilterId) => void;
    removeFilter: (instanceId: string) => void;
    toggleFilter: (instanceId: string) => void;
    updateFilterParam: (instanceId: string, key: string, value: number | string) => void;
    selectFilter: (instanceId: string | null) => void;
    moveFilter: (instanceId: string, direction: 'up' | 'down') => void;
    applyPreset: (preset: FilterPreset) => void;
    clearPipeline: () => void;

    // Commit control
    commitPipeline: () => void;    // Saves the "before" snapshot for cancel
    cancelPipeline: () => void;    // Restores the last committed state
}

export function useFilterPanel(
    onPipelineChange: (pipeline: FilterState[]) => void
): UseFilterPanelReturn {
    const [pipeline, setPipeline] = useState<FilterState[]>([]);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

    // Keep a "committed" snapshot for cancel functionality
    const committedRef = useRef<FilterState[]>([]);
    const [isDirty, setIsDirty] = useState(false);

    const notify = useCallback(
        (newPipeline: FilterState[]) => {
            onPipelineChange(newPipeline);
        },
        [onPipelineChange]
    );

    const addFilter = useCallback((filterId: FilterId) => {
        const state = createFilterState(filterId);
        setPipeline(prev => {
            const next = [...prev, state];
            notify(next);
            setIsDirty(true);
            return next;
        });
        setSelectedInstanceId(state.instanceId);
    }, [notify]);

    const removeFilter = useCallback((instanceId: string) => {
        setPipeline(prev => {
            const next = prev.filter(f => f.instanceId !== instanceId);
            notify(next);
            setIsDirty(true);
            return next;
        });
        setSelectedInstanceId(prev => (prev === instanceId ? null : prev));
    }, [notify]);

    const toggleFilter = useCallback((instanceId: string) => {
        setPipeline(prev => {
            const next = prev.map(f =>
                f.instanceId === instanceId ? { ...f, enabled: !f.enabled } : f
            );
            notify(next);
            setIsDirty(true);
            return next;
        });
    }, [notify]);

    const updateFilterParam = useCallback((instanceId: string, key: string, value: number | string) => {
        setPipeline(prev => {
            const next = prev.map(f =>
                f.instanceId === instanceId
                    ? { ...f, params: { ...f.params, [key]: value } }
                    : f
            );
            notify(next);
            setIsDirty(true);
            return next;
        });
    }, [notify]);

    const selectFilter = useCallback((instanceId: string | null) => {
        setSelectedInstanceId(instanceId);
    }, []);

    const moveFilter = useCallback((instanceId: string, direction: 'up' | 'down') => {
        setPipeline(prev => {
            const idx = prev.findIndex(f => f.instanceId === instanceId);
            if (idx < 0) return prev;
            const newIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (newIdx < 0 || newIdx >= prev.length) return prev;

            const next = [...prev];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            notify(next);
            setIsDirty(true);
            return next;
        });
    }, [notify]);

    const applyPreset = useCallback((preset: FilterPreset) => {
        const newPipeline = preset.pipeline.map(entry => {
            const state = createFilterState(entry.filterId);
            return { ...state, params: { ...state.params, ...entry.params } };
        });
        setPipeline(newPipeline);
        notify(newPipeline);
        setSelectedInstanceId(null);
        setIsDirty(true);
    }, [notify]);

    const clearPipeline = useCallback(() => {
        setPipeline([]);
        notify([]);
        setSelectedInstanceId(null);
        setIsDirty(true);
    }, [notify]);

    const commitPipeline = useCallback(() => {
        setPipeline(prev => {
            committedRef.current = prev.map(f => ({ ...f, params: { ...f.params } }));
            return prev;
        });
        setIsDirty(false);
    }, []);

    const cancelPipeline = useCallback(() => {
        const restored = committedRef.current;
        setPipeline(restored);
        notify(restored);
        setSelectedInstanceId(null);
        setIsDirty(false);
    }, [notify]);

    const selectedFilter = pipeline.find(f => f.instanceId === selectedInstanceId) ?? null;

    return {
        pipeline,
        selectedInstanceId,
        selectedFilter,
        isDirty,
        presets: FILTER_PRESETS,
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
    };
}

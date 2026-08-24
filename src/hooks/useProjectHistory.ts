import { useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';

export interface HistoryEntry {
    id: string;
    description: string;
    timestamp: number;
    snapshot: string;
}

const MAX_HISTORY = 30;

export function useProjectHistory(
    fabricCanvasRef: React.RefObject<fabric.Canvas | null>,
    onRestored?: () => void
) {
    const stackRef = useRef<HistoryEntry[]>([]);
    const indexRef = useRef<number>(-1);
    const headSnapshotRef = useRef<string | null>(null);

    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const syncState = useCallback(() => {
        const stack = stackRef.current;
        const idx = indexRef.current;
        const slice = stack.slice(0, idx + 1).slice(-5).reverse();
        setHistoryEntries(slice);
        setCanUndo(idx >= 0);
        setCanRedo(idx < stack.length - 1);
    }, []);

    const captureCanvas = (canvas: fabric.Canvas): string => {
        return JSON.stringify(canvas.toJSON(['id', 'name', 'layerType']));
    };

    const restoreCanvas = (canvas: fabric.Canvas, jsonStr: string): Promise<void> => {
        return new Promise((resolve) => {
            canvas.loadFromJSON(jsonStr, () => {
                canvas.requestRenderAll();
                resolve();
            });
        });
    };

    const pushSnapshot = useCallback((description: string) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const snapshot = captureCanvas(canvas);
        const entry: HistoryEntry = {
            id: Math.random().toString(36).slice(2),
            description,
            timestamp: Date.now(),
            snapshot,
        };

        const newStack = stackRef.current.slice(0, indexRef.current + 1);
        newStack.push(entry);

        if (newStack.length > MAX_HISTORY) {
            newStack.splice(0, newStack.length - MAX_HISTORY);
        }

        stackRef.current = newStack;
        indexRef.current = newStack.length - 1;
        syncState();
    }, [fabricCanvasRef, syncState]);

    const commitHead = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        headSnapshotRef.current = captureCanvas(canvas);
    }, [fabricCanvasRef]);

    const undo = useCallback(async () => {
        const canvas = fabricCanvasRef.current;
        const idx = indexRef.current;
        if (!canvas || idx < 0) return;

        const entry = stackRef.current[idx];
        await restoreCanvas(canvas, entry.snapshot);
        indexRef.current = idx - 1;
        syncState();
        if (onRestored) onRestored();
    }, [fabricCanvasRef, syncState, onRestored]);

    const redo = useCallback(async () => {
        const canvas = fabricCanvasRef.current;
        const idx = indexRef.current;
        const stack = stackRef.current;
        if (!canvas || idx >= stack.length - 1) return;

        const headSnapshot = headSnapshotRef.current;
        let targetSnapshot: string;

        if (idx + 2 <= stack.length - 1) {
            targetSnapshot = stack[idx + 2].snapshot;
        } else {
            targetSnapshot = headSnapshot ?? stack[stack.length - 1].snapshot;
        }

        await restoreCanvas(canvas, targetSnapshot);
        indexRef.current = idx + 1;
        syncState();
        if (onRestored) onRestored();
    }, [fabricCanvasRef, syncState, onRestored]);

    const clearHistory = useCallback(() => {
        stackRef.current = [];
        indexRef.current = -1;
        headSnapshotRef.current = null;
        syncState();
    }, [syncState]);

    return {
        pushSnapshot,
        commitHead,
        undo,
        redo,
        clearHistory,
        canUndo,
        canRedo,
        historyEntries,
    };
}

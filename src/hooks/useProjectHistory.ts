import { useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { captureSnapshot, restoreSnapshot } from '../utils/projectSerializer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
    id: string;
    description: string;
    timestamp: number;
    snapshot: string; // JSON serialization of the canvas BEFORE this operation
}

const MAX_HISTORY = 50;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectHistory(
    fabricCanvasRef: React.RefObject<fabric.Canvas | null>,
    onRestored?: (activeLayerId: string | null) => void
) {
    // Stack of entries, index points to the CURRENT state (last undone slot)
    const stackRef = useRef<HistoryEntry[]>([]);
    const indexRef = useRef<number>(-1); // -1 = nothing pushed yet

    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const syncState = useCallback(() => {
        const stack = stackRef.current;
        const idx = indexRef.current;
        // Show last 5 entries up to current index (most recent first)
        const slice = stack.slice(0, idx + 1).slice(-5).reverse();
        setHistoryEntries(slice);
        setCanUndo(idx >= 0);
        setCanRedo(idx < stack.length - 1);
    }, []);

    /**
     * Call this BEFORE a destructive operation to save the current canvas state.
     * @param description Human-readable label shown in the history panel.
     */
    const pushSnapshot = useCallback((description: string) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const snapshot = captureSnapshot(canvas);
        const entry: HistoryEntry = {
            id: Math.random().toString(36).slice(2),
            description,
            timestamp: Date.now(),
            snapshot,
        };

        // Truncate redo branch
        const newStack = stackRef.current.slice(0, indexRef.current + 1);
        newStack.push(entry);

        // Enforce max limit
        if (newStack.length > MAX_HISTORY) {
            newStack.splice(0, newStack.length - MAX_HISTORY);
        }

        stackRef.current = newStack;
        indexRef.current = newStack.length - 1;
        syncState();
    }, [fabricCanvasRef, syncState]);

    const undo = useCallback(async () => {
        const canvas = fabricCanvasRef.current;
        const idx = indexRef.current;
        if (!canvas || idx < 0) return;

        // The snapshot at indexRef is the state BEFORE the current operation → restore it
        const entry = stackRef.current[idx];
        const activeId = await restoreSnapshot(entry.snapshot, canvas);
        indexRef.current = idx - 1;
        syncState();
        if (onRestored) onRestored(activeId);
    }, [fabricCanvasRef, syncState, onRestored]);

    const redo = useCallback(async () => {
        const canvas = fabricCanvasRef.current;
        const idx = indexRef.current;
        const stack = stackRef.current;
        if (!canvas || idx >= stack.length - 1) return;

        // We need the snapshot of the NEXT entry... but we need the state AFTER the operation.
        // Strategy: each entry stores the state before it. So to redo entry[idx+1], we need
        // the snapshot of entry[idx+2] (state before the operation after that), OR if there
        // isn't one, we stored a "current" snapshot when we pushed.

        // Simpler: push a "post-state" snapshot at the end of the stack when an operation is done.
        // Because we're using "before" snapshots, redo must replay the operation by going to
        // entry[idx+1] and using its snapshot... but that's the state BEFORE idx+1.

        // Revised: store "after" snapshot as a parallel array, OR just store snapshots at each
        // committed state. Let's keep a parallel "committed" snapshot at the time of push.
        // Actually: since we always push BEFORE the operation, the snapshot stored in entry[n]
        // represents the state BEFORE operation n. To redo operation n, we need the state AFTER n,
        // which is the state BEFORE operation n+1. If n+1 doesn't exist, it means n was the last
        // operation and we need a "head" snapshot.
        // So we maintain a separate "head" snapshot ref.

        const headSnapshot = headSnapshotRef.current;
        let targetSnapshot: string;

        if (idx + 2 <= stack.length - 1) {
            // Restore to the state just before operation idx+2 (= state after idx+1)
            targetSnapshot = stack[idx + 2].snapshot;
        } else {
            // The next entry IS the last one – restore to the saved head state
            targetSnapshot = headSnapshot ?? stack[stack.length - 1].snapshot;
        }

        const activeId = await restoreSnapshot(targetSnapshot, canvas);
        indexRef.current = idx + 1;
        syncState();
        if (onRestored) onRestored(activeId);
    }, [fabricCanvasRef, syncState, onRestored]);

    // ─── Head snapshot ──────────────────────────────────────────────────────
    // We keep a "head" snapshot: the canvas state AFTER the very last committed operation.
    // Updated after every pushSnapshot (by calling captureHeadAfterOperation).
    const headSnapshotRef = useRef<string | null>(null);

    /**
     * Call this AFTER the operation that was preceded by pushSnapshot to record the
     * resulting (post-operation) state so that redo can restore it accurately.
     */
    const commitHead = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        headSnapshotRef.current = captureSnapshot(canvas);
    }, [fabricCanvasRef]);

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

import { useCallback, useEffect, useRef, useState } from 'react';
import { HandLandmarks, RecognizedGesture } from '../types/hand';

interface GalleryEntry {
    id: string;
    name: string;
    savedAt: string;
    data: string;
}

interface UseAutoSaveOptions {
    hands: HandLandmarks[];
    gestures: RecognizedGesture[];
    getProjectData: () => string | null;
    restoreProject: (json: string) => Promise<void> | void;
    onToast?: (message: string, type: 'success' | 'info' | 'warning') => void;
    onExport?: () => Promise<void> | void;
    onShare?: () => Promise<void> | void;
}

const AUTOSAVE_KEY = 'gesture_editor_autosave';
const GALLERY_KEY = 'gesture_editor_gallery';
const AUTO_SAVE_MS = 5 * 60 * 1000;

export function useAutoSave({
    hands,
    gestures,
    getProjectData,
    restoreProject,
    onToast,
    onExport,
    onShare,
}: UseAutoSaveOptions) {
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryProjects, setGalleryProjects] = useState<GalleryEntry[]>([]);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    const thumbsHoldStartRef = useRef<number | null>(null);
    const signaturePointsRef = useRef<Array<{ x: number; y: number }>>([]);
    const signatureStartRef = useRef<number | null>(null);
    const crossGestureRef = useRef(false);
    const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

    const notify = useCallback((message: string, type: 'success' | 'info' | 'warning' = 'info') => {
        onToast?.(message, type);
    }, [onToast]);

    const saveNow = useCallback(async () => {
        const projectData = getProjectData();
        if (!projectData) return;

        try {
            const parsed = JSON.parse(projectData) as { name?: string };
            const entry: GalleryEntry = {
                id: Math.random().toString(36).slice(2),
                name: parsed.name || 'Proyecto',
                savedAt: new Date().toISOString(),
                data: projectData,
            };

            const existing = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]') as GalleryEntry[];
            const merged = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(0, 5);
            localStorage.setItem(GALLERY_KEY, JSON.stringify(merged));
            localStorage.setItem(AUTOSAVE_KEY, projectData);
            setGalleryProjects(merged);
            setLastSavedAt(entry.savedAt);
            notify(`💾 ${entry.name} guardado`, 'success');
        } catch (error) {
            console.error('Auto-save failed', error);
            notify('⚠️ No se pudo guardar', 'warning');
        }
    }, [getProjectData, notify]);

    const restoreLatest = useCallback(async () => {
        try {
            const latest = localStorage.getItem(AUTOSAVE_KEY);
            if (!latest) {
                notify('No hay proyecto guardado', 'info');
                return;
            }
            await restoreProject(latest);
            notify('⏮ Proyecto restaurado', 'success');
        } catch (error) {
            console.error('Restore failed', error);
            notify('⚠️ No se pudo restaurar', 'warning');
        }
    }, [notify, restoreProject]);

    const openGallery = useCallback(() => {
        const existing = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]') as GalleryEntry[];
        setGalleryProjects(existing);
        setGalleryVisible(true);
    }, []);

    const closeGallery = useCallback(() => setGalleryVisible(false), []);

    const shareCurrent = useCallback(async () => {
        const projectData = getProjectData();
        if (!projectData) return;
        const base64 = btoa(unescape(encodeURIComponent(projectData)));
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Proyecto gesture editor',
                    text: 'Proyecto compartido desde Gesture Photo Editor',
                });
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(base64);
                notify('📋 Base64 copiado al portapapeles', 'success');
            }
            await onShare?.();
        } catch (error) {
            console.error('Share failed', error);
            notify('⚠️ No se pudo compartir', 'warning');
        }
    }, [getProjectData, notify, onShare]);

    useEffect(() => {
        const existing = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]') as GalleryEntry[];
        setGalleryProjects(existing);
        const latest = localStorage.getItem(AUTOSAVE_KEY);
        if (latest) setLastSavedAt(JSON.parse(latest).savedAt ?? null);
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            void saveNow();
        }, AUTO_SAVE_MS);
        return () => window.clearInterval(timer);
    }, [saveNow]);

    useEffect(() => {
        if (!hands.length) {
            thumbsHoldStartRef.current = null;
            signaturePointsRef.current = [];
            signatureStartRef.current = null;
            crossGestureRef.current = false;
            swipeStartRef.current = null;
            return;
        }

        const rightHand = hands.find((hand) => hand.handedness === 'right') ?? hands[0];
        const leftHand = hands.find((hand) => hand.handedness === 'left');
        const rightGesture = gestures.find((gesture) => gesture.hand === 'right')?.type ?? 'NONE';
        const leftGesture = gestures.find((gesture) => gesture.hand === 'left')?.type ?? 'NONE';
        const rightIndex = rightHand.landmarks[8];
        const leftIndex = leftHand?.landmarks[8];

        if (!rightIndex) return;

        if (rightGesture === 'THUMBS_UP') {
            if (thumbsHoldStartRef.current === null) {
                thumbsHoldStartRef.current = Date.now();
            } else if (Date.now() - thumbsHoldStartRef.current > 3000) {
                void onExport?.();
                notify('⬇️ Exportando PNG', 'success');
                thumbsHoldStartRef.current = null;
            }
        } else {
            thumbsHoldStartRef.current = null;
        }

        if (rightGesture === 'POINT' || rightGesture === 'PINCH') {
            const point = { x: rightIndex.x, y: rightIndex.y };
            if (signatureStartRef.current === null) {
                signatureStartRef.current = Date.now();
                signaturePointsRef.current = [point];
            } else {
                signaturePointsRef.current.push(point);
                const distance = signaturePointsRef.current.reduce((acc, p, idx) => {
                    if (idx === 0) return acc;
                    const prev = signaturePointsRef.current[idx - 1];
                    return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
                }, 0);
                if (distance > 0.4 && Date.now() - signatureStartRef.current > 700) {
                    void onExport?.();
                    notify('✍️ Exportando con nombre', 'success');
                    signaturePointsRef.current = [];
                    signatureStartRef.current = null;
                }
            }
        } else {
            signaturePointsRef.current = [];
            signatureStartRef.current = null;
        }

        if (leftHand && rightIndex && leftIndex) {
            const cross = Math.abs(leftIndex.x - rightIndex.x) < 0.16 && Math.abs(leftIndex.y - rightIndex.y) < 0.16 && leftGesture === 'PINCH' && rightGesture === 'PINCH';
            if (cross && !crossGestureRef.current) {
                void saveNow();
                crossGestureRef.current = true;
            } else if (!cross) {
                crossGestureRef.current = false;
            }
        }

        if (leftGesture === 'PINCH' && rightGesture === 'PINCH' && leftIndex && rightIndex && Math.abs(leftIndex.x - rightIndex.x) < 0.2) {
            void shareCurrent();
        }

        if (rightIndex.y > 0.88 && !swipeStartRef.current) {
            swipeStartRef.current = { x: rightIndex.x, y: rightIndex.y };
        } else if (swipeStartRef.current && rightIndex.y < swipeStartRef.current.y - 0.18) {
            openGallery();
            swipeStartRef.current = null;
        }
    }, [hands, gestures, notify, onExport, openGallery, saveNow, shareCurrent]);

    return {
        galleryVisible,
        galleryProjects,
        lastSavedAt,
        openGallery,
        closeGallery,
        saveNow,
        restoreLatest,
        shareCurrent,
    };
}

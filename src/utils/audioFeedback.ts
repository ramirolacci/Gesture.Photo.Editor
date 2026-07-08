let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

/**
 * Reproduce un pitido con frecuencia y duración dadas.
 */
export function playBeep(frequency: number, durationMs: number, volume = 0.05, type: OscillatorType = 'sine') {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.value = frequency;

        const now = ctx.currentTime;
        // Envolvente de volumen suave para evitar chasquidos (clicks)
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(now + durationMs / 1000);
    } catch (e) {
        console.warn('Error al reproducir audio de feedback:', e);
    }
}

/**
 * Sonido corto al seleccionar una herramienta.
 */
export function playSelectSound() {
    playBeep(440, 80, 0.04); // La4 (440Hz)
}

/**
 * Sonido arpegiado ascendente para acciones exitosas (guardar, fusionar).
 */
export function playSuccessSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const playNote = (freq: number, startDelay: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, now + startDelay);
            gain.gain.linearRampToValueAtTime(0.05, now + startDelay + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + startDelay + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + startDelay);
            osc.stop(now + startDelay + dur);
        };

        playNote(523.25, 0, 0.12); // Do5 (523Hz)
        playNote(783.99, 0.08, 0.18); // Sol5 (784Hz)
    } catch (e) {
        console.warn('Error al reproducir arpegio de éxito:', e);
    }
}

/**
 * Sonido para toggle de visibilidad (agudo para activo, grave para inactivo).
 */
export function playToggleSound(active: boolean) {
    if (active) {
        playBeep(659.25, 120, 0.04); // Mi5
    } else {
        playBeep(329.63, 150, 0.04); // Mi4
    }
}

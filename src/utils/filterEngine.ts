/**
 * filterEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compiles a FilterState[] pipeline into fabric.Image.filters instances and
 * applies them to a fabric.Image object using WebGL (or Canvas 2D fallback).
 *
 * Non-destructive: filters are re-applied on top of the original image source
 * every time the pipeline changes.
 */

import { fabric } from 'fabric';
import { FilterDef, FilterId, FilterPreset, FilterState } from '../types/filterTypes';

// ─── Filter definitions (catalogue) ─────────────────────────────────────────

export const FILTER_DEFS: FilterDef[] = [
    // ── Adjustment ─────────────────────────────────────────────────────────
    {
        id: 'brightness',
        label: 'Brillo',
        icon: '🔆',
        category: 'adjustment',
        description: 'Ajusta el brillo general de la imagen',
        params: [{ key: 'value', label: 'Brillo', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 }],
    },
    {
        id: 'contrast',
        label: 'Contraste',
        icon: '◑',
        category: 'adjustment',
        description: 'Ajusta la diferencia entre claros y oscuros',
        params: [{ key: 'value', label: 'Contraste', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 }],
    },
    {
        id: 'saturation',
        label: 'Saturación',
        icon: '🎨',
        category: 'adjustment',
        description: 'Controla la intensidad de los colores',
        params: [{ key: 'value', label: 'Saturación', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 }],
    },
    {
        id: 'temperature',
        label: 'Temperatura',
        icon: '🌡️',
        category: 'adjustment',
        description: 'Tono cálido (amarillo) o frío (azul)',
        params: [{ key: 'value', label: 'Temperatura', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 }],
    },
    {
        id: 'tint',
        label: 'Tinte',
        icon: '💚',
        category: 'adjustment',
        description: 'Vira hacia verde o magenta',
        params: [{ key: 'value', label: 'Tinte', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 }],
    },

    // ── Artistic ────────────────────────────────────────────────────────────
    {
        id: 'sepia',
        label: 'Sepia',
        icon: '🟫',
        category: 'artistic',
        description: 'Tono vintage marrón rojizo',
        params: [],
    },
    {
        id: 'grayscale',
        label: 'Blanco y Negro',
        icon: '🌫️',
        category: 'artistic',
        description: 'Convierte a escala de grises (luminancia perceptual)',
        params: [],
    },
    {
        id: 'invert',
        label: 'Invertir',
        icon: '🔄',
        category: 'artistic',
        description: 'Negativo fotográfico',
        params: [],
    },
    {
        id: 'posterize',
        label: 'Posterizar',
        icon: '🎭',
        category: 'artistic',
        description: 'Reduce el número de niveles de color',
        params: [{ key: 'levels', label: 'Niveles', type: 'range', min: 2, max: 8, step: 1, defaultValue: 4 }],
    },
    {
        id: 'pixelate',
        label: 'Pixelar',
        icon: '🟦',
        category: 'artistic',
        description: 'Efecto de pixel art',
        params: [{ key: 'blocksize', label: 'Tamaño de bloque', type: 'range', min: 2, max: 30, step: 1, defaultValue: 8 }],
    },
    {
        id: 'blur',
        label: 'Blur Gaussiano',
        icon: '💭',
        category: 'artistic',
        description: 'Desenfoque suave gaussiano',
        params: [{ key: 'value', label: 'Radio', type: 'range', min: 0, max: 100, step: 1, defaultValue: 10 }],
    },
    {
        id: 'sharpen',
        label: 'Enfocar',
        icon: '🔬',
        category: 'artistic',
        description: 'Aumenta la nitidez de los bordes',
        params: [{ key: 'value', label: 'Intensidad', type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 }],
    },

    // ── Color ───────────────────────────────────────────────────────────────
    {
        id: 'curves',
        label: 'Curvas RGB',
        icon: '📈',
        category: 'color',
        description: 'Gamma independiente por canal R, G, B',
        params: [
            { key: 'r', label: 'Rojo',  type: 'range', min: 0.2, max: 2.2, step: 0.05, defaultValue: 1 },
            { key: 'g', label: 'Verde', type: 'range', min: 0.2, max: 2.2, step: 0.05, defaultValue: 1 },
            { key: 'b', label: 'Azul',  type: 'range', min: 0.2, max: 2.2, step: 0.05, defaultValue: 1 },
        ],
    },
    {
        id: 'levels',
        label: 'Niveles',
        icon: '📊',
        category: 'color',
        description: 'Punto negro, gris medio y punto blanco',
        params: [
            { key: 'black',  label: 'Punto negro',  type: 'range', min: 0,   max: 200, step: 1, defaultValue: 0 },
            { key: 'mid',    label: 'Punto medio',  type: 'range', min: 0.1, max: 9.9, step: 0.1, defaultValue: 1 },
            { key: 'white',  label: 'Punto blanco', type: 'range', min: 55,  max: 255, step: 1, defaultValue: 255 },
        ],
    },
    {
        id: 'colorBalance',
        label: 'Balance de Color',
        icon: '🎛️',
        category: 'color',
        description: 'Desplaza el balance entre canales RGB',
        params: [
            { key: 'r', label: 'Rojo (+) / Cian (-)',     type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 },
            { key: 'g', label: 'Verde (+) / Magenta (-)', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 },
            { key: 'b', label: 'Azul (+) / Amarillo (-)',  type: 'range', min: -100, max: 100, step: 1, defaultValue: 0 },
        ],
    },
    {
        id: 'gradientMap',
        label: 'Mapa de Degradado',
        icon: '🌈',
        category: 'color',
        description: 'Mapea la luminancia a un degradado de dos colores',
        params: [
            { key: 'preset', label: 'Estilo', type: 'select', defaultValue: 'sunset',
              options: [
                { label: 'Atardecer',   value: 'sunset'   },
                { label: 'Océano',      value: 'ocean'    },
                { label: 'Bosque',      value: 'forest'   },
                { label: 'Fuego',       value: 'fire'     },
                { label: 'Noche',       value: 'night'    },
              ]
            },
        ],
    },
];

// ─── Presets ─────────────────────────────────────────────────────────────────

export const FILTER_PRESETS: FilterPreset[] = [
    {
        id: 'vintage',
        name: 'Vintage',
        icon: '📷',
        pipeline: [
            { filterId: 'sepia',      params: {} },
            { filterId: 'contrast',   params: { value: 15 } },
            { filterId: 'brightness', params: { value: -10 } },
        ],
    },
    {
        id: 'cold',
        name: 'Frío',
        icon: '❄️',
        pipeline: [
            { filterId: 'temperature', params: { value: -60 } },
            { filterId: 'contrast',    params: { value: 10 } },
        ],
    },
    {
        id: 'warm',
        name: 'Cálido',
        icon: '☀️',
        pipeline: [
            { filterId: 'temperature', params: { value: 55 } },
            { filterId: 'saturation',  params: { value: 15 } },
        ],
    },
    {
        id: 'drama',
        name: 'Drama',
        icon: '🎬',
        pipeline: [
            { filterId: 'contrast',   params: { value: 40 } },
            { filterId: 'brightness', params: { value: -15 } },
            { filterId: 'saturation', params: { value: -20 } },
        ],
    },
    {
        id: 'fade',
        name: 'Fade',
        icon: '🌫️',
        pipeline: [
            { filterId: 'contrast',   params: { value: -25 } },
            { filterId: 'brightness', params: { value: 20 } },
            { filterId: 'saturation', params: { value: -30 } },
        ],
    },
    {
        id: 'pop',
        name: 'Pop Art',
        icon: '🎪',
        pipeline: [
            { filterId: 'saturation', params: { value: 60 } },
            { filterId: 'contrast',   params: { value: 25 } },
            { filterId: 'posterize',  params: { levels: 5 } },
        ],
    },
    {
        id: 'noir',
        name: 'Noir',
        icon: '🎩',
        pipeline: [
            { filterId: 'grayscale',  params: {} },
            { filterId: 'contrast',   params: { value: 45 } },
            { filterId: 'brightness', params: { value: -10 } },
        ],
    },
    {
        id: 'summer',
        name: 'Verano',
        icon: '🏖️',
        pipeline: [
            { filterId: 'temperature', params: { value: 30 } },
            { filterId: 'saturation',  params: { value: 25 } },
            { filterId: 'brightness',  params: { value: 10 } },
        ],
    },
];

// ─── Gradient Map palettes ────────────────────────────────────────────────────

const GRADIENT_PALETTES: Record<string, [number, number, number, number, number, number]> = {
    sunset: [0, 0, 60,   255, 100, 0],
    ocean:  [0, 10, 80,  180, 230, 255],
    forest: [10, 30, 0,  100, 210, 80],
    fire:   [20, 0, 0,   255, 220, 0],
    night:  [5, 0, 30,   150, 180, 255],
};

// Builds a 256-entry LUT applying luminance → color gradient mapping
export function buildGradientLUT(
    r1: number, g1: number, b1: number,
    r2: number, g2: number, b2: number
): Uint8ClampedArray {
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        lut[i * 4 + 0] = Math.round(r1 + (r2 - r1) * t);
        lut[i * 4 + 1] = Math.round(g1 + (g2 - g1) * t);
        lut[i * 4 + 2] = Math.round(b1 + (b2 - b1) * t);
        lut[i * 4 + 3] = 255;
    }
    return lut;
}

// ─── Sharpen convolute matrix (variable intensity) ────────────────────────────

function buildSharpenMatrix(intensity: number): number[] {
    // intensity 0–100 → center weight 1–9
    const s = 1 + (intensity / 100) * 8;
    const edge = -(s - 1) / 4;
    return [
        0,    edge, 0,
        edge, s,    edge,
        0,    edge, 0,
    ];
}

// ─── Temperature / Tint ColorMatrix builders ─────────────────────────────────

function buildTemperatureMatrix(value: number): number[] {
    // value: -100 (cool/blue) to +100 (warm/yellow)
    const t = value / 100;
    // Warm: boost R+G, reduce B
    // Cool: boost B, reduce R+G
    const r = 1 + t * 0.2;
    const g = 1 + t * 0.05;
    const b = 1 - t * 0.25;
    return [
        r,   0,   0,   0, 0,
        0,   g,   0,   0, 0,
        0,   0,   b,   0, 0,
        0,   0,   0,   1, 0,
    ];
}

function buildTintMatrix(value: number): number[] {
    // value: -100 (magenta) to +100 (green)
    const t = value / 100;
    // Green: boost G, reduce R+B slightly
    // Magenta: boost R+B, reduce G
    const r = 1 - t * 0.1;
    const g = 1 + t * 0.2;
    const b = 1 - t * 0.1;
    return [
        r,   0,   0,   0, 0,
        0,   g,   0,   0, 0,
        0,   0,   b,   0, 0,
        0,   0,   0,   1, 0,
    ];
}

function buildColorBalanceMatrix(r: number, g: number, b: number): number[] {
    // Each value: -100 to +100 offset (normalized to 0–0.39 range)
    const rOff = (r / 100) * 0.39;
    const gOff = (g / 100) * 0.39;
    const bOff = (b / 100) * 0.39;
    return [
        1, 0, 0, 0, rOff,
        0, 1, 0, 0, gOff,
        0, 0, 1, 0, bOff,
        0, 0, 0, 1, 0,
    ];
}

// ─── Main compiler ────────────────────────────────────────────────────────────

/**
 * Compiles a FilterState[] into an array of fabric.Image.filters instances.
 * Pass these directly to img.filters and then call img.applyFilters().
 */
export function compilePipeline(pipeline: FilterState[]): any[] {
    const result: any[] = [];

    for (const state of pipeline) {
        if (!state.enabled) continue;
        const p = state.params;

        switch (state.filterId) {

            // ── Adjustment ────────────────────────────────────────────────
            case 'brightness': {
                const val = Number(p.value ?? 0) / 100;
                result.push(new fabric.Image.filters.Brightness({ brightness: val }));
                break;
            }
            case 'contrast': {
                const val = Number(p.value ?? 0) / 100;
                result.push(new fabric.Image.filters.Contrast({ contrast: val }));
                break;
            }
            case 'saturation': {
                const val = Number(p.value ?? 0) / 100;
                result.push(new (fabric.Image.filters as any).Saturation({ saturation: val }));
                break;
            }
            case 'temperature': {
                const matrix = buildTemperatureMatrix(Number(p.value ?? 0));
                result.push(new (fabric.Image.filters as any).ColorMatrix({ matrix }));
                break;
            }
            case 'tint': {
                const matrix = buildTintMatrix(Number(p.value ?? 0));
                result.push(new (fabric.Image.filters as any).ColorMatrix({ matrix }));
                break;
            }

            // ── Artistic ──────────────────────────────────────────────────
            case 'sepia':
                result.push(new fabric.Image.filters.Sepia());
                break;
            case 'grayscale':
                result.push(new fabric.Image.filters.Grayscale());
                break;
            case 'invert':
                result.push(new fabric.Image.filters.Invert());
                break;
            case 'posterize': {
                const levels = Number(p.levels ?? 4);
                result.push(new (fabric.Image.filters as any).Posterize({ levels }));
                break;
            }
            case 'pixelate': {
                const blocksize = Number(p.blocksize ?? 8);
                result.push(new (fabric.Image.filters as any).Pixelate({ blocksize }));
                break;
            }
            case 'blur': {
                const blurVal = Number(p.value ?? 10) / 100;
                result.push(new fabric.Image.filters.Blur({ blur: blurVal }));
                break;
            }
            case 'sharpen': {
                const intensity = Number(p.value ?? 50);
                result.push(new (fabric.Image.filters as any).Convolute({
                    matrix: buildSharpenMatrix(intensity),
                    opaque: false,
                }));
                break;
            }

            // ── Color ─────────────────────────────────────────────────────
            case 'curves': {
                const r = Number(p.r ?? 1);
                const g = Number(p.g ?? 1);
                const b = Number(p.b ?? 1);
                result.push(new (fabric.Image.filters as any).Gamma({ gamma: [r, g, b] }));
                break;
            }
            case 'levels': {
                // Approximate levels via brightness + contrast
                const black = Number(p.black ?? 0) / 255;
                const white = Number(p.white ?? 255) / 255;
                const mid   = Number(p.mid ?? 1);
                const brightnessAdj = -black + (white - 1) * 0.5;
                const contrastAdj   = (1 / (white - black)) - 1;
                result.push(new fabric.Image.filters.Brightness({ brightness: brightnessAdj }));
                result.push(new fabric.Image.filters.Contrast({ contrast: Math.min(1, contrastAdj) }));
                result.push(new (fabric.Image.filters as any).Gamma({ gamma: [mid, mid, mid] }));
                break;
            }
            case 'colorBalance': {
                const rVal = Number(p.r ?? 0);
                const gVal = Number(p.g ?? 0);
                const bVal = Number(p.b ?? 0);
                const matrix = buildColorBalanceMatrix(rVal, gVal, bVal);
                result.push(new (fabric.Image.filters as any).ColorMatrix({ matrix }));
                break;
            }
            case 'gradientMap': {
                const presetKey = String(p.preset ?? 'sunset') as keyof typeof GRADIENT_PALETTES;
                const palette = GRADIENT_PALETTES[presetKey] ?? GRADIENT_PALETTES.sunset;
                // We approximate the gradient map using a ColorMatrix that desaturates
                // then applies the gamma channel mapping:
                result.push(new fabric.Image.filters.Grayscale());
                result.push(new (fabric.Image.filters as any).Gamma({
                    gamma: [
                        palette[3] / 128,
                        palette[4] / 128,
                        palette[5] / 128,
                    ],
                }));
                result.push(new fabric.Image.filters.Brightness({ brightness: (palette[0] + palette[1] + palette[2]) / 255 / 3 - 0.15 }));
                break;
            }
        }
    }

    return result;
}

/**
 * Applies the compiled filter pipeline to a fabric.Image object.
 * Works non-destructively: clears existing filters then re-applies.
 */
export function applyPipelineToImage(img: fabric.Image, pipeline: FilterState[]): void {
    img.filters = compilePipeline(pipeline);
    img.applyFilters();
}

/**
 * Creates a default FilterState from a FilterId with all params at their defaults.
 */
export function createFilterState(filterId: FilterId): FilterState {
    const def = FILTER_DEFS.find(d => d.id === filterId);
    const params: Record<string, number | string> = {};
    if (def) {
        for (const param of def.params) {
            params[param.key] = param.defaultValue;
        }
    }
    return {
        instanceId: `${filterId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        filterId,
        enabled: true,
        params,
    };
}

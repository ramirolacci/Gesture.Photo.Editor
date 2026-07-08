// ─── Filter System Types ──────────────────────────────────────────────────────

export type FilterCategory = 'adjustment' | 'artistic' | 'color';

// All available filter identifiers
export type FilterId =
    // Adjustment
    | 'brightness'
    | 'contrast'
    | 'saturation'
    | 'temperature'
    | 'tint'
    // Artistic
    | 'sepia'
    | 'grayscale'
    | 'invert'
    | 'posterize'
    | 'pixelate'
    | 'blur'
    | 'sharpen'
    // Color
    | 'curves'
    | 'levels'
    | 'colorBalance'
    | 'gradientMap';

// Parameter descriptor – defines the shape of a single editable knob
export interface FilterParamDef {
    key: string;
    label: string;
    type: 'range' | 'select' | 'color';
    min?: number;
    max?: number;
    step?: number;
    defaultValue: number | string;
    options?: { label: string; value: string | number }[];
}

// A filter instance in the pipeline, with its current param values
export interface FilterState {
    /** Unique instance ID (not the same as FilterId – you can add the same filter twice) */
    instanceId: string;
    filterId: FilterId;
    enabled: boolean;
    params: Record<string, number | string>;
}

// Static metadata for a filter type
export interface FilterDef {
    id: FilterId;
    label: string;
    icon: string;
    category: FilterCategory;
    description: string;
    params: FilterParamDef[];
}

// A saved preset (named collection of FilterState[])
export interface FilterPreset {
    id: string;
    name: string;
    icon: string;
    pipeline: Array<{
        filterId: FilterId;
        params: Record<string, number | string>;
    }>;
}

// Curve control point (for RGB curves)
export interface CurvePoint {
    x: number; // 0–255 input
    y: number; // 0–255 output
}

export type RGBChannel = 'r' | 'g' | 'b' | 'rgb';

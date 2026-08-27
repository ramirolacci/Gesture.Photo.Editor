export class OneEuroFilter {
    private minCutoff: number;
    private beta: number;
    private dCutoff: number;
    private xPrev: number | null = null;
    private dxPrev: number = 0;
    private tPrev: number | null = null;

    constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }

    private alpha(cutoff: number, dt: number): number {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    public filter(x: number, timestamp: number = Date.now()): number {
        if (this.xPrev === null || this.tPrev === null) {
            this.xPrev = x;
            this.tPrev = timestamp;
            this.dxPrev = 0;
            return x;
        }

        const dt = Math.max((timestamp - this.tPrev) / 1000.0, 0.001); // en segundos
        this.tPrev = timestamp;

        // Estimar velocidad (derivada)
        const dx = (x - this.xPrev) / dt;
        const alphaD = this.alpha(this.dCutoff, dt);
        const edx = alphaD * dx + (1.0 - alphaD) * this.dxPrev;
        this.dxPrev = edx;

        // Frecuencia de corte adaptativa basada en la velocidad
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        const alphaX = this.alpha(cutoff, dt);

        const xFiltered = alphaX * x + (1.0 - alphaX) * this.xPrev;
        this.xPrev = xFiltered;

        return xFiltered;
    }

    public reset() {
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }
}

export class Point3DSmoother {
    private filterX: OneEuroFilter;
    private filterY: OneEuroFilter;
    private filterZ: OneEuroFilter;

    constructor(minCutoff: number = 1.2, beta: number = 0.02) {
        this.filterX = new OneEuroFilter(minCutoff, beta);
        this.filterY = new OneEuroFilter(minCutoff, beta);
        this.filterZ = new OneEuroFilter(minCutoff, beta);
    }

    public filter(point: { x: number; y: number; z?: number }, timestamp: number = Date.now()): { x: number; y: number; z: number } {
        return {
            x: this.filterX.filter(point.x, timestamp),
            y: this.filterY.filter(point.y, timestamp),
            z: this.filterZ.filter(point.z ?? 0, timestamp),
        };
    }

    public reset() {
        this.filterX.reset();
        this.filterY.reset();
        this.filterZ.reset();
    }
}

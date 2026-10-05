// Álgebra linear mínima (matrizes pequenas, densas, simétricas) e gerador aleatório.

/** Decomposição de Cholesky de A (n×n, row-major). Adiciona jitter se necessário. */
export function cholesky(A: Float64Array, n: number): Float64Array {
  for (let jitter = 0; jitter < 8; jitter++) {
    const L = new Float64Array(n * n);
    const eps = jitter === 0 ? 0 : 1e-10 * 10 ** jitter;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i * n + j] + (i === j ? eps : 0);
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) {
          if (s <= 0 || !Number.isFinite(s)) { ok = false; break; }
          L[i * n + i] = Math.sqrt(s);
        } else L[i * n + j] = s / L[j * n + j];
      }
    }
    if (ok) return L;
  }
  throw new Error('Matriz não é positiva definida');
}

/** Resolve (L Lᵀ) x = b. */
export function resolverCholesky(L: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Inversa a partir do fator de Cholesky. */
export function inversaCholesky(L: Float64Array, n: number): Float64Array {
  const inv = new Float64Array(n * n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0);
    e[j] = 1;
    const col = resolverCholesky(L, n, e);
    for (let i = 0; i < n; i++) inv[i * n + j] = col[i];
  }
  return inv;
}

/** Gerador pseudoaleatório determinístico (mulberry32) com normais via Box–Muller. */
export class Aleatorio {
  private estado: number;
  private reserva: number | null = null;

  constructor(semente: number) {
    this.estado = semente >>> 0 || 1;
  }

  uniforme(): number {
    let t = (this.estado = (this.estado + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(): number {
    if (this.reserva !== null) {
      const r = this.reserva;
      this.reserva = null;
      return r;
    }
    let u = 0;
    while (u === 0) u = this.uniforme();
    const v = this.uniforme();
    const raio = Math.sqrt(-2 * Math.log(u));
    this.reserva = raio * Math.sin(2 * Math.PI * v);
    return raio * Math.cos(2 * Math.PI * v);
  }
}

export function quantil(ordenado: Float64Array, q: number): number {
  if (ordenado.length === 0) return NaN;
  const pos = (ordenado.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < ordenado.length ? ordenado[i] * (1 - f) + ordenado[i + 1] * f : ordenado[i];
}

/** Inversa da normal padrão (aproximação de Acklam, erro relativo < 1.2e-9). */
export function inversaNormal(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Tabela de 65.536 quantis da normal: sorteio rápido (um inteiro aleatório por normal). */
const TABELA_NORMAL = (() => {
  const t = new Float64Array(1 << 16);
  for (let i = 0; i < t.length; i++) t[i] = inversaNormal((i + 0.5) / t.length);
  return t;
})();

/** Gerador rápido para Monte Carlo (mulberry32 + tabela de quantis). */
export class AleatorioRapido {
  private estado: number;

  constructor(semente: number) {
    this.estado = semente >>> 0 || 1;
  }

  inteiro(): number {
    let t = (this.estado = (this.estado + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  normal(): number {
    return TABELA_NORMAL[this.inteiro() >>> 16];
  }
}

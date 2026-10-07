/** Small dense linear algebra helpers (matrices are number[][]). */

export function zeros(n: number, m: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(m).fill(0));
}

/** Lower Cholesky factor, or null when the matrix isn't positive definite. */
export function cholesky(a: number[][]): number[][] | null {
  const n = a.length;
  const l = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (!(s > 1e-300) || !Number.isFinite(s)) return null;
        l[i]![j] = Math.sqrt(s);
      } else {
        l[i]![j] = s / l[j]![j]!;
      }
    }
  }
  return l;
}

/** Solve A x = b given the Cholesky factor of A. */
export function cholSolve(l: number[][], b: number[]): number[] {
  const n = l.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= l[i]![k]! * y[k]!;
    y[i] = s / l[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= l[k]![i]! * x[k]!;
    x[i] = s / l[i]![i]!;
  }
  return x;
}

/** Inverse of a symmetric positive-definite matrix from its Cholesky factor. */
export function cholInverse(l: number[][]): number[][] {
  const n = l.length;
  const inv = zeros(n, n);
  const e = new Array<number>(n).fill(0);
  for (let c = 0; c < n; c++) {
    e.fill(0);
    e[c] = 1;
    const col = cholSolve(l, e);
    for (let r = 0; r < n; r++) inv[r]![c] = col[r]!;
  }
  // symmetrise away round-off
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) {
      const v = 0.5 * (inv[i]![j]! + inv[j]![i]!);
      inv[i]![j] = v;
      inv[j]![i] = v;
    }
  return inv;
}

export function matVec(a: number[][], v: number[]): number[] {
  return a.map((row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
}

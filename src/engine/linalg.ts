/** Small dense linear algebra helpers (matrices are number[][]). */

export function zeros(n: number, m: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(m).fill(0));
}

/** Inverse of a symmetric positive-definite matrix via Cholesky. */
export function invertSPD(a: number[][]): number[][] {
  const n = a.length;
  const l = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (s <= 0) throw new Error("matrix not positive definite");
        l[i]![j] = Math.sqrt(s);
      } else {
        l[i]![j] = s / l[j]![j]!;
      }
    }
  }
  // Invert L (lower triangular).
  const li = zeros(n, n);
  for (let i = 0; i < n; i++) {
    li[i]![i] = 1 / l[i]![i]!;
    for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = j; k < i; k++) s += l[i]![k]! * li[k]![j]!;
      li[i]![j] = -s / l[i]![i]!;
    }
  }
  // A^-1 = L^-T L^-1
  const inv = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = i; k < n; k++) s += li[k]![i]! * li[k]![j]!;
      inv[i]![j] = s;
      inv[j]![i] = s;
    }
  }
  return inv;
}

export function matVec(a: number[][], v: number[]): number[] {
  return a.map((row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
}

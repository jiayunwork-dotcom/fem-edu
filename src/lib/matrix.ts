export type Matrix = number[][];
export type Vector = number[];

export interface GaussStep {
  M: Matrix;
  pivot: number;
  eliminated: number;
  desc: string;
}

export function zeros(rows: number, cols: number): Matrix {
  const m: Matrix = new Array(rows);
  for (let i = 0; i < rows; i++) {
    m[i] = new Array(cols).fill(0);
  }
  return m;
}

export function zerosVec(n: number): Vector {
  return new Array(n).fill(0);
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  const rowsA = A.length, colsA = A[0].length;
  const rowsB = B.length, colsB = B[0].length;
  if (colsA !== rowsB) throw new Error('矩阵维度不匹配');
  const C = zeros(rowsA, colsB);
  for (let i = 0; i < rowsA; i++) {
    for (let k = 0; k < colsA; k++) {
      const a = A[i][k];
      if (a === 0) continue;
      for (let j = 0; j < colsB; j++) {
        C[i][j] += a * B[k][j];
      }
    }
  }
  return C;
}

export function matTranspose(A: Matrix): Matrix {
  const rows = A.length, cols = A[0].length;
  const T = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

export function matScalar(A: Matrix, s: number): Matrix {
  return A.map(row => row.map(v => v * s));
}

export function matAdd(A: Matrix, B: Matrix): Matrix {
  if (A.length !== B.length || A[0].length !== B[0].length) {
    throw new Error('矩阵维度不匹配');
  }
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function vecAdd(a: Vector, b: Vector): Vector {
  return a.map((v, i) => v + b[i]);
}

export function vecScalar(a: Vector, s: number): Vector {
  return a.map(v => v * s);
}

export function vecDot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function solveLinearSystem(K: Matrix, F: Vector, constraints: boolean[] = []): Vector {
  const n = K.length;
  const Kc: Matrix = K.map(r => [...r]);
  const Fc: Vector = [...F];
  const freeDofs: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!constraints[i]) freeDofs.push(i);
  }
  const m = freeDofs.length;
  const Kr = zeros(m, m);
  const Fr = zerosVec(m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      Kr[i][j] = Kc[freeDofs[i]][freeDofs[j]];
    }
    Fr[i] = Fc[freeDofs[i]];
  }
  const Ur = gaussElimination(Kr, Fr);
  const U = zerosVec(n);
  for (let i = 0; i < m; i++) {
    U[freeDofs[i]] = Ur[i];
  }
  return U;
}

export function gaussElimination(A: Matrix, b: Vector): Vector {
  const n = A.length;
  const M: Matrix = A.map((row, i) => [...row, b[i]]);
  for (let p = 0; p < n; p++) {
    let maxRow = p;
    for (let i = p + 1; i < n; i++) {
      if (Math.abs(M[i][p]) > Math.abs(M[maxRow][p])) maxRow = i;
    }
    [M[p], M[maxRow]] = [M[maxRow], M[p]];
    const pv = M[p][p];
    if (Math.abs(pv) < 1e-12) throw new Error('奇异矩阵');
    for (let j = p; j <= n; j++) M[p][j] /= pv;
    for (let i = 0; i < n; i++) {
      if (i === p) continue;
      const f = M[i][p];
      for (let j = p; j <= n; j++) M[i][j] -= f * M[p][j];
    }
  }
  return M.map(r => r[n]);
}

export function gaussEliminationSteps(A: Matrix, b: Vector): { steps: GaussStep[]; result: Vector } {
  const n = A.length;
  const M: Matrix = A.map((row, i) => [...row, b[i]]);
  const steps: GaussStep[] = [];
  steps.push({ M: M.map(r => [...r]), pivot: -1, eliminated: -1, desc: '初始增广矩阵 [K|F]' });
  for (let p = 0; p < n; p++) {
    let maxRow = p;
    for (let i = p + 1; i < n; i++) {
      if (Math.abs(M[i][p]) > Math.abs(M[maxRow][p])) maxRow = i;
    }
    if (maxRow !== p) {
      [M[p], M[maxRow]] = [M[maxRow], M[p]];
      steps.push({ M: M.map(r => [...r]), pivot: p, eliminated: -1, desc: `交换行${p}与行${maxRow}（主元选择）` });
    }
    const pv = M[p][p];
    if (Math.abs(pv) < 1e-12) throw new Error('奇异矩阵');
    for (let j = p; j <= n; j++) M[p][j] /= pv;
    steps.push({ M: M.map(r => [...r]), pivot: p, eliminated: -1, desc: `归一化主元行${p}` });
    for (let i = 0; i < n; i++) {
      if (i === p) continue;
      const f = M[i][p];
      if (Math.abs(f) < 1e-12) continue;
      for (let j = p; j <= n; j++) M[i][j] -= f * M[p][j];
      steps.push({ M: M.map(r => [...r]), pivot: p, eliminated: i, desc: `消去行${i}的第${p}列元素` });
    }
  }
  steps.push({ M: M.map(r => [...r]), pivot: -1, eliminated: -1, desc: '回代完成，得到位移向量U' });
  const result = M.map(r => r[n]);
  return { steps, result };
}

export function determinant2x2(m: Matrix): number {
  return m[0][0] * m[1][1] - m[0][1] * m[1][0];
}

export function formatNumber(v: number, digits: number = 4): string {
  if (Math.abs(v) < 1e-12) return '0';
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0)) {
    return v.toExponential(digits);
  }
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

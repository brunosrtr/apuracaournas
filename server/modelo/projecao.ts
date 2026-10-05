// Modelo de projeção do resultado final da eleição presidencial a partir da
// apuração parcial (detalhado também na aba "Modelo" da interface).
//
//  1. Comparecimento: para o eleitorado ainda não apurado de cada município,
//     estima-se comparecimento e fração de válidos a partir do histórico do
//     próprio município, corrigido pela variação já observada na sua região.
//
//  2. Preferência: para cada candidato, regressão linear bayesiana ponderada
//     da fração de votos nos municípios já apurados sobre variáveis históricas
//     padronizadas (duas eleições anteriores). A priori dos coeficientes é
//     informativa quando o candidato (ou o partido) disputou antes: centrada no
//     "swing logístico" — mesma geografia, ajustada à força atual (Lula 2026 ≈
//     Lula 2022; PL 2026 ≈ Bolsonaro 2022). Para os demais, centrada em zero.
//     Pesos = 1/(τ² + s²): ruído da apuração parcial (s²) + variação local (τ²).
//
//  3. Efeitos regionais aninhados (macrorregião → UF → região intermediária),
//     estimados por DerSimonian–Laird e encolhidos (empirical Bayes). Regiões
//     sem votos herdam a incerteza a priori; um choque comum de extrapolação
//     cobre o risco de o eleitorado restante diferir do já apurado.
//
//  4. Em cada município parcialmente apurado, previsão e parcial observado são
//     combinados pela precisão de cada um (atualização normal–normal).
//
//  5. Monte Carlo (dividido entre threads): coeficientes, efeitos regionais,
//     ruído municipal e choques de comparecimento correlacionados. Cada cenário
//     é um resultado final completo → intervalos, margens e probabilidades.
import { AleatorioRapido, cholesky, inversaCholesky, quantil, resolverCholesky } from './algebra.ts';
import type {
  CoeficienteModelo, DiagnosticoModelo, Faixa, Projecao, ProjecaoCandidato, ProjecaoRegional,
} from '../../shared/tipos.ts';

export interface UnidadeModelo {
  codigo: string;
  /** índice da região intermediária */
  regiao: number;
  /** índice da UF */
  estado: number;
  /** índice da macrorregião */
  macro: number;
  /** variáveis históricas padronizadas */
  x: Float64Array;
  /** comparecimento histórico (comparecimento/aptos), NaN se desconhecido */
  compBase: number;
  /** fração histórica de válidos sobre comparecimento, NaN se desconhecida */
  validoBase: number;
  eleitorado: number;
  eleitoradoApurado: number;
  comparecimento: number;
  validos: number;
  /** votos apurados por candidato (alinhado a EntradaModelo.candidatos) */
  votos: Float64Array;
}

export interface Hiper {
  /** não representatividade das primeiras seções de um município (f → 0) */
  delta: number;
  /** desvio a priori dos coeficientes padronizados */
  sigmaBeta: number;
  sigmaMacro: number;
  sigmaUf: number;
  sigmaRi: number;
  /** choque comum ao eleitorado ainda não apurado */
  sigmaExtrap: number;
  /** choque comum às macrorregiões ainda sem nenhum voto (risco de extrapolar uma região para outra) */
  sigmaSemDados: number;
  /** piso do desvio residual municipal */
  tauMin: number;
  /** "grupos virtuais" da priori nos estimadores de variância regional */
  kGrupos: number;
}

// Calibrados por backtest (npm run testar / -- grade / -- ordem): apuração de 2022 com bases 2018 e 2014.
// Com σext = 0,015 e σsemDados = 0,025, os intervalos de 80% e 95% cobrem 85% e 95% dos casos, e os
// testes de ordem da apuração (Nordeste por último / primeiro) ficam dentro da margem em 15 de 16 pontos.
export const HIPER_PADRAO: Hiper = {
  delta: 0.08,
  sigmaBeta: 0.06,
  sigmaMacro: 0.025,
  sigmaUf: 0.03,
  sigmaRi: 0.02,
  sigmaExtrap: 0.015,
  sigmaSemDados: 0.025,
  tauMin: 0.008,
  kGrupos: 4,
};

export interface EntradaModelo {
  /** identificadores modelados (pode incluir o grupo "outros") */
  candidatos: string[];
  /** false para grupos que não são candidatos (não entram no ranking) */
  reais: boolean[];
  variaveis: string[];
  /** média a priori de cada coeficiente padronizado, por candidato */
  priori: Float64Array[];
  unidades: UnidadeModelo[];
  nRegioes: number;
  nEstados: number;
  nMacros: number;
  nomesEstados: string[];
  nomesMacros: string[];
  maioriaAbsoluta: boolean;
  /** vagas em disputa (sem maioria absoluta, os k mais votados são eleitos) */
  vagas: number;
  baseHistorica: string;
  hiper?: Partial<Hiper>;
}

export interface Amostras {
  N: number;
  /** [candidato][cenário] fração dos válidos */
  fracoes: Float64Array[];
  comp: Float64Array;
  validos: Float64Array;
  /** ((estado·C + candidato)·N + cenário) */
  estados: Float32Array;
  macros: Float32Array;
}

export interface ResultadoParte {
  motivo?: string;
  amostras?: Amostras;
  porUnidade?: Record<string, number[]>;
  diagnostico?: Omit<DiagnosticoModelo, 'workers' | 'tempoMs'>;
  validObs: number;
  compObs: number;
  votosObs: number[];
  eleitoradoRestante: number;
}

interface AjusteCandidato {
  beta: Float64Array;
  cholCov: Float64Array;
  cov: Float64Array;
  tau2: number;
  tauW2: number;
  sigmaMacro2: number;
  efMacro: Float64Array;
  varMacro: Float64Array;
  sigmaUf2: number;
  efUf: Float64Array;
  varUf: Float64Array;
  sigmaRi2: number;
  efRi: Float64Array;
  varRi: Float64Array;
  r2: number;
}

interface Ajuste {
  h: Hiper;
  C: number; d: number; p: number; M: number;
  nE: number; nR: number; nMac: number;
  P: Float64Array;
  escala: Float64Array;
  ajustes: AjusteCandidato[];
  abertas: Int32Array;
  restante: Float64Array;
  compRest: Float64Array;
  pesoObs: Float64Array;
  sdExtra: Float64Array;
  yObs: Float64Array;
  sigmaTurnR: Float64Array;
  /** macrorregiões sem nenhum município apurado */
  macroSemDados: Uint8Array;
  fixo: Float64Array;
  fixoUf: Float64Array;
  fixoMacro: Float64Array;
  validObs: number;
  compObs: number;
  votosObs: Float64Array;
  eleitTotal: number;
  eleitApurado: number;
  unidadesComDados: number;
}

const K_COMPARECIMENTO = 20_000;
const MIN_VALIDOS_TREINO = 20;
const FAIXA_ZERO: Faixa = { media: 0, p025: 0, p10: 0, p90: 0, p975: 0 };

/** Estimador DerSimonian–Laird com priori e encolhimento empírico-bayesiano. */
function efeitosAleatorios(
  grupos: Int32Array, nGrupos: number, resid: Float64Array, pesos: Float64Array, sigmaPriori2: number, kGrupos: number,
) {
  const W = new Float64Array(nGrupos);
  const S = new Float64Array(nGrupos);
  for (let i = 0; i < grupos.length; i++) {
    W[grupos[i]] += pesos[i];
    S[grupos[i]] += pesos[i] * resid[i];
  }
  let somaW = 0, somaW2 = 0, somaWr = 0, K = 0;
  for (let g = 0; g < nGrupos; g++) {
    if (W[g] <= 0) continue;
    K++;
    somaW += W[g];
    somaW2 += W[g] * W[g];
    somaWr += S[g];
  }
  const media = somaW > 0 ? somaWr / somaW : 0;
  let Q = 0;
  for (let g = 0; g < nGrupos; g++) if (W[g] > 0) Q += W[g] * (S[g] / W[g] - media) ** 2;
  const denom = somaW - (somaW > 0 ? somaW2 / somaW : 0);
  const sigmaDL2 = K > 1 && denom > 0 ? Math.max(0, (Q - (K - 1)) / denom) : 0;
  const sigma2 = (K * sigmaDL2 + kGrupos * sigmaPriori2) / (K + kGrupos);

  const efeito = new Float64Array(nGrupos);
  const variancia = new Float64Array(nGrupos);
  for (let g = 0; g < nGrupos; g++) {
    const prec = W[g] + 1 / sigma2;
    efeito[g] = W[g] > 0 ? S[g] / prec : 0;
    variancia[g] = 1 / prec;
  }
  return { sigma2, efeito, variancia };
}

// ==================================================================== ajuste
function ajustar(e: EntradaModelo): Ajuste | string {
  const h: Hiper = { ...HIPER_PADRAO, ...e.hiper };
  const C = e.candidatos.length;
  const d = e.variaveis.length;
  const p = d + 1;
  const U = e.unidades;
  const M = U.length;
  const nE = Math.max(1, e.nEstados), nR = Math.max(1, e.nRegioes), nMac = Math.max(1, e.nMacros);

  let eleitTotal = 0, eleitApurado = 0, compObs = 0, validObs = 0, unidadesComDados = 0;
  const votosObs = new Float64Array(C);
  for (const u of U) {
    eleitTotal += u.eleitorado;
    eleitApurado += Math.min(u.eleitoradoApurado, u.eleitorado);
    compObs += u.comparecimento;
    validObs += u.validos;
    for (let c = 0; c < C; c++) votosObs[c] += u.votos[c];
    if (u.validos > 0) unidadesComDados++;
  }
  if (validObs < 500 || unidadesComDados < 3) return 'Aguardando as primeiras seções totalizadas para calibrar o modelo.';

  const P = new Float64Array(C);
  for (let c = 0; c < C; c++) P[c] = Math.min(0.999, Math.max(1e-4, votosObs[c] / validObs));
  const escala = Float64Array.from(P, (v) => Math.sqrt(v * (1 - v)) / 0.5);

  // ---------------------------------------------------------- 1. comparecimento e válidos
  let somaCb = 0, somaVb = 0, pesoBase = 0;
  for (const u of U) {
    if (Number.isFinite(u.compBase) && u.compBase > 0 && Number.isFinite(u.validoBase) && u.validoBase > 0) {
      somaCb += u.compBase * u.eleitorado;
      somaVb += u.validoBase * u.eleitorado;
      pesoBase += u.eleitorado;
    }
  }
  const cbMedio = pesoBase > 0 ? somaCb / pesoBase : 0.78;
  const vbMedio = pesoBase > 0 ? somaVb / pesoBase : 0.93;
  const cb = new Float64Array(M), vb = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    const u = U[m];
    const ok = Number.isFinite(u.compBase) && u.compBase > 0 && Number.isFinite(u.validoBase) && u.validoBase > 0;
    cb[m] = ok ? u.compBase : cbMedio;
    vb[m] = ok ? u.validoBase : vbMedio;
  }
  const compR = new Float64Array(nR), espR = new Float64Array(nR), validR = new Float64Array(nR), espVR = new Float64Array(nR);
  const unidadesR = new Float64Array(nR);
  let compG = 0, espG = 0, validG = 0, espVG = 0;
  for (let m = 0; m < M; m++) {
    const u = U[m];
    if (u.eleitoradoApurado <= 0 || u.comparecimento <= 0) continue;
    const esp = u.eleitoradoApurado * cb[m];
    compR[u.regiao] += u.comparecimento; espR[u.regiao] += esp;
    validR[u.regiao] += u.validos; espVR[u.regiao] += u.comparecimento * vb[m];
    unidadesR[u.regiao]++;
    compG += u.comparecimento; espG += esp; validG += u.validos; espVG += u.comparecimento * vb[m];
  }
  const alfa = espG > 0 ? compG / espG : 1;
  const rho = espVG > 0 ? validG / espVG : 1;

  const restante = new Float64Array(M);
  const compRest = new Float64Array(M);
  const sigmaTurnR = new Float64Array(nR);
  for (let g = 0; g < nR; g++) sigmaTurnR[g] = 0.05 / Math.sqrt(1 + unidadesR[g]) + 0.01;
  for (let m = 0; m < M; m++) {
    const u = U[m];
    const falta = Math.max(0, u.eleitorado - u.eleitoradoApurado);
    if (falta <= 0) continue;
    const g = u.regiao;
    const alfaR = (compR[g] + K_COMPARECIMENTO * alfa) / (espR[g] + K_COMPARECIMENTO);
    const rhoR = (validR[g] + K_COMPARECIMENTO * rho) / (espVR[g] + K_COMPARECIMENTO);
    let t = alfaR * cb[m];
    let v = rhoR * vb[m];
    if (u.eleitoradoApurado > 0 && u.comparecimento > 0) {
      const lt = u.eleitoradoApurado / (u.eleitoradoApurado + 3000);
      t = lt * (u.comparecimento / u.eleitoradoApurado) + (1 - lt) * t;
      const lv = u.comparecimento / (u.comparecimento + 3000);
      v = lv * (u.validos / u.comparecimento) + (1 - lv) * v;
    }
    t = Math.min(1, Math.max(0.15, t));
    v = Math.min(1, Math.max(0.4, v));
    compRest[m] = falta * t;
    restante[m] = falta * t * v;
  }

  // ---------------------------------------------------------- 2. regressão por candidato
  const fracApur = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    const u = U[m];
    fracApur[m] = u.eleitorado > 0 ? Math.min(1, u.eleitoradoApurado / u.eleitorado) : 1;
  }
  const treino: number[] = [];
  for (let m = 0; m < M; m++) if (U[m].validos >= MIN_VALIDOS_TREINO && U[m].eleitoradoApurado > 0) treino.push(m);
  const n = treino.length;
  if (n < 3) return 'Poucos municípios com votos apurados até agora.';

  const X = new Float64Array(n * p);
  const grupoUf = new Int32Array(n), grupoRi = new Int32Array(n), grupoMacro = new Int32Array(n);
  const macroSemDados = new Uint8Array(nMac).fill(1);
  for (let i = 0; i < n; i++) {
    const u = U[treino[i]];
    X[i * p] = 1;
    for (let j = 0; j < d; j++) X[i * p + 1 + j] = u.x[j];
    grupoUf[i] = u.estado;
    grupoRi[i] = u.regiao;
    grupoMacro[i] = u.macro;
    macroSemDados[u.macro] = 0;
  }

  // variância da fração parcial em torno da final do município: amostragem (1/n)
  // + não representatividade das primeiras seções (δ²), ambas ∝ (1 − f)
  const ruidoObs = (m: number, c: number, y: number) => {
    const pb = Math.min(0.999, Math.max(1e-4, 0.5 * y + 0.5 * P[c]));
    return Math.max(1e-7, pb * (1 - pb) * (1 - fracApur[m]) * (1 / Math.max(1, U[m].validos) + h.delta * h.delta));
  };

  const ajustes: AjusteCandidato[] = [];
  for (let c = 0; c < C; c++) {
    const y = new Float64Array(n), s2 = new Float64Array(n);
    let my = 0, sw = 0;
    for (let i = 0; i < n; i++) {
      const m = treino[i];
      y[i] = U[m].votos[c] / U[m].validos;
      s2[i] = ruidoObs(m, c, y[i]);
      my += y[i] * U[m].validos;
      sw += U[m].validos;
    }
    my /= sw;
    let vy = 0;
    for (let i = 0; i < n; i++) vy += U[treino[i]].validos * (y[i] - my) ** 2;
    vy /= sw;
    const tauMin2 = (h.tauMin * escala[c]) ** 2;
    const sigmaB2 = (h.sigmaBeta * escala[c]) ** 2;
    const b0 = e.priori[c];
    let tau2 = Math.max(tauMin2, 0.5 * vy);

    let beta: Float64Array = new Float64Array(p);
    let L: Float64Array = new Float64Array(p * p);
    const w = new Float64Array(n);
    const r = new Float64Array(n);
    for (let iter = 0; iter < 5; iter++) {
      const A = new Float64Array(p * p);
      const b = new Float64Array(p);
      for (let i = 0; i < n; i++) {
        w[i] = 1 / (tau2 + s2[i]);
        const off = i * p;
        for (let a = 0; a < p; a++) {
          const xa = X[off + a] * w[i];
          b[a] += xa * y[i];
          for (let bb = 0; bb <= a; bb++) A[a * p + bb] += xa * X[off + bb];
        }
      }
      for (let a = 0; a < p; a++) for (let bb = 0; bb < a; bb++) A[bb * p + a] = A[a * p + bb];
      // priori: intercepto quase livre; coeficientes ~ N(b0, σβ²)
      A[0] += 1e-6;
      b[0] += 1e-6 * P[c];
      for (let j = 1; j < p; j++) {
        A[j * p + j] += 1 / sigmaB2;
        b[j] += (b0?.[j - 1] ?? 0) / sigmaB2;
      }
      L = cholesky(A, p);
      beta = resolverCholesky(L, p, b);

      // graus de liberdade efetivos = p − tr(A⁻¹ Λ)
      const inv = inversaCholesky(L, p);
      let trAL = inv[0] * 1e-6;
      for (let j = 1; j < p; j++) trAL += inv[j * p + j] / sigmaB2;
      const gl = Math.max(0, p - trAL);

      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        let pred = 0;
        for (let a = 0; a < p; a++) pred += X[i * p + a] * beta[a];
        r[i] = y[i] - pred;
        num += w[i] * (r[i] * r[i] - s2[i]);
        den += w[i];
      }
      tau2 = Math.max(tauMin2, (num / den) * (n / Math.max(1, n - gl)));
    }
    const cov = inversaCholesky(L, p);
    const cholCov = cholesky(cov, p);

    let sse = 0, sst = 0, wm = 0, ws = 0;
    for (let i = 0; i < n; i++) { wm += w[i] * y[i]; ws += w[i]; }
    wm /= ws;
    for (let i = 0; i < n; i++) { sse += w[i] * r[i] * r[i]; sst += w[i] * (y[i] - wm) ** 2; }

    // ---------------------------------------------------------- 3. efeitos regionais aninhados
    const pesosNivel = (varAcima: number) => Float64Array.from(s2, (v) => 1 / (Math.max(tauMin2, tau2 - varAcima) + v));
    const resid0 = Float64Array.from(r);
    let sigmaMacro2 = 0, efMacro = new Float64Array(nMac), varMacro = new Float64Array(nMac);
    if (e.nMacros > 1) {
      const rm = efeitosAleatorios(grupoMacro, nMac, r, w, (h.sigmaMacro * escala[c]) ** 2, h.kGrupos);
      sigmaMacro2 = rm.sigma2; efMacro = rm.efeito; varMacro = rm.variancia;
      for (let i = 0; i < n; i++) resid0[i] = r[i] - efMacro[grupoMacro[i]];
    }
    let sigmaUf2 = 0, efUf = new Float64Array(nE), varUf = new Float64Array(nE);
    const resid1 = Float64Array.from(resid0);
    if (e.nEstados > 1) {
      const ra = efeitosAleatorios(grupoUf, nE, resid0, pesosNivel(sigmaMacro2), (h.sigmaUf * escala[c]) ** 2, h.kGrupos);
      sigmaUf2 = ra.sigma2; efUf = ra.efeito; varUf = ra.variancia;
      for (let i = 0; i < n; i++) resid1[i] = resid0[i] - efUf[grupoUf[i]];
    }
    const rb = efeitosAleatorios(grupoRi, nR, resid1, pesosNivel(sigmaMacro2 + sigmaUf2), (h.sigmaRi * escala[c]) ** 2, h.kGrupos);
    ajustes.push({
      beta, cholCov, cov, tau2,
      tauW2: Math.max(tauMin2, tau2 - sigmaMacro2 - sigmaUf2 - rb.sigma2),
      sigmaMacro2, efMacro, varMacro, sigmaUf2, efUf, varUf,
      sigmaRi2: rb.sigma2, efRi: rb.efeito, varRi: rb.variancia,
      r2: sst > 0 ? Math.max(0, 1 - sse / sst) : 0,
    });
  }

  // ---------------------------------------------------------- 4. pesos do parcial por município
  const pesoObs = new Float64Array(M * C), sdExtra = new Float64Array(M * C), yObs = new Float64Array(M * C);
  const abertasLista: number[] = [];
  const fixo = new Float64Array(C), fixoUf = new Float64Array(nE * C), fixoMacro = new Float64Array(nMac * C);
  const xt = new Float64Array(p);
  for (let m = 0; m < M; m++) {
    const u = U[m];
    if (restante[m] <= 0.5) {
      for (let c = 0; c < C; c++) {
        fixo[c] += u.votos[c];
        fixoUf[u.estado * C + c] += u.votos[c];
        fixoMacro[u.macro * C + c] += u.votos[c];
      }
      continue;
    }
    abertasLista.push(m);
    if (u.validos <= 0) continue;
    xt[0] = 1;
    for (let j = 0; j < d; j++) xt[1 + j] = u.x[j];
    for (let c = 0; c < C; c++) {
      const a = ajustes[c];
      let xSx = 0;
      for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) xSx += xt[i] * a.cov[i * p + j] * xt[j];
      const Pvar = a.tauW2 + (e.nMacros > 1 ? a.varMacro[u.macro] : 0) + (e.nEstados > 1 ? a.varUf[u.estado] : 0)
        + a.varRi[u.regiao] + (h.sigmaExtrap * escala[c]) ** 2 + xSx;
      const yy = u.votos[c] / u.validos;
      const k = Pvar / (Pvar + ruidoObs(m, c, yy));
      pesoObs[m * C + c] = k;
      sdExtra[m * C + c] = Math.sqrt(Math.max(0, k * (1 - k) * a.tauW2));
      yObs[m * C + c] = yy;
    }
  }

  return {
    h, C, d, p, M, nE, nR, nMac, P, escala, ajustes,
    abertas: Int32Array.from(abertasLista), restante, compRest, pesoObs, sdExtra, yObs, sigmaTurnR, macroSemDados,
    fixo, fixoUf, fixoMacro, validObs, compObs, votosObs, eleitTotal, eleitApurado, unidadesComDados,
  };
}

// ==================================================================== estimativa pontual
function estimativaPontual(e: EntradaModelo, aj: Ajuste): Record<string, number[]> {
  const { C, d } = aj;
  const saida: Record<string, number[]> = {};
  for (let m = 0; m < aj.M; m++) {
    const u = e.unidades[m];
    const theta = new Array<number>(C);
    let soma = 0;
    for (let c = 0; c < C; c++) {
      const a = aj.ajustes[c];
      let t: number;
      if (aj.restante[m] <= 0.5 && u.validos > 0) t = u.votos[c] / u.validos;
      else {
        let mu = a.beta[0];
        for (let j = 0; j < d; j++) mu += u.x[j] * a.beta[1 + j];
        mu += a.efMacro[u.macro] + a.efUf[u.estado] + a.efRi[u.regiao];
        const k = aj.pesoObs[m * C + c];
        t = k > 0 ? k * aj.yObs[m * C + c] + (1 - k) * mu : mu;
      }
      t = Math.max(1e-5, t);
      theta[c] = t;
      soma += t;
    }
    saida[u.codigo] = theta.map((t) => t / soma);
  }
  return saida;
}

// ==================================================================== Monte Carlo
function simular(e: EntradaModelo, aj: Ajuste, N: number, semente: number): Amostras {
  const { C, d, p, nE, nR, nMac, ajustes, h } = aj;
  const U = e.unidades;
  const rng = new AleatorioRapido(semente);
  const fracoes = Array.from({ length: C }, () => new Float64Array(N));
  const comp = new Float64Array(N), validos = new Float64Array(N);
  const estados = new Float32Array(nE * C * N), macros = new Float32Array(nMac * C * N);

  const betaS = new Float64Array(C * p);
  const ufS = new Float64Array(nE * C), riS = new Float64Array(nR * C), macS = new Float64Array(nMac * C);
  const globalS = new Float64Array(C);
  const semDadosS = new Float64Array(C);
  const choqueR = new Float64Array(nR);
  const z = new Float64Array(p);
  const total = new Float64Array(C), totUf = new Float64Array(nE * C), totMac = new Float64Array(nMac * C);
  const th = new Float64Array(C);
  const sdTau = Float64Array.from(ajustes, (a) => Math.sqrt(a.tauW2));
  const sdUf = ajustes.map((a) => Float64Array.from(a.varUf, Math.sqrt));
  const sdRi = ajustes.map((a) => Float64Array.from(a.varRi, Math.sqrt));
  const sdMac = ajustes.map((a) => Float64Array.from(a.varMacro, Math.sqrt));

  for (let s = 0; s < N; s++) {
    for (let c = 0; c < C; c++) {
      const a = ajustes[c];
      for (let k = 0; k < p; k++) z[k] = rng.normal();
      for (let i = 0; i < p; i++) {
        let v = a.beta[i];
        for (let k = 0; k <= i; k++) v += a.cholCov[i * p + k] * z[k];
        betaS[c * p + i] = v;
      }
      for (let g = 0; g < nMac; g++) macS[g * C + c] = e.nMacros > 1 ? a.efMacro[g] + sdMac[c][g] * rng.normal() : 0;
      for (let g = 0; g < nE; g++) ufS[g * C + c] = e.nEstados > 1 ? a.efUf[g] + sdUf[c][g] * rng.normal() : 0;
      for (let g = 0; g < nR; g++) riS[g * C + c] = a.efRi[g] + sdRi[c][g] * rng.normal();
      globalS[c] = h.sigmaExtrap * aj.escala[c] * rng.normal();
      semDadosS[c] = h.sigmaSemDados * aj.escala[c] * rng.normal();
    }
    const choqueGlobal = 0.01 * rng.normal();
    for (let g = 0; g < nR; g++) choqueR[g] = aj.sigmaTurnR[g] * rng.normal();

    total.set(aj.fixo);
    totUf.set(aj.fixoUf);
    totMac.set(aj.fixoMacro);
    let compTot = aj.compObs, validTot = aj.validObs;
    for (let ia = 0; ia < aj.abertas.length; ia++) {
      const m = aj.abertas[ia];
      const u = U[m];
      const fator = Math.max(0, 1 + choqueGlobal + choqueR[u.regiao]);
      const R = aj.restante[m] * fator;
      compTot += aj.compRest[m] * fator;
      let soma = 0;
      for (let c = 0; c < C; c++) {
        const off = c * p;
        let pr = betaS[off];
        for (let j = 0; j < d; j++) pr += u.x[j] * betaS[off + 1 + j];
        pr += macS[u.macro * C + c] + ufS[u.estado * C + c] + riS[u.regiao * C + c] + globalS[c] + sdTau[c] * rng.normal();
        if (aj.macroSemDados[u.macro]) pr += semDadosS[c];
        const k = aj.pesoObs[m * C + c];
        let t = k > 0 ? k * aj.yObs[m * C + c] + (1 - k) * pr + aj.sdExtra[m * C + c] * rng.normal() : pr;
        if (t < 1e-6) t = 1e-6;
        th[c] = t;
        soma += t;
      }
      const vFinal = u.validos + R;
      let somaNec = 0;
      for (let c = 0; c < C; c++) {
        const nec = (th[c] / soma) * vFinal - u.votos[c];
        th[c] = nec > 0 ? nec : 0;
        somaNec += th[c];
      }
      for (let c = 0; c < C; c++) {
        const v = u.votos[c] + (somaNec > 0 ? (th[c] / somaNec) * R : 0);
        total[c] += v;
        totUf[u.estado * C + c] += v;
        totMac[u.macro * C + c] += v;
      }
      validTot += R;
    }
    let soma = 0;
    for (let c = 0; c < C; c++) soma += total[c];
    for (let c = 0; c < C; c++) fracoes[c][s] = total[c] / soma;
    for (let g = 0; g < nE; g++) {
      let sg = 0;
      for (let c = 0; c < C; c++) sg += totUf[g * C + c];
      for (let c = 0; c < C; c++) estados[(g * C + c) * N + s] = sg > 0 ? totUf[g * C + c] / sg : 0;
    }
    for (let g = 0; g < nMac; g++) {
      let sg = 0;
      for (let c = 0; c < C; c++) sg += totMac[g * C + c];
      for (let c = 0; c < C; c++) macros[(g * C + c) * N + s] = sg > 0 ? totMac[g * C + c] / sg : 0;
    }
    comp[s] = compTot;
    validos[s] = validTot;
  }
  return { N, fracoes, comp, validos, estados, macros };
}

// ==================================================================== parte (executada em cada thread)
export function projetarParte(e: EntradaModelo, N: number, semente: number, pontual: boolean): ResultadoParte {
  const aj = ajustar(e);
  if (typeof aj === 'string') return { motivo: aj, validObs: 0, compObs: 0, votosObs: [], eleitoradoRestante: 0 };
  const base = {
    validObs: aj.validObs,
    compObs: aj.compObs,
    votosObs: [...aj.votosObs],
    eleitoradoRestante: Math.max(0, aj.eleitTotal - aj.eleitApurado),
  };
  const amostras = simular(e, aj, N, semente);
  if (!pontual) return { ...base, amostras };

  const principais = [...Array(aj.C).keys()].filter((c) => e.reais[c]).sort((a, b) => aj.P[b] - aj.P[a]).slice(0, 4);
  const coeficientes: Record<string, CoeficienteModelo[]> = {};
  const tau: Record<string, number> = {}, sigmaRegiao: Record<string, number> = {}, r2: Record<string, number> = {};
  for (const c of principais) {
    const a = aj.ajustes[c];
    const num = e.candidatos[c];
    coeficientes[num] = ['Intercepto', ...e.variaveis].map((variavel, j) => ({
      variavel,
      valor: a.beta[j],
      erro: Math.sqrt(a.cov[j * aj.p + j]),
      priori: j === 0 ? 0 : e.priori[c]?.[j - 1] ?? 0,
    }));
    tau[num] = Math.sqrt(a.tauW2);
    sigmaRegiao[num] = Math.sqrt(a.sigmaMacro2 + a.sigmaUf2 + a.sigmaRi2);
    r2[num] = a.r2;
  }
  return {
    ...base,
    amostras,
    porUnidade: estimativaPontual(e, aj),
    diagnostico: {
      unidadesComDados: aj.unidadesComDados,
      unidadesTotal: aj.M,
      fracaoEleitoradoApurado: aj.eleitTotal > 0 ? aj.eleitApurado / aj.eleitTotal : 0,
      tau, sigmaRegiao, r2, coeficientes,
      variaveis: e.variaveis,
      baseHistorica: e.baseHistorica,
    },
  };
}

// ==================================================================== consolidação
function faixa(valores: Float64Array): Faixa {
  if (!valores.length) return FAIXA_ZERO;
  const o = Float64Array.from(valores).sort();
  let soma = 0;
  for (let i = 0; i < valores.length; i++) soma += valores[i];
  return { media: soma / valores.length, p025: quantil(o, 0.025), p10: quantil(o, 0.1), p90: quantil(o, 0.9), p975: quantil(o, 0.975) };
}

function regional(
  e: EntradaModelo, amostras: Float32Array, nGrupos: number, nomes: string[], N: number, reaisIdx: number[],
): ProjecaoRegional[] {
  const C = e.candidatos.length;
  const saida: ProjecaoRegional[] = [];
  for (let g = 0; g < nGrupos; g++) {
    const primeiro = new Float64Array(C);
    for (let s = 0; s < N; s++) {
      let melhor = -1, valor = 0;
      for (const c of reaisIdx) {
        const v = amostras[(g * C + c) * N + s];
        if (v > valor) { valor = v; melhor = c; }
      }
      if (melhor >= 0) primeiro[melhor]++;
    }
    const candidatos = reaisIdx.map((c) => {
      const f = faixa(Float64Array.from(amostras.subarray((g * C + c) * N, (g * C + c + 1) * N)));
      return { numero: e.candidatos[c], media: f.media, p025: f.p025, p10: f.p10, p90: f.p90, p975: f.p975, probPrimeiro: primeiro[c] / N };
    }).sort((a, b) => b.media - a.media);
    if (candidatos[0]?.media > 0) saida.push({ codigo: nomes[g], nome: nomes[g], candidatos: candidatos.slice(0, 4) });
  }
  return saida;
}

function juntar(partes: Amostras[], C: number, nE: number, nMac: number): Amostras {
  const N = partes.reduce((a, p) => a + p.N, 0);
  const fracoes = Array.from({ length: C }, () => new Float64Array(N));
  const comp = new Float64Array(N), validos = new Float64Array(N);
  const estados = new Float32Array(nE * C * N), macros = new Float32Array(nMac * C * N);
  let off = 0;
  for (const pt of partes) {
    for (let c = 0; c < C; c++) fracoes[c].set(pt.fracoes[c], off);
    comp.set(pt.comp, off);
    validos.set(pt.validos, off);
    for (let k = 0; k < nE * C; k++) estados.set(pt.estados.subarray(k * pt.N, (k + 1) * pt.N), k * N + off);
    for (let k = 0; k < nMac * C; k++) macros.set(pt.macros.subarray(k * pt.N, (k + 1) * pt.N), k * N + off);
    off += pt.N;
  }
  return { N, fracoes, comp, validos, estados, macros };
}

export function projecaoIndisponivel(motivo: string): Projecao {
  return {
    disponivel: false,
    motivo,
    calculadaEm: Date.now(),
    simulacoes: 0,
    candidatos: [],
    probSegundoTurno: 0,
    paresSegundoTurno: [],
    lideranca: null,
    histograma: null,
    restante: { eleitorado: 0, validos: FAIXA_ZERO, liderPrecisa: null, liderProjetado: null },
    comparecimento: FAIXA_ZERO,
    validos: FAIXA_ZERO,
    brancosNulos: FAIXA_ZERO,
    estados: [],
    regioes: [],
    diagnostico: null,
  };
}

/** Junta as partes simuladas em cada thread e calcula o resumo da projeção. */
export function consolidar(e: EntradaModelo, partes: ResultadoParte[], tempoMs: number): { projecao: Projecao; porUnidade: Record<string, number[]> } {
  const principal = partes.find((p) => p.diagnostico);
  const falha = partes.find((p) => p.motivo || !p.amostras);
  if (!principal || falha) {
    return { projecao: projecaoIndisponivel(falha?.motivo ?? 'Modelo indisponível.'), porUnidade: {} };
  }
  const C = e.candidatos.length;
  const nE = Math.max(1, e.nEstados), nMac = Math.max(1, e.nMacros);
  const a = juntar(partes.map((p) => p.amostras!), C, nE, nMac);
  const N = a.N;
  const reaisIdx = [...Array(C).keys()].filter((c) => e.reais[c]);

  // desfecho de cada cenário
  const k = Math.max(1, e.vagas ?? 1);
  const vitorias = new Float64Array(C), segundos = new Float64Array(C), primeiros = new Float64Array(C);
  const pares = new Map<string, number>();
  let nSegundo = 0;
  const ranking = [...reaisIdx];
  for (let s = 0; s < N; s++) {
    if (!ranking.length) break;
    ranking.sort((x, y) => a.fracoes[y][s] - a.fracoes[x][s]);
    const i1 = ranking[0], i2 = ranking[1] ?? -1;
    primeiros[i1]++;
    if (e.maioriaAbsoluta) {
      if (a.fracoes[i1][s] > 0.5) vitorias[i1]++;
      else if (i2 >= 0) {
        nSegundo++;
        segundos[i1]++;
        segundos[i2]++;
        const chave = [e.candidatos[i1], e.candidatos[i2]].sort().join('|');
        pares.set(chave, (pares.get(chave) ?? 0) + 1);
      }
    } else {
      for (let i = 0; i < Math.min(k, ranking.length); i++) vitorias[ranking[i]]++;
    }
  }

  const candidatos: ProjecaoCandidato[] = [];
  for (let c = 0; c < C; c++) {
    const f = faixa(a.fracoes[c]);
    const ord = Float64Array.from(a.fracoes[c]).sort();
    candidatos.push({
      numero: e.candidatos[c],
      ...f,
      p50: quantil(ord, 0.5),
      margem95: (f.p975 - f.p025) / 2,
      votos: faixa(Float64Array.from(a.fracoes[c], (v, s) => v * a.validos[s])),
      probVitoria: vitorias[c] / N,
      probSegundoTurno: segundos[c] / N,
      probPrimeiro: primeiros[c] / N,
      agrupado: !e.reais[c],
    });
  }
  candidatos.sort((x, y) => y.media - x.media);

  // liderança: diferença entre os dois primeiros projetados (com várias vagas: a disputa pela última)
  const top = candidatos.filter((c) => !c.agrupado);
  let lideranca: Projecao['lideranca'] = null;
  let histograma: Projecao['histograma'] = null;
  const corte = !e.maioriaAbsoluta && k > 1 && top.length > k ? k - 1 : 0;
  if (top.length >= corte + 2) {
    const i1 = e.candidatos.indexOf(top[corte].numero), i2 = e.candidatos.indexOf(top[corte + 1].numero);
    const dif = Float64Array.from(a.fracoes[i1], (v, s) => v - a.fracoes[i2][s]);
    let afrente = 0;
    for (let s = 0; s < N; s++) if (dif[s] > 0) afrente++;
    lideranca = {
      primeiro: top[corte].numero,
      segundo: top[corte + 1].numero,
      pontos: faixa(dif),
      votos: faixa(Float64Array.from(dif, (v, s) => v * a.validos[s])),
      probPrimeiroAFrente: afrente / N,
    };
    const o1 = Float64Array.from(a.fracoes[i1]).sort(), o2 = Float64Array.from(a.fracoes[i2]).sort();
    let ini = Math.min(quantil(o1, 0.002), quantil(o2, 0.002));
    let fim = Math.max(quantil(o1, 0.998), quantil(o2, 0.998));
    if (e.maioriaAbsoluta && fim > 0.42 && fim < 0.5) fim = 0.505;
    const folga = Math.max(0.002, (fim - ini) * 0.06);
    ini = Math.max(0, ini - folga);
    fim = Math.min(1, fim + folga);
    const BINS = 60;
    const contar = (f: Float64Array) => {
      const cont = new Array<number>(BINS).fill(0);
      for (let s = 0; s < N; s++) {
        const k = Math.floor(((f[s] - ini) / (fim - ini)) * BINS);
        if (k >= 0 && k < BINS) cont[k]++;
      }
      return cont.map((v) => v / N);
    };
    histograma = {
      inicio: ini,
      fim,
      series: [{ numero: top[corte].numero, contagens: contar(a.fracoes[i1]) }, { numero: top[corte + 1].numero, contagens: contar(a.fracoes[i2]) }],
    };
  }

  // votos ainda não apurados
  const validosRest = faixa(Float64Array.from(a.validos, (v) => Math.max(0, v - principal.validObs)));
  let liderPrecisa: number | null = null, liderProjetado: number | null = null;
  if (top.length && validosRest.media > 1000) {
    const i1 = e.candidatos.indexOf(top[0].numero);
    const vL = principal.votosObs[i1];
    liderPrecisa = ((principal.validObs + validosRest.media) / 2 - vL) / validosRest.media;
    liderProjetado = (top[0].votos.media - vL) / validosRest.media;
  }

  return {
    projecao: {
      disponivel: true,
      calculadaEm: Date.now(),
      simulacoes: N,
      candidatos,
      probSegundoTurno: e.maioriaAbsoluta ? nSegundo / N : 0,
      paresSegundoTurno: [...pares.entries()]
        .map(([k, v]) => { const [x, y] = k.split('|'); return { a: x, b: y, prob: v / N }; })
        .sort((x, y) => y.prob - x.prob)
        .slice(0, 4),
      lideranca,
      histograma,
      restante: { eleitorado: principal.eleitoradoRestante, validos: validosRest, liderPrecisa, liderProjetado },
      comparecimento: faixa(a.comp),
      validos: faixa(a.validos),
      brancosNulos: faixa(Float64Array.from(a.comp, (cp, s) => (cp > 0 ? (cp - a.validos[s]) / cp : 0))),
      estados: regional(e, a.estados, nE, e.nomesEstados, N, reaisIdx),
      regioes: regional(e, a.macros, nMac, e.nomesMacros, N, reaisIdx),
      diagnostico: { ...principal.diagnostico!, tempoMs, workers: partes.length },
    },
    porUnidade: principal.porUnidade ?? {},
  };
}

/** Execução completa numa única thread (testes e backtest). */
export function projetar(e: EntradaModelo, simulacoes: number, semente = 1) {
  const t0 = performance.now();
  const parte = projetarParte(e, simulacoes, semente, true);
  return consolidar(e, [parte], Math.round(performance.now() - t0));
}

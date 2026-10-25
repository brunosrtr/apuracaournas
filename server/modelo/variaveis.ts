// Variáveis históricas (covariáveis) por município, padronizadas.
//
// Base principal (ex.: 2022): frações dos 4 principais candidatos, termos
// quadráticos dos 2 primeiros, 2º turno, comparecimento, brancos+nulos.
// Base secundária (ex.: 2018): frações dos 3 principais e 2º turno — capta a
// tendência de cada município entre eleições.
// Estrutura: porte (log do eleitorado) e capital.
import type { BasePresidente, MunicipioBase } from '../../shared/tipos.ts';

export interface Referencia {
  /** índice da variável (após remover as constantes) */
  indice: number;
  numero: string;
  nome: string;
  ano: number;
  /** fração nacional do candidato naquela eleição */
  fracaoNacional: number;
  /** desvio-padrão (ponderado) da variável bruta entre municípios */
  dp: number;
}

export interface Covariaveis {
  nomes: string[];
  descricao: string;
  x: Map<string, Float64Array>;
  compBase: Map<string, number>;
  validoBase: Map<string, number>;
  aptosBase: Map<string, number>;
  /** variáveis que são a votação de um candidato (para a priori de swing) */
  referencias: Referencia[];
}

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

interface Coluna { nome: string; valor: (cd: string) => number; ref?: Omit<Referencia, 'indice' | 'dp'> }

export interface OpcoesCovariaveis {
  /** candidatos da base principal usados como variáveis (padrão 4) */
  quantosPrincipal?: number;
  /** ignora a "fração no 2º turno" da base principal (no 2º turno, seria o próprio alvo) */
  ignorarSegPrincipal?: boolean;
}

export function montarCovariaveis(
  codigos: string[],
  municipios: Record<string, MunicipioBase>,
  bases: BasePresidente[],
  opcoes: OpcoesCovariaveis = {},
): Covariaveis {
  const [principal, ...secundarias] = bases;
  const colunas: Coluna[] = [];
  const fracao = (b: BasePresidente, numero: string) => (cd: string) => {
    const h = b.municipios[cd];
    return h && h.validos > 0 ? (h.v[numero] ?? 0) / h.validos : NaN;
  };
  const totalValidos = (b: BasePresidente) => b.candidatos.reduce((a, c) => a + c.votos, 0);

  const adicionarCandidatos = (b: BasePresidente, quantos: number, quadraticos: number, comSegundo = true) => {
    const total = totalValidos(b);
    b.candidatos.slice(0, quantos).forEach((c) => {
      colunas.push({
        nome: `${titulo(c.nome)} ${rotulo(b)}`,
        valor: fracao(b, c.numero),
        ref: { numero: c.numero, nome: c.nome, ano: b.ano, fracaoNacional: c.votos / total },
      });
    });
    b.candidatos.slice(0, quadraticos).forEach((c) => {
      const f = fracao(b, c.numero);
      colunas.push({ nome: `${titulo(c.nome)} ${rotulo(b)} (quadrático)`, valor: (cd) => f(cd) ** 2 });
    });
    if (!comSegundo || !b.vencedor2T) return;
    const venc = b.candidatos.find((c) => c.numero === b.vencedor2T);
    colunas.push({ nome: `2º turno ${b.ano} (${titulo(venc?.nome ?? b.vencedor2T)})`, valor: (cd) => b.municipios[cd]?.seg ?? NaN });
  };
  const rotulo = (b: BasePresidente) => (b.turno === 2 ? `${b.ano} 2º t.` : String(b.ano));

  adicionarCandidatos(principal, opcoes.quantosPrincipal ?? 4, 2, !opcoes.ignorarSegPrincipal);
  colunas.push({
    nome: `Comparecimento ${rotulo(principal)}`,
    valor: (cd) => { const h = principal.municipios[cd]; return h && h.aptos > 0 ? h.comp / h.aptos : NaN; },
  });
  colunas.push({
    nome: `Brancos e nulos ${rotulo(principal)}`,
    valor: (cd) => { const h = principal.municipios[cd]; return h && h.comp > 0 ? (h.brancos + h.nulos) / h.comp : NaN; },
  });
  for (const b of secundarias) adicionarCandidatos(b, 3, 0);
  colunas.push({ nome: 'Porte (log eleitores)', valor: (cd) => { const h = principal.municipios[cd]; return h ? Math.log(h.aptos) : NaN; } });
  colunas.push({ nome: 'Capital', valor: (cd) => (municipios[cd]?.capital ? 1 : 0) });

  const d = colunas.length;
  const brutos = new Map<string, Float64Array>();
  const compBase = new Map<string, number>();
  const validoBase = new Map<string, number>();
  const aptosBase = new Map<string, number>();
  for (const cd of codigos) {
    const h = principal.municipios[cd];
    if (!h || h.validos <= 0 || h.aptos <= 0) continue;
    brutos.set(cd, Float64Array.from(colunas, (c) => c.valor(cd)));
    compBase.set(cd, h.comp / h.aptos);
    validoBase.set(cd, h.comp > 0 ? h.validos / h.comp : NaN);
    aptosBase.set(cd, h.aptos);
  }

  // padronização ponderada pelo eleitorado (valores ausentes → média)
  const media = new Float64Array(d), dp = new Float64Array(d), peso = new Float64Array(d);
  for (const [cd, v] of brutos) {
    const w = aptosBase.get(cd)!;
    for (let j = 0; j < d; j++) if (Number.isFinite(v[j])) { media[j] += w * v[j]; peso[j] += w; }
  }
  for (let j = 0; j < d; j++) media[j] = peso[j] > 0 ? media[j] / peso[j] : 0;
  for (const [cd, v] of brutos) {
    const w = aptosBase.get(cd)!;
    for (let j = 0; j < d; j++) if (Number.isFinite(v[j])) dp[j] += w * (v[j] - media[j]) ** 2;
  }
  for (let j = 0; j < d; j++) dp[j] = peso[j] > 0 ? Math.sqrt(dp[j] / peso[j]) : 0;

  const manter = [...Array(d).keys()].filter((j) => dp[j] > 1e-9);
  const x = new Map<string, Float64Array>();
  for (const cd of codigos) {
    const v = brutos.get(cd);
    x.set(cd, Float64Array.from(manter, (j) => (v && Number.isFinite(v[j]) ? (v[j] - media[j]) / dp[j] : 0)));
  }
  const referencias: Referencia[] = [];
  manter.forEach((j, i) => {
    const ref = colunas[j].ref;
    if (ref) referencias.push({ ...ref, indice: i, dp: dp[j] });
  });

  return {
    nomes: manter.map((j) => colunas[j].nome),
    descricao: `Presidente ${bases.map((b) => (b.turno === 2 ? `${b.ano} (2º turno)` : `${b.ano} (1º turno)`)).join(' e ')}, por município`,
    x,
    compBase,
    validoBase,
    aptosBase,
    referencias,
  };
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/**
 * Candidato equivalente na base histórica: mesmo número (partido) ou mesmo nome de urna.
 * Busca primeiro na base principal.
 */
export function referenciaDe(cov: Covariaveis, numero: string, nome: string): Referencia | null {
  const anos = [...new Set(cov.referencias.map((r) => r.ano))];
  for (const ano of anos) {
    const daBase = cov.referencias.filter((r) => r.ano === ano);
    const r = daBase.find((x) => x.numero === numero) ?? daBase.find((x) => normalizar(x.nome) === normalizar(nome));
    if (r) return r;
  }
  return null;
}

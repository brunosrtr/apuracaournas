// Conversão dos JSONs de divulgação do TSE para as estruturas internas.
// Formatos observados em resultados.tse.jus.br (ciclo 2026):
//   dados/<uf>/<uf>[<mun>]-c<cargo>-e<eleicao>-u.json  → "unificado": totais + candidatos
//   dados/<uf>/<uf>-e<eleicao>-ab.json                 → andamento por município (ou por UF em /br)
import type { Candidato, Contagem } from '../../shared/tipos.ts';
import { atribuirCores } from '../../shared/cores.ts';

const n = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0;
  const x = Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};

export interface TseSecoes { ts?: string; st?: string }
export interface TseEleitorado { te?: string; est?: string; c?: string; a?: string }
export interface TseVotos { vv?: string; vb?: string; tvn?: string }

export interface TseCandidato {
  n: string; nm: string; nmu?: string; sqcand?: string; vap?: string; e?: string; st?: string; dvt?: string;
}
export interface TsePartido { n: string; sg: string; nm: string; cand?: TseCandidato[] }
export interface TseAgremiacao { n: string; nm: string; tp: string; com: string; par: TsePartido[] }
export interface TseUnificado {
  ele: string; t: string; tpabr: string; cdabr: string; dt?: string; ht?: string; dg?: string; hg?: string;
  carg: { cd: string; nmn: string; nv?: string; agr: TseAgremiacao[] }[];
  s?: TseSecoes; e?: TseEleitorado; v?: TseVotos;
}
export interface TseAndamento {
  abr: { cdabr: string; tpabr: string; dt?: string; ht?: string; s?: TseSecoes; e?: TseEleitorado }[];
}

export interface Unificado {
  contagem: Contagem;
  candidatos: Candidato[];
  /** vagas em disputa (0 se o arquivo não informar) */
  vagas: number;
  atualizadoEm: string | null;
}

const valido = (dvt?: string) => !dvt || !/anulad|cassad|indeferid/i.test(dvt);

export function contagemVazia(): Contagem {
  return {
    secoesTotal: 0, secoesTotalizadas: 0, eleitorado: 0, eleitoradoTotalizado: 0, comparecimento: 0,
    abstencao: 0, validos: 0, brancos: 0, nulos: 0, votos: {},
  };
}

export function lerUnificado(j: TseUnificado): Unificado {
  const contagem: Contagem = {
    secoesTotal: n(j.s?.ts),
    secoesTotalizadas: n(j.s?.st),
    eleitorado: n(j.e?.te),
    eleitoradoTotalizado: n(j.e?.est),
    comparecimento: n(j.e?.c),
    abstencao: n(j.e?.a),
    validos: n(j.v?.vv),
    brancos: n(j.v?.vb),
    nulos: n(j.v?.tvn),
    votos: {},
  };
  const candidatos: Candidato[] = [];
  for (const a of j.carg?.[0]?.agr ?? []) {
    for (const p of a.par ?? []) {
      for (const c of p.cand ?? []) {
        const ok = valido(c.dvt);
        if (ok) contagem.votos[c.n] = n(c.vap);
        candidatos.push({
          numero: c.n,
          nome: c.nmu || c.nm,
          nomeCompleto: c.nm,
          partido: p.sg,
          coligacao: a.com,
          sqcand: c.sqcand ?? '',
          situacaoTse: c.st ?? '',
          destinacao: ok ? 'Válido' : (c.dvt ?? ''),
          cor: '',
        });
      }
    }
  }
  candidatos.sort((a, b) => (contagem.votos[b.numero] ?? -1) - (contagem.votos[a.numero] ?? -1));
  const cores = atribuirCores(candidatos.map((c) => c.numero));
  for (const c of candidatos) c.cor = cores[c.numero];
  return { contagem, candidatos, vagas: n(j.carg?.[0]?.nv), atualizadoEm: j.dt && j.ht ? `${j.dt} ${j.ht}` : null };
}

export interface AndamentoUnidade {
  codigo: string;
  secoesTotal: number;
  secoesTotalizadas: number;
  eleitorado: number;
  eleitoradoTotalizado: number;
  assinatura: string;
}

export function lerAndamento(j: TseAndamento): AndamentoUnidade[] {
  return (j.abr ?? []).map((a) => ({
    codigo: a.cdabr,
    secoesTotal: n(a.s?.ts),
    secoesTotalizadas: n(a.s?.st),
    eleitorado: n(a.e?.te),
    eleitoradoTotalizado: n(a.e?.est),
    assinatura: `${a.s?.st}|${a.e?.est}|${a.e?.c}|${a.dt}${a.ht}`,
  }));
}

const pad = (v: number | string, t: number) => String(v).padStart(t, '0');

export const caminhos = {
  config: (base: string) => `${base}/comum/config/ele-c.json`,
  unificado: (base: string, ciclo: string, eleicao: number, uf: string, cargo: number, municipio = '') =>
    `${base}/${ciclo}/${eleicao}/dados/${uf}/${uf}${municipio}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`,
  andamento: (base: string, ciclo: string, eleicao: number, uf: string) =>
    `${base}/${ciclo}/${eleicao}/dados/${uf}/${uf}-e${pad(eleicao, 6)}-ab.json`,
  foto: (base: string, ciclo: string, eleicao: number, uf: string, sqcand: string) =>
    `${base}/${ciclo}/${eleicao}/fotos/${uf}/${sqcand}.jpeg`,
};

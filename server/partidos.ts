// Resumo por partido e por bloco ideológico das disputas de Governador e Senado em todas as UFs.
//
// Usa a projeção de cada disputa (modelo estadual). Para o Senado, a distribuição do número de
// cadeiras de um partido é a soma de "eleito/não eleito" de cada candidato (Poisson-binomial),
// supondo independência entre estados — dentro de um estado as duas vagas são disputadas juntas,
// o que torna o intervalo levemente conservador.
import type { Corrida } from './corrida.ts';
import type {
  Bloco, CandidatoResumoUf, DesempenhoBloco, DesempenhoGovernador, DesempenhoPartido, DesempenhoSenado,
  ResumoPartidos, ResumoPartidosUf,
} from '../shared/tipos.ts';
import { BLOCOS, blocoDoPartido } from '../shared/ideologia.ts';
import { NOMES_UF } from './config.ts';

/** Distribuição do número de sucessos de eventos independentes (programação dinâmica). */
function poissonBinomial(probs: number[]): number[] {
  let dist = [1];
  for (const p of probs) {
    const nova = new Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      nova[k] += dist[k] * (1 - p);
      nova[k + 1] += dist[k] * p;
    }
    dist = nova;
  }
  return dist;
}

function quantilDiscreto(dist: number[], q: number): number {
  let acum = 0;
  for (let k = 0; k < dist.length; k++) {
    acum += dist[k];
    if (acum >= q - 1e-9) return k;
  }
  return dist.length - 1;
}

const govVazio = (): DesempenhoGovernador => ({ candidatos: 0, votos: 0, fracaoVotos: 0, estadosEm1: 0, eleitos1T: 0, em2T: 0 });
const senVazio = (): DesempenhoSenado => ({ candidatos: 0, votos: 0, fracaoVotos: 0, cadeiras: 0, cadeirasP10: 0, cadeirasP90: 0 });

export function resumirPartidos(governadores: Corrida[], senados: Corrida[]): ResumoPartidos {
  const partidos = new Map<string, DesempenhoPartido & { probsSenado: number[] }>();
  const blocos = new Map<Bloco, DesempenhoBloco & { probsSenado: number[] }>(
    BLOCOS.map((b) => [b, { bloco: b, governador: govVazio(), senado: senVazio(), probsSenado: [] }]),
  );
  const obter = (sigla: string, numero: string) => {
    let p = partidos.get(sigla);
    if (!p) {
      p = { partido: sigla, numero: numero.slice(0, 2), bloco: blocoDoPartido(sigla, numero), governador: govVazio(), senado: senVazio(), probsSenado: [] };
      partidos.set(sigla, p);
    }
    return p;
  };

  const estados = new Map<string, ResumoPartidosUf>();
  const estadoUf = (uf: string) => {
    let e = estados.get(uf);
    if (!e) {
      e = { uf, nome: NOMES_UF[uf] ?? uf, pstGovernador: 0, pstSenado: 0, governador: [], senado: [] };
      estados.set(uf, e);
    }
    return e;
  };

  let totalGov = 0, totalSen = 0, comGov = 0, comSen = 0, vagasSenado = 0;

  for (const c of governadores) {
    const e = estadoUf(c.info.abrangencia);
    e.pstGovernador = c.totais.percentualSecoes;
    const p = c.projecao?.disponivel ? c.projecao : null;
    if (!p) continue;
    comGov++;
    const resumo: CandidatoResumoUf[] = [];
    for (const pc of p.candidatos) {
      const cand = c.candidatos.find((x) => x.numero === pc.numero);
      if (!cand) continue;
      const par = obter(cand.partido, cand.numero);
      const blo = blocos.get(par.bloco)!;
      for (const alvo of [par.governador, blo.governador]) {
        alvo.candidatos++;
        alvo.votos += pc.votos.media;
        alvo.estadosEm1 += pc.probPrimeiro;
        alvo.eleitos1T += pc.probVitoria;
        alvo.em2T += pc.probSegundoTurno;
      }
      totalGov += pc.votos.media;
      resumo.push({ numero: pc.numero, nome: cand.nome, partido: cand.partido, bloco: par.bloco, media: pc.media, probPrimeiro: pc.probPrimeiro, probVitoria: pc.probVitoria, probSegundoTurno: pc.probSegundoTurno });
    }
    e.governador = resumo.sort((a, b) => b.media - a.media).slice(0, 3);
  }

  for (const c of senados) {
    const e = estadoUf(c.info.abrangencia);
    e.pstSenado = c.totais.percentualSecoes;
    vagasSenado += c.info.vagas;
    const p = c.projecao?.disponivel ? c.projecao : null;
    if (!p) continue;
    comSen++;
    const resumo: CandidatoResumoUf[] = [];
    for (const pc of p.candidatos) {
      const cand = c.candidatos.find((x) => x.numero === pc.numero);
      if (!cand) continue;
      const par = obter(cand.partido, cand.numero);
      const blo = blocos.get(par.bloco)!;
      for (const alvo of [par, blo]) {
        alvo.senado.candidatos++;
        alvo.senado.votos += pc.votos.media;
        alvo.senado.cadeiras += pc.probVitoria;
        alvo.probsSenado.push(pc.probVitoria);
      }
      totalSen += pc.votos.media;
      resumo.push({ numero: pc.numero, nome: cand.nome, partido: cand.partido, bloco: par.bloco, media: pc.media, probPrimeiro: pc.probPrimeiro, probVitoria: pc.probVitoria, probSegundoTurno: 0 });
    }
    e.senado = resumo.sort((a, b) => b.probVitoria - a.probVitoria || b.media - a.media).slice(0, 4);
  }

  const fechar = <T extends { governador: DesempenhoGovernador; senado: DesempenhoSenado; probsSenado: number[] }>(x: T) => {
    x.governador.fracaoVotos = totalGov > 0 ? x.governador.votos / totalGov : 0;
    x.senado.fracaoVotos = totalSen > 0 ? x.senado.votos / totalSen : 0;
    const dist = poissonBinomial(x.probsSenado.filter((p) => p > 1e-4));
    x.senado.cadeirasP10 = quantilDiscreto(dist, 0.1);
    x.senado.cadeirasP90 = quantilDiscreto(dist, 0.9);
    const { probsSenado: _, ...resto } = x;
    return resto;
  };

  return {
    calculadoEm: Date.now(),
    comProjecao: { governador: comGov, senado: comSen },
    vagasSenado,
    partidos: [...partidos.values()].map(fechar)
      .filter((p) => p.governador.candidatos + p.senado.candidatos > 0)
      .sort((a, b) => (b.senado.cadeiras + b.governador.estadosEm1) - (a.senado.cadeiras + a.governador.estadosEm1) || b.governador.votos - a.governador.votos),
    blocos: [...blocos.values()].map(fechar),
    estados: [...estados.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

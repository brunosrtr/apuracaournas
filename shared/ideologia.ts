// Classificação ideológica aproximada dos partidos em três blocos.
//
// Baseada no posicionamento usual na ciência política brasileira (ex.: Bolognesi, Ribeiro e
// Codato, "Uma nova classificação ideológica dos partidos políticos brasileiros", Dados, 2023)
// e no comportamento das bancadas no Congresso. Partidos de centro-esquerda (PDT, PSB, PV, REDE)
// entram em "esquerda"; os de centro-direita mais próximos do bolsonarismo, em "direita".
// É uma simplificação — ajuste aqui se preferir outra classificação.
import type { Bloco } from './tipos.ts';

const POR_NUMERO: Record<string, Bloco> = {
  // esquerda
  '13': 'esquerda', // PT
  '50': 'esquerda', // PSOL
  '65': 'esquerda', // PCdoB
  '40': 'esquerda', // PSB
  '12': 'esquerda', // PDT
  '18': 'esquerda', // REDE
  '43': 'esquerda', // PV
  '16': 'esquerda', // PSTU
  '29': 'esquerda', // PCO
  '21': 'esquerda', // PCB
  '80': 'esquerda', // UP
  // centro
  '15': 'centro', // MDB
  '55': 'centro', // PSD
  '45': 'centro', // PSDB
  '23': 'centro', // CIDADANIA
  '19': 'centro', // PODEMOS
  '70': 'centro', // AVANTE
  '77': 'centro', // SOLIDARIEDADE
  '36': 'centro', // AGIR
  '33': 'centro', // MOBILIZA (ex-PMN)
  '90': 'centro', // PROS
  // direita
  '22': 'direita', // PL
  '11': 'direita', // PP
  '10': 'direita', // REPUBLICANOS
  '44': 'direita', // UNIÃO
  '30': 'direita', // NOVO
  '28': 'direita', // PRTB
  '25': 'direita', // PRD
  '27': 'direita', // DC
  '14': 'direita', // MISSÃO
  '35': 'direita', // DEMOCRATA
  '20': 'direita', // PSC
};

const POR_SIGLA: Record<string, Bloco> = {
  PT: 'esquerda', PSOL: 'esquerda', PCDOB: 'esquerda', PSB: 'esquerda', PDT: 'esquerda', REDE: 'esquerda',
  PV: 'esquerda', PSTU: 'esquerda', PCO: 'esquerda', PCB: 'esquerda', UP: 'esquerda',
  MDB: 'centro', PSD: 'centro', PSDB: 'centro', CIDADANIA: 'centro', PODE: 'centro', PODEMOS: 'centro',
  AVANTE: 'centro', SOLIDARIEDADE: 'centro', AGIR: 'centro', MOBILIZA: 'centro', PMN: 'centro', PROS: 'centro',
  PL: 'direita', PP: 'direita', REPUBLICANOS: 'direita', UNIAO: 'direita', NOVO: 'direita', PRTB: 'direita',
  PRD: 'direita', DC: 'direita', MISSAO: 'direita', DEMOCRATA: 'direita', PSC: 'direita', PATRIOTA: 'direita', PTB: 'direita',
};

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

export function blocoDoPartido(sigla: string, numeroCandidato: string): Bloco {
  return POR_SIGLA[normalizar(sigla)] ?? POR_NUMERO[numeroCandidato.slice(0, 2)] ?? 'centro';
}

export const BLOCOS: Bloco[] = ['esquerda', 'centro', 'direita'];

export const CORES_BLOCO: Record<Bloco, string> = {
  esquerda: '#e03131',
  centro: '#f2a900',
  direita: '#1d4ed8',
};

export const NOMES_BLOCO: Record<Bloco, string> = { esquerda: 'Esquerda', centro: 'Centro', direita: 'Direita' };

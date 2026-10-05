import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { availableParallelism } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DIR_DADOS = join(RAIZ, 'data');
export const DIR_BASE = join(DIR_DADOS, 'base');
export const DIR_GEO = join(DIR_DADOS, 'geo');
export const DIR_CACHE = join(DIR_DADOS, 'cache');
export const DIR_DIST = join(RAIZ, 'dist');

export const PORTA = Number(process.env.PORTA ?? 8787);
export const URL_TSE = process.env.URL_TSE ?? 'https://resultados.tse.jus.br/oficial';
export const CICLO = process.env.CICLO ?? 'ele2026';

/** Intervalo entre ciclos de coleta no TSE (ms). Seja gentil com o servidor. */
export const INTERVALO_COLETA_MS = Number(process.env.INTERVALO_COLETA_MS ?? 20_000);
/** Requisições simultâneas ao TSE. */
export const CONCORRENCIA = Number(process.env.CONCORRENCIA ?? 8);
/** Cenários de Monte Carlo por projeção (divididos entre as threads). */
export const SIMULACOES = Number(process.env.SIMULACOES ?? 4000);
/** Governador e Senado das 27 UFs: consulta mais espaçada, conexões e cenários próprios. */
export const INTERVALO_ESTADUAL_MS = Number(process.env.INTERVALO_ESTADUAL_MS ?? 40_000);
export const CONCORRENCIA_ESTADUAL = Number(process.env.CONCORRENCIA_ESTADUAL ?? 5);
export const SIMULACOES_ESTADUAIS = Number(process.env.SIMULACOES_ESTADUAIS ?? 1500);
/** Threads usadas pelo modelo. */
export const THREADS = Math.max(1, Math.min(Number(process.env.THREADS ?? 4), availableParallelism() - 1));

/** Anos usados como base histórica (o primeiro é o principal). */
export const ANOS_BASE_AO_VIVO = [2022, 2018];
export const ANOS_BASE_SIMULACAO = [2018, 2014];

export const NOMES_UF: Record<string, string> = {
  ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal',
  es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mt: 'Mato Grosso', ms: 'Mato Grosso do Sul',
  mg: 'Minas Gerais', pa: 'Pará', pb: 'Paraíba', pr: 'Paraná', pe: 'Pernambuco', pi: 'Piauí',
  rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', rs: 'Rio Grande do Sul', ro: 'Rondônia', rr: 'Roraima',
  sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe', to: 'Tocantins', zz: 'Exterior',
};

export const UF_POR_CODIGO_IBGE: Record<string, string> = {
  '11': 'ro', '12': 'ac', '13': 'am', '14': 'rr', '15': 'pa', '16': 'ap', '17': 'to',
  '21': 'ma', '22': 'pi', '23': 'ce', '24': 'rn', '25': 'pb', '26': 'pe', '27': 'al', '28': 'se', '29': 'ba',
  '31': 'mg', '32': 'es', '33': 'rj', '35': 'sp',
  '41': 'pr', '42': 'sc', '43': 'rs',
  '50': 'ms', '51': 'mt', '52': 'go', '53': 'df',
};

export const REGIAO_POR_UF: Record<string, string> = {
  ro: 'N', ac: 'N', am: 'N', rr: 'N', pa: 'N', ap: 'N', to: 'N',
  ma: 'NE', pi: 'NE', ce: 'NE', rn: 'NE', pb: 'NE', pe: 'NE', al: 'NE', se: 'NE', ba: 'NE',
  mg: 'SE', es: 'SE', rj: 'SE', sp: 'SE',
  pr: 'S', sc: 'S', rs: 'S',
  ms: 'CO', mt: 'CO', go: 'CO', df: 'CO',
  zz: 'EX',
};

export const NOMES_REGIAO: Record<string, string> = {
  N: 'Norte', NE: 'Nordeste', SE: 'Sudeste', S: 'Sul', CO: 'Centro-Oeste', EX: 'Exterior',
};

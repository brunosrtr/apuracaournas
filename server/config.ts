import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { availableParallelism } from 'node:os';
import type { Hiper } from './modelo/projecao.ts';

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
export const INTERVALO_COLETA_MS = Number(process.env.INTERVALO_COLETA_MS ?? 10_000);
/** Requisições simultâneas ao TSE. */
export const CONCORRENCIA = Number(process.env.CONCORRENCIA ?? 8);
/** Cenários de Monte Carlo por projeção (divididos entre as threads). */
export const SIMULACOES = Number(process.env.SIMULACOES ?? 4000);
/**
 * Produção (servidor público): a simulação de 2022 é compartilhada por todos os visitantes, então
 * fica fora da interface, não roda e a API recusa comandos para ela.
 */
export const MODO_PUBLICO = process.env.MODO_PUBLICO === '1';
/** Origens autorizadas a chamar a API de outro domínio (ex.: a interface na Vercel). Lista separada por vírgulas ou "*". */
export const CORS_ORIGEM = process.env.CORS_ORIGEM ?? '*';
/** Uma análise de insights a cada 10% de seções totalizadas (10%, 20%, …, 100%). */
export const PASSO_INSIGHTS = 0.1;
/** Threads usadas pelo modelo. */
export const THREADS = Math.max(1, Math.min(Number(process.env.THREADS ?? 4), availableParallelism() - 1));

/** Eleições presidenciais baixadas do Portal de Dados Abertos (1º e, quando houver, 2º turno). */
export const ANOS_HISTORICO = [2014, 2018, 2022, 2026];

/**
 * Bases históricas da eleição ao vivo, por turno. A primeira é a principal (e a usada nas comparações).
 * No 2º turno, a principal é o 1º turno da mesma eleição: mesmos candidatos, três semanas antes.
 */
export const BASES_AO_VIVO: Record<number, string[]> = {
  1: ['presidente-2022', 'presidente-2018'],
  2: ['presidente-2026', 'presidente-2022-2t'],
};

/** Simulação (reapresentação de 2022), por turno: resultado real e bases históricas equivalentes. */
export const SIMULACAO: Record<number, { verdade: string; bases: string[] }> = {
  1: { verdade: 'presidente-2022', bases: ['presidente-2018', 'presidente-2014'] },
  2: { verdade: 'presidente-2022-2t', bases: ['presidente-2022', 'presidente-2018'] },
};
export const TURNO_SIMULACAO = Number(process.env.TURNO_SIMULACAO ?? 2);

/**
 * Hiperparâmetros do modelo por turno (calibrados por backtest: npm run testar -- calibrar).
 * No 2º turno a base é o 1º turno da mesma eleição, e a relação entre os dois é muito estável:
 * mesmo com as incertezas estruturais em 15% das do 1º turno, a margem de 95% cobriu o resultado
 * real em 100% dos pontos dos 3 cenários de ordem.
 * Na noite de 25/10/2026 a escala de 30% se mostrou estreita: com 4% e 10% apurado a projeção
 * (54,5% ± 1,3 e 52,6% ± 0,7) ficou fora do valor para onde convergiu (~51,7%). O valor central não
 * depende da escala (51,7% de 0,3 a 1,0); só a margem. Usamos 60%, que cobriria esses pontos.
 */
const ESCALA_2T = 0.6;
export const HIPER_POR_TURNO: Record<number, Partial<Hiper>> = {
  1: {},
  2: {
    sigmaExtrap: 0.015 * ESCALA_2T,
    sigmaSemDados: 0.025 * ESCALA_2T,
    sigmaMacro: 0.025 * ESCALA_2T,
    sigmaUf: 0.03 * ESCALA_2T,
    sigmaRi: 0.02 * ESCALA_2T,
  },
};

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

// Tipos compartilhados entre servidor e interface.

// ------------------------------------------------------------ base histórica
export interface MunicipioBase {
  uf: string;
  nome: string;
  ibge: string;
  capital: boolean;
  /** Região geográfica intermediária do IBGE (agrupamento usado no modelo). */
  ri: string;
  riNome: string;
}

export interface RegistroHistorico {
  uf: string;
  aptos: number;
  comp: number;
  brancos: number;
  nulos: number;
  validos: number;
  /** votos válidos por número de candidato */
  v: Record<string, number>;
  /** fração do vencedor no 2º turno */
  seg?: number;
}

export interface BasePresidente {
  ano: number;
  /** turno a que os votos se referem */
  turno: number;
  /** número do vencedor do 2º turno (referência da variável de 2º turno) */
  vencedor2T: string;
  candidatos: { numero: string; nome: string; partido: string; votos: number }[];
  municipios: Record<string, RegistroHistorico>;
}

// ------------------------------------------------------------ apuração
export type Modo = 'ao-vivo' | 'simulacao';

export interface CorridaInfo {
  id: string;
  modo: Modo;
  eleicao: number;
  turno: number;
  /** 1 = Presidente, 3 = Governador, 5 = Senador */
  cargo: number;
  nomeCargo: string;
  /** 'br' ou a UF */
  abrangencia: string;
  /** vagas em disputa (Senado 2026: 2) */
  vagas: number;
  /** true quando há 2º turno se ninguém passar de 50% dos válidos */
  maioriaAbsoluta: boolean;
  titulo: string;
  /** ano da eleição usada como comparação ("vs 2022") */
  anoAnterior: number;
  /** rótulo da comparação: "2022" ou "1º turno" */
  rotuloAnterior: string;
}

export interface Contagem {
  secoesTotal: number;
  secoesTotalizadas: number;
  eleitorado: number;
  eleitoradoTotalizado: number;
  comparecimento: number;
  abstencao: number;
  validos: number;
  brancos: number;
  nulos: number;
  /** votos por número do candidato */
  votos: Record<string, number>;
}

export interface Candidato {
  numero: string;
  nome: string;
  nomeCompleto: string;
  partido: string;
  coligacao: string;
  sqcand: string;
  situacaoTse: string;
  destinacao: string;
  cor: string;
}

export interface Totais extends Contagem {
  percentualSecoes: number;
  atualizadoEm: string | null;
}

export interface Faixa {
  media: number;
  p025: number;
  p10: number;
  p90: number;
  p975: number;
}

export interface ProjecaoCandidato extends Faixa {
  numero: string;
  p50: number;
  /** meia-largura do intervalo de 95% (margem de erro), em fração */
  margem95: number;
  votos: Faixa;
  /** maioria absoluta: vence no 1º turno; 2º turno: vence a eleição */
  probVitoria: number;
  /** vai ao 2º turno */
  probSegundoTurno: number;
  /** termina em 1º lugar no 1º turno */
  probPrimeiro: number;
  /** projetado por agrupamento ("demais candidatos"), sem modelo próprio */
  agrupado: boolean;
}

export interface CoeficienteModelo {
  variavel: string;
  valor: number;
  erro: number;
  priori: number;
}

export interface DiagnosticoModelo {
  unidadesComDados: number;
  unidadesTotal: number;
  fracaoEleitoradoApurado: number;
  tau: Record<string, number>;
  sigmaRegiao: Record<string, number>;
  r2: Record<string, number>;
  coeficientes: Record<string, CoeficienteModelo[]>;
  variaveis: string[];
  baseHistorica: string;
  tempoMs: number;
  workers: number;
}

export interface ProjecaoRegional {
  codigo: string;
  nome: string;
  candidatos: { numero: string; media: number; p025: number; p10: number; p90: number; p975: number; probPrimeiro: number }[];
}

export interface Projecao {
  disponivel: boolean;
  motivo?: string;
  calculadaEm: number;
  simulacoes: number;
  candidatos: ProjecaoCandidato[];
  probSegundoTurno: number;
  paresSegundoTurno: { a: string; b: string; prob: number }[];
  /** diferença entre os dois primeiros projetados */
  lideranca: {
    primeiro: string;
    segundo: string;
    pontos: Faixa;
    votos: Faixa;
    probPrimeiroAFrente: number;
  } | null;
  /** distribuição simulada da fração dos dois primeiros */
  histograma: { inicio: number; fim: number; series: { numero: string; contagens: number[] }[] } | null;
  restante: {
    eleitorado: number;
    validos: Faixa;
    /** fração dos válidos restantes que o líder precisa para passar de 50% */
    liderPrecisa: number | null;
    /** fração dos válidos restantes que o líder deve receber (projeção) */
    liderProjetado: number | null;
  };
  comparecimento: Faixa;
  validos: Faixa;
  brancosNulos: Faixa;
  estados: ProjecaoRegional[];
  regioes: ProjecaoRegional[];
  diagnostico: DiagnosticoModelo | null;
}

export interface PontoHistorico {
  t: number;
  pst: number;
  observado: Record<string, number>;
  projetado: Record<string, { m: number; lo: number; hi: number }>;
  probs?: { segundoTurno: number; vitoria: Record<string, number> };
  verdade?: Record<string, number>;
}

export interface UnidadeResumo {
  codigo: string;
  nome: string;
  ibge: string;
  uf: string;
  eleitorado: number;
  pst: number;
  validos: number;
  votos: Record<string, number>;
  projetado?: Record<string, number>;
}

export interface ResumoRegional {
  codigo: string;
  nome: string;
  eleitorado: number;
  eleitoradoApurado: number;
  pst: number;
  validos: number;
  votos: Record<string, number>;
  /** frações na eleição anterior, nos mesmos municípios e na mesma proporção já apurada */
  anteriorMesmos: Record<string, number>;
  /** frações finais na eleição anterior, em toda a região */
  anteriorFinal: Record<string, number>;
}

export interface Validacao {
  final: Record<string, number>;
  pontos: { pst: number; erroProjecao: number; erroParcial: number; cobertura80: number; cobertura95: number }[];
}

export interface EstadoCorrida {
  corrida: CorridaInfo;
  versao: number;
  totais: Totais;
  candidatos: Candidato[];
  projecao: Projecao | null;
  historico: PontoHistorico[];
  validacao: Validacao | null;
  matematico: { definido: boolean; texto: string } | null;
  /** número 2026 → número do candidato equivalente na eleição anterior (mesmo partido/candidato) */
  equivalentes: Record<string, string>;
  /** nomes dos candidatos equivalentes na eleição anterior (por número) */
  nomesAnteriores: Record<string, string>;
  nacional: ResumoRegional;
  estados: ResumoRegional[];
  regioes: ResumoRegional[];
  ultimaColeta: number | null;
  erroColeta: string | null;
}

export interface StatusServidor {
  agora: number;
  aoVivo: {
    disponivel: boolean;
    pleito: string;
    corrida: CorridaInfo | null;
    ultimaColeta: number | null;
    /** intervalo entre consultas automáticas ao TSE (ms) */
    intervaloColetaMs: number;
    erro: string | null;
    requisicoes: number;
  };
  simulacao: {
    /** falso em produção: os controles ficam escondidos e a API recusa comandos */
    controlavel: boolean;
    ativa: boolean;
    relogio: string | null;
    velocidade: number;
    progresso: number;
    corrida: CorridaInfo;
  };
}

export type StatusChamada = 'aguardando' | 'indefinido' | 'provavel' | 'projetado' | 'matematico';

export interface Chamada {
  status: StatusChamada;
  titulo: string;
  detalhe: string;
}

// ------------------------------------------------------------ insights (a cada 5% apurado ou sob demanda)
export type CategoriaInsight = 'nacional' | 'virada' | 'regiao' | 'estado' | 'municipio' | 'comparecimento' | 'projecao' | 'novos';

export interface Insight {
  /** identifica o assunto (para marcar o que é novo entre análises) */
  id: string;
  categoria: CategoriaInsight;
  titulo: string;
  texto: string;
  /** relevância (ordenação) */
  intensidade: number;
  tom: 'alta' | 'baixa' | 'neutro';
  /** candidato principal do insight (cor) */
  numero?: string;
}

export interface AnaliseInsights {
  /** marco de 5% que gerou a análise (null = sob demanda) */
  marco: number | null;
  pst: number;
  criadoEm: number;
  atualizadoTse: string | null;
  /** projeção dos principais candidatos no momento (para medir estabilidade) */
  projecao: Record<string, number>;
  insights: Insight[];
}

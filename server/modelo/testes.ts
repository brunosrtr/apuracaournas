// Backtest do modelo: reapresenta a apuração do 1º turno de 2022 (bases 2018 e
// 2014) e compara a projeção com o resultado final em vários pontos da noite.
//
// Uso: npm run testar                 detalhado, configuração padrão
//      npm run testar -- grade        busca de hiperparâmetros
//      npm run testar -- ordem        testes de estresse da ordem da apuração
//      npm run testar -- crescimento  A/B: com × sem a variável de crescimento do eleitorado
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_BASE, HIPER_POR_TURNO, REGIAO_POR_UF, SIMULACAO } from '../config.ts';
import { Simulador } from '../simulacao/simulador.ts';
import { HIPER_PADRAO, projetar, type Hiper } from './projecao.ts';
import { montarCovariaveis } from './variaveis.ts';
import type { BasePresidente, MunicipioBase } from '../../shared/tipos.ts';

const ler = <T>(arq: string): T => JSON.parse(readFileSync(join(DIR_BASE, `${arq}.json`), 'utf8')) as T;
const municipios = ler<Record<string, MunicipioBase>>('municipios');
// turno do backtest: "npm run testar -- 1t" para o 1º turno; padrão: 2º turno
const TURNO = process.argv.includes('1t') ? 1 : 2;
const cfg = SIMULACAO[TURNO];
const p2022 = ler<BasePresidente>(cfg.verdade);
const bases = cfg.bases.map((b) => ler<BasePresidente>(b));
const covariaveis = montarCovariaveis(Object.keys(municipios), municipios, bases, {
  quantosPrincipal: TURNO === 2 ? 6 : 4,
  ignorarSegPrincipal: TURNO === 2,
});
const novoSim = (atrasos?: Record<string, number>) => {
  const sim = new Simulador(municipios, p2022, bases, () => {}, atrasos, { turno: TURNO, covariaveis });
  sim.corrida.hiper = HIPER_POR_TURNO[TURNO];
  return sim;
};
const nomes = Object.fromEntries(p2022.candidatos.map((c) => [c.numero, c.nome]));
const pp = (v: number) => (100 * v).toFixed(2).padStart(6);

interface Cenario { nome: string; atrasos?: Record<string, number>; minutos: number[] }
const CENARIOS: Cenario[] = [
  { nome: 'Ordem padrão (parecida com 2022)', minutos: [6, 10, 15, 20, 28, 36, 45, 60, 80, 100] },
  { nome: 'Nordeste por último', atrasos: { S: 0, SE: 0, CO: 0, N: 0, EX: 0, NE: 150 }, minutos: [8, 20, 45, 90, 140, 165, 190, 230] },
  { nome: 'Nordeste primeiro', atrasos: { NE: 0, N: 0, EX: 0, S: 60, SE: 60, CO: 60 }, minutos: [5, 15, 30, 55, 70, 90, 120, 160] },
];

interface Linha {
  pst: number;
  ne: number;
  obs: Record<string, number>;
  proj: Record<string, { m: number; marg: number; ok95: boolean }>;
  p2t: number;
}
interface Metricas {
  erroInicio: number;
  erroTodos: number;
  erroVantagem: number;
  cob80: number;
  cob95: number;
  linhas: Linha[];
}

function avaliar(sim: Simulador, minutos: number[], opcoes: { crescimento: boolean; hiper?: Partial<Hiper> }): Metricas {
  const verdade = sim.corrida.verdade!;
  const principais = Object.entries(verdade).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  const [n1, n2] = principais;
  let c80 = 0, c95 = 0, total = 0, eIni = 0, nIni = 0, eTodos = 0, nTodos = 0, eVant = 0, nVant = 0;
  const linhas: Linha[] = [];
  for (const minuto of minutos) {
    sim.irPara(minuto);
    const t = sim.corrida.totais;
    let ne = 0, neA = 0;
    for (const [cd, u] of sim.corrida.unidades) {
      if (REGIAO_POR_UF[sim.corrida.municipios[cd]?.uf] !== 'NE') continue;
      ne += u.eleitorado;
      neA += u.eleitoradoTotalizado;
    }
    const m = sim.corrida.montarEntrada({ crescimento: opcoes.crescimento });
    if (!m) continue;
    const { projecao } = projetar({ ...m.entrada, hiper: { ...m.entrada.hiper, ...opcoes.hiper } }, 2000, 42);
    if (!projecao.disponivel) continue;
    const linha: Linha = { pst: t.percentualSecoes, ne: ne ? neA / ne : 0, obs: {}, proj: {}, p2t: projecao.probSegundoTurno };
    for (const n of principais) {
      const pj = projecao.candidatos.find((x) => x.numero === n);
      if (!pj) continue;
      const v = verdade[n];
      const ok80 = v >= pj.p10 - 5e-4 && v <= pj.p90 + 5e-4;
      const ok95 = v >= pj.p025 - 5e-4 && v <= pj.p975 + 5e-4;
      c80 += +ok80; c95 += +ok95; total++;
      const erro = Math.abs(pj.media - v);
      eTodos += erro; nTodos++;
      if (t.percentualSecoes < 0.3) { eIni += erro; nIni++; }
      linha.obs[n] = t.validos ? (t.votos[n] ?? 0) / t.validos : 0;
      linha.proj[n] = { m: pj.media, marg: pj.margem95, ok95 };
    }
    if (linha.proj[n1] && linha.proj[n2]) {
      eVant += Math.abs((linha.proj[n1].m - linha.proj[n2].m) - (verdade[n1] - verdade[n2]));
      nVant++;
    }
    linhas.push(linha);
  }
  return {
    erroInicio: eIni / Math.max(1, nIni),
    erroTodos: eTodos / Math.max(1, nTodos),
    erroVantagem: eVant / Math.max(1, nVant),
    cob80: c80 / Math.max(1, total),
    cob95: c95 / Math.max(1, total),
    linhas,
  };
}

function imprimirLinhas(sim: Simulador, m: Metricas) {
  const verdade = sim.corrida.verdade!;
  const [n1, n2] = Object.entries(verdade).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  console.log(`  real: ${nomes[n1]} ${pp(verdade[n1])}% · ${nomes[n2]} ${pp(verdade[n2])}%`);
  console.log('  total  | Nordeste |  parcial 1º × 2º   |    projeção 1º ± 95%   |    projeção 2º ± 95%   | P(2º t)');
  for (const l of m.linhas) {
    const f = (n: string) => (l.proj[n] ? `${pp(l.proj[n].m)} ± ${(100 * l.proj[n].marg).toFixed(2)}${l.proj[n].ok95 ? '✓' : '✗'}` : '—');
    console.log(`${pp(l.pst)}% | ${pp(l.ne)}%  | ${pp(l.obs[n1] ?? 0)} × ${pp(l.obs[n2] ?? 0)} |  ${f(n1)}       |  ${f(n2)}       | ${(100 * l.p2t).toFixed(1).padStart(5)}%`);
  }
}

const resumo = (m: Metricas) =>
  `${(100 * m.erroInicio).toFixed(2).padStart(5)}    | ${(100 * m.erroTodos).toFixed(2).padStart(5)} | ${(100 * m.erroVantagem).toFixed(2).padStart(5)} | ${(100 * m.cob80).toFixed(0).padStart(3)}% | ${(100 * m.cob95).toFixed(0).padStart(3)}%`;

const modo = process.argv.find((a) => ['grade', 'ordem', 'crescimento', 'calibrar'].includes(a));

if (modo === 'calibrar') {
  // escala as incertezas estruturais (choques e efeitos regionais) e mede a cobertura nos 3 cenários de ordem
  console.log('escala | erro<30% | erro  | vant. | c80  | c95   (média dos 3 cenários de ordem)');
  const sims = CENARIOS.map((c) => ({ c, sim: novoSim(c.atrasos) }));
  for (const k of [1, 0.6, 0.4, 0.3, 0.2, 0.15]) {
    const hiper = {
      sigmaExtrap: HIPER_PADRAO.sigmaExtrap * k, sigmaSemDados: HIPER_PADRAO.sigmaSemDados * k,
      sigmaMacro: HIPER_PADRAO.sigmaMacro * k, sigmaUf: HIPER_PADRAO.sigmaUf * k, sigmaRi: HIPER_PADRAO.sigmaRi * k,
    };
    const ms = sims.map(({ c, sim }) => avaliar(sim, c.minutos, { crescimento: false, hiper }));
    const med = (f: (m: Metricas) => number) => ms.reduce((a, m) => a + f(m), 0) / ms.length;
    console.log(`${k.toFixed(2).padStart(5)}  | ${(100 * med((m) => m.erroInicio)).toFixed(2).padStart(5)}    | ${(100 * med((m) => m.erroTodos)).toFixed(2).padStart(5)} | ${(100 * med((m) => m.erroVantagem)).toFixed(2).padStart(5)} | ${(100 * med((m) => m.cob80)).toFixed(0).padStart(3)}% | ${(100 * med((m) => m.cob95)).toFixed(0).padStart(3)}%  ` +
      ms.map((m) => `[${(100 * m.cob95).toFixed(0)}%]`).join(' '));
  }
} else if (modo === 'crescimento') {
  console.log('A/B — variável "crescimento do eleitorado" (2022 ÷ 2018 no backtest; 2026 ÷ 2022 ao vivo)');
  console.log('Erros em pontos percentuais: média dos 4 principais (<30% apurado | todos os pontos) e da vantagem 1º−2º\n');
  console.log('cenário                          | variante        | erro<30% | erro  | vant. | c80  | c95');
  const acum = { sem: { ini: 0, todos: 0, vant: 0 }, com: { ini: 0, todos: 0, vant: 0 } };
  for (const c of CENARIOS) {
    const sim = novoSim(c.atrasos);
    const sem = avaliar(sim, c.minutos, { crescimento: false });
    const com = avaliar(sim, c.minutos, { crescimento: true });
    console.log(`${c.nome.padEnd(32)} | sem crescimento | ${resumo(sem)}`);
    console.log(`${''.padEnd(32)} | com crescimento | ${resumo(com)}`);
    for (const [k, m] of [['sem', sem], ['com', com]] as const) {
      acum[k].ini += m.erroInicio / CENARIOS.length;
      acum[k].todos += m.erroTodos / CENARIOS.length;
      acum[k].vant += m.erroVantagem / CENARIOS.length;
    }
  }
  console.log(`\nMédia dos cenários — sem: erro<30% ${(100 * acum.sem.ini).toFixed(2)} · erro ${(100 * acum.sem.todos).toFixed(2)} · vantagem ${(100 * acum.sem.vant).toFixed(2)} p.p.`);
  console.log(`                     com: erro<30% ${(100 * acum.com.ini).toFixed(2)} · erro ${(100 * acum.com.todos).toFixed(2)} · vantagem ${(100 * acum.com.vant).toFixed(2)} p.p.`);
} else if (modo === 'ordem') {
  for (const c of CENARIOS.slice(1)) {
    const sim = novoSim(c.atrasos);
    const m = avaliar(sim, c.minutos, { crescimento: sim.corrida.usarCrescimento });
    console.log(`\n${c.nome}`);
    imprimirLinhas(sim, m);
  }
} else if (modo === 'grade') {
  const sim = novoSim();
  console.log('δ     σβ    σext  | erro<30% | erro  | vant. | c80  | c95');
  for (const delta of [0.06, 0.08, 0.1]) {
    for (const sigmaBeta of [0.04, 0.06, 0.1]) {
      for (const sigmaExtrap of [0.01, 0.015, 0.022]) {
        const m = avaliar(sim, CENARIOS[0].minutos, { crescimento: sim.corrida.usarCrescimento, hiper: { delta, sigmaBeta, sigmaExtrap } });
        console.log(`${delta.toFixed(2)}  ${sigmaBeta.toFixed(2)}  ${sigmaExtrap.toFixed(3)} | ${resumo(m)}`);
      }
    }
  }
} else {
  const sim = novoSim();
  console.log(`Backtest — ${TURNO}º turno 2022 com bases ${cfg.bases.join(' e ')}`);
  console.log(`hiperparâmetros: ${JSON.stringify({ ...HIPER_PADRAO, ...HIPER_POR_TURNO[TURNO] })}\n`);
  const t0 = performance.now();
  const m = avaliar(sim, CENARIOS[0].minutos, { crescimento: sim.corrida.usarCrescimento });
  imprimirLinhas(sim, m);
  console.log(`\nErro médio dos 4 principais: ${(100 * m.erroInicio).toFixed(2)} p.p. com <30% apurado · ${(100 * m.erroTodos).toFixed(2)} p.p. em todos os pontos`);
  console.log(`Erro médio da vantagem 1º−2º: ${(100 * m.erroVantagem).toFixed(2)} p.p.`);
  console.log(`Cobertura do intervalo de 80%: ${(100 * m.cob80).toFixed(0)}% · de 95%: ${(100 * m.cob95).toFixed(0)}%`);
  console.log(`${((performance.now() - t0) / Math.max(1, m.linhas.length)).toFixed(0)} ms por ponto (1 thread, 2.000 cenários)`);
}

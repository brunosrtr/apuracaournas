// Gerador de insights da apuração presidencial, comparando com a eleição anterior.
//
// Toda comparação é feita "nos mesmos municípios, na mesma proporção já apurada": cada município
// da eleição anterior entra com o peso da fração do seu eleitorado já totalizada agora. Assim a
// variação reflete mudança de voto, não a ordem da apuração.
import type { Corrida } from './corrida.ts';
import type { AnaliseInsights, Insight } from '../shared/tipos.ts';
import { NOMES_REGIAO, NOMES_UF, REGIAO_POR_UF } from './config.ts';

interface Agregado {
  eleitorado: number;
  apurado: number;
  validos: number;
  comp: number;
  brancosNulos: number;
  votos: Record<string, number>;
  ant: { validos: number; comp: number; aptos: number; brancosNulos: number; votos: Record<string, number> };
}

const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'-])(\S)/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
const pct = (v: number) => `${(100 * v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${(100 * Math.abs(v)).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
const rel = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${(100 * Math.abs(v)).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const tom = (v: number): Insight['tom'] => (v > 0.0005 ? 'alta' : v < -0.0005 ? 'baixa' : 'neutro');
const prob = (v: number) => (v >= 0.999 ? 'mais de 99,9%' : pct(v));
/** "no Ceará", "na Bahia", "em Minas Gerais" */
const NA_UF: Record<string, string> = {
  ac: 'no Acre', al: 'em Alagoas', ap: 'no Amapá', am: 'no Amazonas', ba: 'na Bahia', ce: 'no Ceará', df: 'no Distrito Federal',
  es: 'no Espírito Santo', go: 'em Goiás', ma: 'no Maranhão', mt: 'em Mato Grosso', ms: 'em Mato Grosso do Sul', mg: 'em Minas Gerais',
  pa: 'no Pará', pb: 'na Paraíba', pr: 'no Paraná', pe: 'em Pernambuco', pi: 'no Piauí', rj: 'no Rio de Janeiro',
  rn: 'no Rio Grande do Norte', rs: 'no Rio Grande do Sul', ro: 'em Rondônia', rr: 'em Roraima', sc: 'em Santa Catarina',
  sp: 'em São Paulo', se: 'em Sergipe', to: 'no Tocantins',
};
const naUf = (u: string) => NA_UF[u] ?? `em ${NOMES_UF[u] ?? u}`;
const margem = (m: number) => (m >= 0.0005 ? ` ± ${pct(m).replace('%', ' p.p.')}` : ' (apuração concluída no estado)');

function agregar(c: Corrida, filtro: (cd: string) => boolean, pares: [string, string][]): Agregado {
  const ag: Agregado = {
    eleitorado: 0, apurado: 0, validos: 0, comp: 0, brancosNulos: 0, votos: {},
    ant: { validos: 0, comp: 0, aptos: 0, brancosNulos: 0, votos: {} },
  };
  for (const cd of c.codigos) {
    if (!filtro(cd)) continue;
    const u = c.unidades.get(cd);
    if (!u) continue;
    ag.eleitorado += u.eleitorado;
    ag.apurado += u.eleitoradoTotalizado;
    ag.validos += u.validos;
    ag.comp += u.comparecimento;
    ag.brancosNulos += u.brancos + u.nulos;
    for (const [n, v] of Object.entries(u.votos)) ag.votos[n] = (ag.votos[n] ?? 0) + v;
    const h = c.anterior.municipios[cd];
    const f = u.eleitorado > 0 ? Math.min(1, u.eleitoradoTotalizado / u.eleitorado) : 0;
    if (!h || f <= 0) continue;
    ag.ant.validos += f * h.validos;
    ag.ant.comp += f * h.comp;
    ag.ant.aptos += f * h.aptos;
    ag.ant.brancosNulos += f * (h.brancos + h.nulos);
    for (const [n, a] of pares) ag.ant.votos[n] = (ag.ant.votos[n] ?? 0) + f * (h.v[a] ?? 0);
  }
  return ag;
}

/** variação de um candidato frente ao equivalente da eleição anterior, num agregado */
function variacao(ag: Agregado, n: string) {
  if (ag.validos <= 0 || ag.ant.validos <= 0 || !(ag.ant.votos[n] > 0)) return null;
  const atual = (ag.votos[n] ?? 0) / ag.validos;
  const antes = ag.ant.votos[n] / ag.ant.validos;
  return { atual, antes, pp: atual - antes, votos: (ag.votos[n] ?? 0) / ag.ant.votos[n] - 1 };
}

export function gerarInsights(c: Corrida, marco: number | null, anterior?: AnaliseInsights): AnaliseInsights {
  const t = c.totais;
  const p = c.projecao?.disponivel ? c.projecao : null;
  const base: AnaliseInsights = {
    marco, pst: t.percentualSecoes, criadoEm: Date.now(), atualizadoTse: t.atualizadoEm,
    projecao: Object.fromEntries((p?.candidatos ?? []).filter((x) => !x.agrupado).slice(0, 4).map((x) => [x.numero, x.media])),
    insights: [],
  };
  if (t.validos <= 0) return base;

  const ano = c.anterior.ano;
  // no 2º turno a comparação é com o 1º turno da mesma eleição (mesmos candidatos)
  const t2 = c.info.turno === 2;
  const emAnt = t2 ? 'no 1º turno' : `em ${ano}`;
  const EmAnt = t2 ? 'No 1º turno' : `Em ${ano}`;
  const vsAnt = t2 ? '1º turno' : String(ano);
  const aoAnt = t2 ? 'ao 1º turno' : `a ${ano}`;
  const eq = c.equivalentes();
  const pares = Object.entries(eq);
  const cand = new Map(c.candidatos.map((x) => [x.numero, x]));
  const nome = (n: string) => titulo(cand.get(n)?.nome ?? n);
  const partido = (n: string) => cand.get(n)?.partido ?? '';
  const nomeAnt = (a: string) => titulo(c.anterior.candidatos.find((x) => x.numero === a)?.nome ?? a);
  const ins: Insight[] = [];
  const uf = (cd: string) => c.municipios[cd]?.uf;

  // ------------------------------------------------ 1. país
  const nac = agregar(c, () => true, pares);
  for (const [n, a] of pares) {
    const v = variacao(nac, n);
    if (!v) continue;
    ins.push({
      id: `nacional-${n}`, categoria: 'nacional', numero: n, tom: tom(v.pp),
      titulo: t2 ? `Brasil: ${nome(n)} ${pp(v.pp)} em relação ao 1º turno` : `Brasil: ${nome(n)} ${pp(v.pp)} em relação a ${nomeAnt(a)} em ${ano}`,
      texto: `Nos municípios já apurados, ${nome(n)} (${partido(n)}) tem ${pct(v.atual)} dos válidos; ${nomeAnt(a)} teve ${pct(v.antes)} nesses mesmos municípios ${emAnt} (${rel(v.votos)} em votos).`,
      intensidade: 200 + 300 * Math.abs(v.pp),
    });
  }

  // ------------------------------------------------ 2. macrorregiões e estados
  const regioes = [...new Set(Object.values(REGIAO_POR_UF))].filter((r) => r !== 'EX');
  const deltasRegiao: { r: string; n: string; a: string; v: NonNullable<ReturnType<typeof variacao>>; frac: number }[] = [];
  for (const r of regioes) {
    const ag = agregar(c, (cd) => (REGIAO_POR_UF[uf(cd)] ?? 'EX') === r, pares);
    if (ag.eleitorado <= 0 || ag.apurado / ag.eleitorado < 0.05 || ag.validos < 20_000) continue;
    for (const [n, a] of pares) {
      const v = variacao(ag, n);
      if (v && Math.abs(v.pp) >= 0.015) deltasRegiao.push({ r, n, a, v, frac: ag.apurado / ag.eleitorado });
    }
  }
  for (const d of deltasRegiao.sort((x, y) => Math.abs(y.v.pp) - Math.abs(x.v.pp)).slice(0, 4)) {
    ins.push({
      id: `regiao-${d.r}-${d.n}`, categoria: 'regiao', numero: d.n, tom: tom(d.v.pp),
      titulo: `${NOMES_REGIAO[d.r]}: ${partido(d.n) || nome(d.n)} ${pp(d.v.pp)} vs ${vsAnt}`,
      texto: `${nome(d.n)} tem ${pct(d.v.atual)} no ${NOMES_REGIAO[d.r]} (${pct(d.frac)} do eleitorado apurado), contra ${pct(d.v.antes)} de ${nomeAnt(d.a)} nos mesmos municípios ${emAnt} — ${rel(d.v.votos)} em votos.`,
      intensidade: 60 + 300 * Math.abs(d.v.pp),
    });
  }

  const deltasUf: { u: string; n: string; a: string; v: NonNullable<ReturnType<typeof variacao>>; frac: number }[] = [];
  const agUf = new Map<string, Agregado>();
  for (const u of Object.keys(NOMES_UF)) {
    if (u === 'zz') continue;
    const ag = agregar(c, (cd) => uf(cd) === u, pares);
    agUf.set(u, ag);
    if (ag.eleitorado <= 0 || ag.apurado / ag.eleitorado < 0.1 || ag.validos < 10_000) continue;
    for (const [n, a] of pares) {
      const v = variacao(ag, n);
      if (v && Math.abs(v.pp) >= 0.02) deltasUf.push({ u, n, a, v, frac: ag.apurado / ag.eleitorado });
    }
  }
  for (const d of deltasUf.sort((x, y) => Math.abs(y.v.pp) - Math.abs(x.v.pp)).slice(0, 6)) {
    ins.push({
      id: `estado-${d.u}-${d.n}`, categoria: 'estado', numero: d.n, tom: tom(d.v.votos),
      titulo: `${NOMES_UF[d.u]}: ${partido(d.n) || nome(d.n)} com ${rel(d.v.votos)} de votos em relação ${aoAnt}`,
      texto: `Com ${pct(d.frac)} do eleitorado apurado, ${nome(d.n)} tem ${pct(d.v.atual)} dos válidos ${naUf(d.u)}, contra ${pct(d.v.antes)} de ${nomeAnt(d.a)} nos mesmos municípios ${emAnt} (${pp(d.v.pp)}).`,
      intensidade: 50 + 250 * Math.abs(d.v.pp),
    });
  }

  // ------------------------------------------------ 3. viradas: vencedor provável diferente do da eleição anterior
  if (p) {
    for (const [u, ag] of agUf) {
      const pu = p.estados.find((e) => e.codigo === u);
      const lider = pu?.candidatos[0];
      if (!pu || !lider || ag.eleitorado <= 0 || ag.apurado / ag.eleitorado < 0.05 || lider.probPrimeiro < 0.7) continue;
      // vencedor anterior no estado
      const somas: Record<string, number> = {};
      for (const cd of c.codigos) {
        if (uf(cd) !== u) continue;
        const h = c.anterior.municipios[cd];
        if (h) for (const [a, v] of Object.entries(h.v)) somas[a] = (somas[a] ?? 0) + v;
      }
      const vencAnt = Object.entries(somas).sort((x, y) => y[1] - x[1])[0]?.[0];
      if (!vencAnt) continue;
      const equivalenteAtual = pares.find(([, a]) => a === vencAnt)?.[0];
      if (equivalenteAtual === lider.numero) continue;
      ins.push({
        id: `virada-${u}`, categoria: 'virada', numero: lider.numero, tom: 'neutro',
        titulo: `Virada ${naUf(u)}: ${nome(lider.numero)} à frente`,
        texto: `${EmAnt}, ${nomeAnt(vencAnt)} venceu ${naUf(u)}. Agora a projeção põe ${nome(lider.numero)} (${partido(lider.numero)}) em 1º, com ${pct(lider.media)}${margem((lider.p975 - lider.p025) / 2)} e chance de ${prob(lider.probPrimeiro)}.`,
        intensidade: 150 + 30 * lider.probPrimeiro,
      });
    }
  }

  // ------------------------------------------------ 4. comparecimento e brancos/nulos
  if (nac.apurado > 0 && nac.ant.aptos > 0) {
    const atual = nac.comp / nac.apurado, antes = nac.ant.comp / nac.ant.aptos;
    const d = atual - antes;
    if (Math.abs(d) >= 0.003) {
      ins.push({
        id: 'comparecimento-br', categoria: 'comparecimento', tom: tom(d),
        titulo: `Comparecimento ${d > 0 ? 'maior' : 'menor'} que ${emAnt}: ${pp(d)}`,
        texto: `Nos municípios já apurados, compareceram ${pct(atual)} dos eleitores, contra ${pct(antes)} nos mesmos municípios ${emAnt}. Abstenção ${d > 0 ? 'menor' : 'maior'} pesa mais para quem é forte onde ela muda.`,
        intensidade: 45 + 400 * Math.abs(d),
      });
    }
    const variacoesUf = [...agUf.entries()]
      .filter(([, ag]) => ag.apurado > 0 && ag.ant.aptos > 0 && ag.apurado / ag.eleitorado >= 0.1)
      .map(([u, ag]) => ({ u, d: ag.comp / ag.apurado - ag.ant.comp / ag.ant.aptos }))
      .filter((x) => Math.abs(x.d) >= 0.02)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 2);
    for (const x of variacoesUf) {
      ins.push({
        id: `comparecimento-${x.u}`, categoria: 'comparecimento', tom: tom(x.d),
        titulo: `${NOMES_UF[x.u]}: comparecimento ${pp(x.d)} vs ${vsAnt}`,
        texto: `É uma das maiores variações de comparecimento entre os estados, nos municípios já apurados.`,
        intensidade: 35 + 300 * Math.abs(x.d),
      });
    }
    if (nac.comp > 0 && nac.ant.comp > 0) {
      const bn = nac.brancosNulos / nac.comp, bnAnt = nac.ant.brancosNulos / nac.ant.comp;
      if (Math.abs(bn - bnAnt) >= 0.004) {
        ins.push({
          id: 'brancos-nulos', categoria: 'comparecimento', tom: tom(bn - bnAnt),
          titulo: `Brancos e nulos: ${pct(bn)} (${pp(bn - bnAnt)} vs ${vsAnt})`,
          texto: `${EmAnt}, brancos e nulos somaram ${pct(bnAnt)} nos mesmos municípios.`,
          intensidade: 30 + 300 * Math.abs(bn - bnAnt),
        });
      }
    }
  }

  // ------------------------------------------------ 5. cidades grandes já apuradas
  const cidades: { cd: string; n: string; a: string; v: NonNullable<ReturnType<typeof variacao>> }[] = [];
  for (const cd of c.codigos) {
    const u = c.unidades.get(cd);
    if (!u || u.eleitorado < 150_000 || u.eleitoradoTotalizado / u.eleitorado < 0.95) continue;
    const ag = agregar(c, (x) => x === cd, pares);
    for (const [n, a] of pares) {
      const v = variacao(ag, n);
      if (v && Math.abs(v.pp) >= 0.05) cidades.push({ cd, n, a, v });
    }
  }
  for (const x of cidades.sort((a, b) => Math.abs(b.v.pp) - Math.abs(a.v.pp)).slice(0, 3)) {
    const m = c.municipios[x.cd];
    ins.push({
      id: `municipio-${x.cd}-${x.n}`, categoria: 'municipio', numero: x.n, tom: tom(x.v.pp),
      titulo: `${titulo(m.nome)} (${m.uf.toUpperCase()}): ${partido(x.n) || nome(x.n)} ${pp(x.v.pp)} vs ${vsAnt}`,
      texto: `${nome(x.n)} tem ${pct(x.v.atual)}; ${t2 ? 'no 1º turno eram' : `${nomeAnt(x.a)} teve`} ${pct(x.v.antes)} ${t2 ? '' : `em ${ano} `}(${rel(x.v.votos)} em votos).`,
      intensidade: 25 + 150 * Math.abs(x.v.pp),
    });
  }

  // ------------------------------------------------ 6. candidatos sem equivalente: onde vão melhor
  for (const cd of c.candidatos) {
    if (eq[cd.numero] || cd.destinacao !== 'Válido') continue;
    const fr = (nac.votos[cd.numero] ?? 0) / nac.validos;
    if (fr < 0.02) continue;
    let melhor: { u: string; fr: number } | null = null;
    for (const [u, ag] of agUf) {
      if (ag.validos < 20_000 || ag.apurado / ag.eleitorado < 0.1) continue;
      const f = (ag.votos[cd.numero] ?? 0) / ag.validos;
      if (!melhor || f > melhor.fr) melhor = { u, fr: f };
    }
    if (!melhor) continue;
    ins.push({
      id: `novo-${cd.numero}`, categoria: 'novos', numero: cd.numero, tom: 'neutro',
      titulo: `${titulo(cd.nome)} (${cd.partido}): ${pct(fr)} no país, ${pct(melhor.fr)} em ${NOMES_UF[melhor.u]}`,
      texto: `Até agora, o melhor desempenho de ${titulo(cd.nome)} é ${naUf(melhor.u)}. Não há candidato equivalente ${emAnt} para comparar.`,
      intensidade: 30 + 200 * fr,
    });
  }

  // ------------------------------------------------ 7. parcial × projeção e estabilidade
  if (p) {
    const atrasadas = regioes
      .map((r) => {
        const ag = agregar(c, (cd) => (REGIAO_POR_UF[uf(cd)] ?? 'EX') === r, []);
        return { r, frac: ag.eleitorado > 0 ? ag.apurado / ag.eleitorado : 0, peso: ag.eleitorado };
      })
      .filter((x) => x.r !== 'EX' && x.peso > 0)
      .sort((a, b) => a.frac - b.frac);
    const reais = p.candidatos.filter((x) => !x.agrupado).slice(0, 2);
    for (const pc of reais) {
      const obs = (t.votos[pc.numero] ?? 0) / t.validos;
      const d = pc.media - obs;
      if (Math.abs(d) < 0.01) continue;
      const lenta = atrasadas[0], rapida = atrasadas.at(-1);
      ins.push({
        id: `projecao-${pc.numero}`, categoria: 'projecao', numero: pc.numero, tom: tom(d),
        titulo: `O parcial ainda ${d > 0 ? 'subestima' : 'superestima'} ${nome(pc.numero)} em ${pp(Math.abs(d)).replace('+', '')}`,
        texto: `Parcial ${pct(obs)} × projeção ${pct(pc.media)} ± ${pct(pc.margem95).replace('%', ' p.p.')}. ${lenta && rapida ? `O ${NOMES_REGIAO[lenta.r]} está ${pct(lenta.frac)} apurado, contra ${pct(rapida.frac)} no ${NOMES_REGIAO[rapida.r]}.` : ''}`,
        intensidade: 140 + 200 * Math.abs(d),
      });
    }
    if (anterior && Object.keys(anterior.projecao).length) {
      const lider = reais[0];
      const antes = lider ? anterior.projecao[lider.numero] : undefined;
      if (lider && antes !== undefined) {
        const d = lider.media - antes;
        const desde = anterior.marco !== null ? `os ${Math.round(100 * anterior.marco)}%` : 'a análise anterior';
        ins.push({
          id: 'estabilidade', categoria: 'projecao', numero: lider.numero, tom: Math.abs(d) < 0.003 ? 'neutro' : tom(d),
          titulo: Math.abs(d) < 0.003 ? `Projeção estável desde ${desde}` : `Projeção de ${nome(lider.numero)} ${pp(d)} desde ${desde}`,
          texto: `${nome(lider.numero)}: ${pct(antes)} → ${pct(lider.media)}. ${Math.abs(d) < 0.003 ? 'Os votos novos confirmaram o que o modelo já esperava.' : 'Os votos novos mudaram a expectativa do modelo.'}`,
          intensidade: 40 + 300 * Math.abs(d),
        });
      }
    }
  }

  // marca o que mudou de sentido ou apareceu desde a análise anterior (ordenação estável por relevância)
  base.insights = ins.sort((a, b) => b.intensidade - a.intensidade).slice(0, 18);
  return base;
}

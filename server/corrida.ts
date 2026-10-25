// Estado da disputa presidencial no servidor: dados apurados, projeção, histórico e resumos regionais.
import type {
  AnaliseInsights, BasePresidente, Candidato, Contagem, CorridaInfo, EstadoCorrida, MunicipioBase, PontoHistorico,
  Projecao, ProjecaoCandidato, ResumoRegional, Totais, UnidadeResumo, Validacao,
} from '../shared/tipos.ts';
import { referenciaDe, type Covariaveis } from './modelo/variaveis.ts';
import { projecaoIndisponivel, type EntradaModelo, type Hiper, type UnidadeModelo } from './modelo/projecao.ts';
import type { ExecutorModelo } from './modelo/executor.ts';
import { contagemVazia, type Unificado } from './tse/parse.ts';
import { NOMES_REGIAO, NOMES_UF, PASSO_INSIGHTS, REGIAO_POR_UF, SIMULACOES } from './config.ts';

const MAX_HISTORICO = 800;
const OUTROS = 'outros';
/** candidatos com menos que isso (e fora dos 5 primeiros) são projetados em grupo */
const LIMIAR_INDIVIDUAL = 0.01;

export class Corrida {
  info: CorridaInfo;
  versao = 0;
  totais: Totais = { ...contagemVazia(), percentualSecoes: 0, atualizadoEm: null };
  candidatos: Candidato[] = [];
  unidades = new Map<string, Contagem>();
  projecao: Projecao | null = null;
  porUnidade: Record<string, number[]> = {};
  ordemModelo: string[] = [];
  historico: PontoHistorico[] = [];
  validacao: Validacao | null = null;
  verdade: Record<string, number> | null = null;
  ultimaColeta: number | null = null;
  erroColeta: string | null = null;
  /** último acesso pela interface */
  ultimoAcesso = Date.now();
  /** cenários de Monte Carlo por projeção */
  simulacoes = SIMULACOES;
  /** hiperparâmetros do modelo (calibrados por turno) */
  hiper: Partial<Hiper> = {};
  /** análises de insights (a cada 10% apurado) */
  insights: AnaliseInsights[] = [];
  proximoMarco = PASSO_INSIGHTS;
  /**
   * Usa o crescimento do eleitorado (atual ÷ eleição-base) também como variável de preferência.
   * Desligado: no backtest (npm run testar -- crescimento) ficou neutro — erro médio 1,20 → 1,22 p.p.
   * com < 30% apurado na média dos cenários de ordem. O crescimento continua valendo no peso de
   * cada município, pois o eleitorado restante é o de 2026.
   */
  usarCrescimento = false;
  readonly municipios: Record<string, MunicipioBase>;
  readonly covariaveis: Covariaveis;
  /** eleição anterior usada nas comparações (base principal) */
  readonly anterior: BasePresidente;
  readonly codigos: string[];

  private projetando = false;
  private pendente = false;
  private cacheResumos: { versao: number; nacional: ResumoRegional; estados: ResumoRegional[]; regioes: ResumoRegional[] } | null = null;

  constructor(info: CorridaInfo, municipios: Record<string, MunicipioBase>, covariaveis: Covariaveis, anterior: BasePresidente) {
    this.info = info;
    this.municipios = municipios;
    this.covariaveis = covariaveis;
    this.anterior = anterior;
    this.codigos = Object.keys(municipios);
  }

  aplicarUnificado(u: Unificado) {
    this.totais = {
      ...u.contagem,
      percentualSecoes: u.contagem.secoesTotal > 0 ? u.contagem.secoesTotalizadas / u.contagem.secoesTotal : 0,
      atualizadoEm: u.atualizadoEm,
    };
    this.candidatos = u.candidatos;
    if (u.vagas > 0 && u.vagas !== this.info.vagas) this.info = { ...this.info, vagas: u.vagas };
    this.versao++;
  }

  /** Estado serializável (para sobreviver a reinícios do servidor durante a apuração). */
  paraDisco() {
    return {
      formato: 1,
      eleicao: this.info.eleicao,
      salvoEm: Date.now(),
      totais: this.totais,
      candidatos: this.candidatos,
      historico: this.historico,
      unidades: [...this.unidades.entries()],
      insights: this.insights,
      proximoMarco: this.proximoMarco,
    };
  }

  deDisco(d: ReturnType<Corrida['paraDisco']>): boolean {
    if (d?.formato !== 1 || d.eleicao !== this.info.eleicao) return false;
    this.totais = d.totais;
    this.candidatos = d.candidatos;
    this.historico = d.historico ?? [];
    this.unidades = new Map(d.unidades);
    this.insights = d.insights ?? [];
    // estado salvo com outro passo (ex.: 5%) é alinhado ao próximo múltiplo de 10%
    this.proximoMarco = Math.max(PASSO_INSIGHTS, Math.round(Math.ceil((d.proximoMarco ?? 0) / PASSO_INSIGHTS - 1e-9)) * PASSO_INSIGHTS);
    this.versao++;
    return true;
  }

  /** número atual → número do candidato equivalente na eleição anterior (mesmo partido ou mesmo nome) */
  equivalentes(): Record<string, string> {
    const saida: Record<string, string> = {};
    // só para Presidente: o histórico é presidencial, e o número de um candidato a governador não o liga a ele
    if (this.info.cargo !== 1) return saida;
    for (const c of this.candidatos) {
      const ref = referenciaDe(this.covariaveis, c.numero, c.nome);
      if (ref && ref.ano === this.anterior.ano) saida[c.numero] = ref.numero;
    }
    return saida;
  }

  /** Candidatos modelados individualmente; os pequenos formam o grupo "outros". */
  private grupos() {
    const t = this.totais;
    const validos = this.candidatos.filter((c) => c.destinacao === 'Válido');
    const ordem = [...validos].sort((a, b) => (t.votos[b.numero] ?? 0) - (t.votos[a.numero] ?? 0));
    const individuais: string[] = [], agrupados: string[] = [];
    ordem.forEach((c, i) => {
      const fr = t.validos > 0 ? (t.votos[c.numero] ?? 0) / t.validos : 0;
      if (individuais.length < 7 && (i < 5 || fr >= LIMIAR_INDIVIDUAL)) individuais.push(c.numero);
      else agrupados.push(c.numero);
    });
    if (agrupados.length === 1) individuais.push(agrupados.pop()!);
    return { individuais, agrupados };
  }

  /**
   * Crescimento do eleitorado de cada município (log do eleitorado atual ÷ o da eleição-base),
   * padronizado e limitado a ±4 desvios. Usa o eleitorado oficial atual informado pelo TSE.
   */
  private crescimentoPadronizado(): Map<string, number> | null {
    const bruto = new Map<string, number>();
    let peso = 0, soma = 0;
    for (const cd of this.codigos) {
      const atual = this.unidades.get(cd)?.eleitorado ?? 0;
      const antes = this.covariaveis.aptosBase.get(cd) ?? 0;
      if (atual <= 0 || antes <= 0) continue;
      const g = Math.log(atual / antes);
      bruto.set(cd, g);
      peso += atual;
      soma += atual * g;
    }
    if (peso <= 0) return null;
    const media = soma / peso;
    let variancia = 0;
    for (const [cd, g] of bruto) variancia += this.unidades.get(cd)!.eleitorado * (g - media) ** 2;
    const dp = Math.sqrt(variancia / peso);
    if (dp < 1e-6) return null;
    const z = new Map<string, number>();
    for (const [cd, g] of bruto) z.set(cd, Math.max(-4, Math.min(4, (g - media) / dp)));
    return z;
  }

  montarEntrada(opcoes: { crescimento?: boolean } = {}): { entrada: EntradaModelo; agrupados: string[] } | null {
    const cov = this.covariaveis;
    const { individuais, agrupados } = this.grupos();
    if (individuais.length < 2) return null;
    const ids = agrupados.length ? [...individuais, OUTROS] : individuais;
    const crescimento = (opcoes.crescimento ?? this.usarCrescimento) ? this.crescimentoPadronizado() : null;
    const dBase = cov.nomes.length;
    const d = dBase + (crescimento ? 1 : 0);
    const variaveis = crescimento ? [...cov.nomes, `Crescimento do eleitorado desde ${this.anterior.ano}`] : cov.nomes;
    const xDe = (cd: string) => {
      const base = cov.x.get(cd);
      if (!crescimento) return base ?? new Float64Array(dBase);
      const v = new Float64Array(d);
      if (base) v.set(base);
      v[dBase] = crescimento.get(cd) ?? 0;
      return v;
    };

    const regioes = new Map<string, number>(), estados = new Map<string, number>(), macros = new Map<string, number>();
    const unidades: UnidadeModelo[] = [];
    let validObs = 0;
    const votosObs = new Float64Array(ids.length);
    for (const cd of this.codigos) {
      const mun = this.municipios[cd];
      const cont = this.unidades.get(cd);
      const eleitorado = cont?.eleitorado || cov.aptosBase.get(cd) || 0;
      if (eleitorado <= 0) continue;
      const macro = REGIAO_POR_UF[mun.uf] ?? 'EX';
      if (!regioes.has(mun.ri)) regioes.set(mun.ri, regioes.size);
      if (!estados.has(mun.uf)) estados.set(mun.uf, estados.size);
      if (!macros.has(macro)) macros.set(macro, macros.size);
      const votos = new Float64Array(ids.length);
      let soma = 0;
      if (cont) {
        individuais.forEach((n, i) => { votos[i] = cont.votos[n] ?? 0; });
        if (agrupados.length) votos[ids.length - 1] = agrupados.reduce((a, n) => a + (cont.votos[n] ?? 0), 0);
        for (let i = 0; i < ids.length; i++) { soma += votos[i]; votosObs[i] += votos[i]; }
      }
      validObs += soma;
      unidades.push({
        codigo: cd,
        regiao: regioes.get(mun.ri)!,
        estado: estados.get(mun.uf)!,
        macro: macros.get(macro)!,
        x: xDe(cd),
        compBase: cov.compBase.get(cd) ?? NaN,
        validoBase: cov.validoBase.get(cd) ?? NaN,
        eleitorado,
        eleitoradoApurado: cont?.eleitoradoTotalizado ?? 0,
        comparecimento: cont?.comparecimento ?? 0,
        // soma dos candidatos modelados: mantém as frações consistentes
        validos: soma,
        votos,
      });
    }

    // priori de swing logístico para quem tem equivalente na base histórica (só Presidente)
    const priori = ids.map((id, i) => {
      const v = new Float64Array(d);
      if (id === OUTROS || this.info.cargo !== 1) return v;
      const cand = this.candidatos.find((c) => c.numero === id);
      const ref = referenciaDe(cov, id, cand?.nome ?? '');
      if (!ref) return v;
      const pAtual = validObs > 0 ? Math.min(0.95, Math.max(0.005, votosObs[i] / validObs)) : ref.fracaoNacional;
      const pBase = ref.fracaoNacional;
      v[ref.indice] = (ref.dp * pAtual * (1 - pAtual)) / (pBase * (1 - pBase));
      return v;
    });

    return {
      agrupados,
      entrada: {
        candidatos: ids,
        reais: ids.map((id) => id !== OUTROS),
        variaveis,
        priori,
        unidades,
        nRegioes: regioes.size,
        nEstados: estados.size,
        nMacros: macros.size,
        nomesEstados: [...estados.keys()],
        nomesMacros: [...macros.keys()],
        maioriaAbsoluta: this.info.maioriaAbsoluta,
        vagas: this.info.vagas,
        baseHistorica: cov.descricao,
        hiper: this.hiper,
      },
    };
  }

  /** Divide a projeção do grupo "outros" entre seus candidatos, na proporção apurada. */
  private expandirAgrupados(p: Projecao, agrupados: string[]): Projecao {
    const grupo = p.candidatos.find((c) => c.numero === OUTROS);
    if (!grupo) return p;
    const votos = agrupados.map((n) => this.totais.votos[n] ?? 0);
    const total = votos.reduce((a, b) => a + b, 0);
    const expandidos: ProjecaoCandidato[] = agrupados.map((numero, i) => {
      const r = total > 0 ? votos[i] / total : 1 / agrupados.length;
      return {
        ...grupo,
        numero,
        media: grupo.media * r, p025: grupo.p025 * r, p10: grupo.p10 * r, p50: grupo.p50 * r,
        p90: grupo.p90 * r, p975: grupo.p975 * r, margem95: grupo.margem95 * r,
        votos: {
          media: grupo.votos.media * r, p025: grupo.votos.p025 * r, p10: grupo.votos.p10 * r,
          p90: grupo.votos.p90 * r, p975: grupo.votos.p975 * r,
        },
        probVitoria: 0,
        probSegundoTurno: 0,
        probPrimeiro: 0,
        agrupado: true,
      };
    });
    return { ...p, candidatos: [...p.candidatos.filter((c) => c.numero !== OUTROS), ...expandidos].sort((a, b) => b.media - a.media) };
  }

  /** Agenda uma projeção; se já houver uma rodando, marca como pendente. */
  async projetar(executor: ExecutorModelo, aoTerminar: () => void) {
    if (this.projetando) { this.pendente = true; return; }
    this.projetando = true;
    try {
      do {
        this.pendente = false;
        const montado = this.montarEntrada();
        if (!montado) break;
        const { projecao, porUnidade } = await executor.rodar(montado.entrada, this.simulacoes, this.versao * 7919 + 17);
        this.projecao = projecao.disponivel ? this.expandirAgrupados(projecao, montado.agrupados) : projecao;
        this.porUnidade = porUnidade;
        this.ordemModelo = montado.entrada.candidatos;
        this.registrarHistorico();
        this.versao++;
        aoTerminar();
      } while (this.pendente);
    } catch (e) {
      console.error(`[${this.info.id}] falha na projeção:`, e);
      this.projecao = projecaoIndisponivel('Falha ao calcular a projeção; nova tentativa na próxima atualização.');
    } finally {
      this.projetando = false;
    }
  }

  registrarHistorico() {
    const t = this.totais;
    if (t.validos <= 0) return;
    const observado: Record<string, number> = {};
    for (const [n, v] of Object.entries(t.votos)) observado[n] = v / t.validos;
    const projetado: PontoHistorico['projetado'] = {};
    let probs: PontoHistorico['probs'];
    const p = this.projecao?.disponivel ? this.projecao : null;
    if (p) {
      for (const c of p.candidatos) if (!c.agrupado) projetado[c.numero] = { m: c.media, lo: c.p025, hi: c.p975 };
      probs = {
        segundoTurno: p.probSegundoTurno,
        vitoria: Object.fromEntries(p.candidatos.filter((c) => c.probVitoria > 0.0005).map((c) => [c.numero, c.probVitoria])),
      };
    }
    const ponto: PontoHistorico = { t: Date.now(), pst: t.percentualSecoes, observado, projetado, probs };
    if (this.verdade) {
      ponto.verdade = this.verdade;
      if (this.validacao && p) {
        const principais = Object.entries(this.verdade).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
        let erroProj = 0, erroParc = 0, c80 = 0, c95 = 0;
        for (const n of principais) {
          const v = this.verdade[n];
          const pj = p.candidatos.find((c) => c.numero === n);
          erroProj += Math.abs((pj?.media ?? 0) - v);
          erroParc += Math.abs((observado[n] ?? 0) - v);
          if (pj && v >= pj.p10 - 5e-4 && v <= pj.p90 + 5e-4) c80++;
          if (pj && v >= pj.p025 - 5e-4 && v <= pj.p975 + 5e-4) c95++;
        }
        const k = principais.length;
        const pontos = this.validacao.pontos.filter((x) => Math.abs(x.pst - ponto.pst) > 1e-6);
        pontos.push({ pst: ponto.pst, erroProjecao: erroProj / k, erroParcial: erroParc / k, cobertura80: c80 / k, cobertura95: c95 / k });
        this.validacao = { ...this.validacao, pontos };
      }
    }
    const ultimo = this.historico.at(-1);
    if (ultimo && Math.abs(ultimo.pst - ponto.pst) < 1e-6) this.historico[this.historico.length - 1] = ponto;
    else this.historico.push(ponto);
    if (this.historico.length > MAX_HISTORICO) {
      this.historico = this.historico.filter((_, i) => i >= MAX_HISTORICO / 2 || i % 2 === 0);
    }
  }

  matematico(): EstadoCorrida['matematico'] {
    const t = this.totais;
    if (t.secoesTotalizadas === 0) return null;
    const falta = Math.max(0, t.eleitorado - t.eleitoradoTotalizado);
    const nome = (n: string) => this.candidatos.find((c) => c.numero === n)?.nome ?? n;
    const ord = Object.entries(t.votos).sort((a, b) => b[1] - a[1]);
    if (ord.length < 2) return null;
    if (this.info.maioriaAbsoluta) {
      const metade = (t.validos + falta) / 2;
      if (ord[0][1] > metade) return { definido: true, texto: `${nome(ord[0][0])} está matematicamente eleito no 1º turno.` };
      if (ord.every(([, v]) => v + falta <= metade)) {
        if (ord.length < 3 || ord[2][1] + falta < ord[1][1]) {
          return { definido: true, texto: `2º turno matematicamente definido: ${nome(ord[0][0])} × ${nome(ord[1][0])}.` };
        }
        return { definido: true, texto: 'Haverá 2º turno: nenhum candidato pode mais atingir a maioria absoluta.' };
      }
    } else {
      const k = Math.max(1, this.info.vagas);
      if (ord.length > k && ord[k - 1][1] - ord[k][1] > falta) {
        return k === 1
          ? { definido: true, texto: `${nome(ord[0][0])} está matematicamente eleito.` }
          : { definido: true, texto: `Matematicamente eleitos: ${ord.slice(0, k).map(([n]) => nome(n)).join(' e ')}.` };
      }
    }
    return { definido: false, texto: `Faltam ${falta.toLocaleString('pt-BR')} eleitores a apurar.` };
  }

  /** Resumos observados por país, UF e macrorregião, com a eleição anterior nos mesmos municípios. */
  private resumos() {
    if (this.cacheResumos?.versao === this.versao) return this.cacheResumos;
    const pares = Object.entries(this.equivalentes());
    interface Acum {
      codigo: string; nome: string; eleitorado: number; eleitoradoApurado: number; validos: number; votos: Record<string, number>;
      secT: number; secA: number; antM: Record<string, number>; antMV: number; antF: Record<string, number>; antFV: number;
    }
    const novo = (codigo: string, nome: string): Acum => ({
      codigo, nome, eleitorado: 0, eleitoradoApurado: 0, validos: 0, votos: {},
      secT: 0, secA: 0, antM: {}, antMV: 0, antF: {}, antFV: 0,
    });
    const obter = (m: Map<string, Acum>, codigo: string, nome: string) => {
      let r = m.get(codigo);
      if (!r) { r = novo(codigo, nome); m.set(codigo, r); }
      return r;
    };
    const nac = novo('br', 'Brasil');
    const ufs = new Map<string, Acum>(), macs = new Map<string, Acum>();
    for (const cd of this.codigos) {
      const mun = this.municipios[cd];
      const c = this.unidades.get(cd);
      const h = this.anterior.municipios[cd];
      const macro = REGIAO_POR_UF[mun.uf] ?? 'EX';
      const alvos = [nac, obter(ufs, mun.uf, NOMES_UF[mun.uf] ?? mun.uf), obter(macs, macro, NOMES_REGIAO[macro] ?? macro)];
      const f = c && c.eleitorado > 0 ? Math.min(1, c.eleitoradoTotalizado / c.eleitorado) : 0;
      for (const r of alvos) {
        if (c) {
          r.eleitorado += c.eleitorado;
          r.eleitoradoApurado += c.eleitoradoTotalizado;
          r.secT += c.secoesTotal;
          r.secA += c.secoesTotalizadas;
          r.validos += c.validos;
          for (const [n, v] of Object.entries(c.votos)) r.votos[n] = (r.votos[n] ?? 0) + v;
        }
        if (h) {
          r.antFV += h.validos;
          r.antMV += f * h.validos;
          for (const [atual, ant] of pares) {
            r.antF[atual] = (r.antF[atual] ?? 0) + (h.v[ant] ?? 0);
            r.antM[atual] = (r.antM[atual] ?? 0) + f * (h.v[ant] ?? 0);
          }
        }
      }
    }
    const fechar = (r: Acum): ResumoRegional => ({
      codigo: r.codigo, nome: r.nome, eleitorado: r.eleitorado, eleitoradoApurado: r.eleitoradoApurado,
      pst: r.secT > 0 ? r.secA / r.secT : 0, validos: r.validos, votos: r.votos,
      anteriorMesmos: r.antMV > 0 ? Object.fromEntries(Object.entries(r.antM).map(([n, v]) => [n, v / r.antMV])) : {},
      anteriorFinal: r.antFV > 0 ? Object.fromEntries(Object.entries(r.antF).map(([n, v]) => [n, v / r.antFV])) : {},
    });
    const ordemMacro = ['N', 'NE', 'CO', 'SE', 'S', 'EX'];
    this.cacheResumos = {
      versao: this.versao,
      nacional: fechar(nac),
      estados: [...ufs.values()].map(fechar).sort((a, b) => b.eleitorado - a.eleitorado),
      regioes: [...macs.values()].map(fechar).sort((a, b) => ordemMacro.indexOf(a.codigo) - ordemMacro.indexOf(b.codigo)),
    };
    return this.cacheResumos;
  }

  estado(): EstadoCorrida {
    this.ultimoAcesso = Date.now();
    const r = this.resumos();
    const equivalentes = this.equivalentes();
    const nomesAnteriores = Object.fromEntries(Object.values(equivalentes).map((n) => [n, this.anterior.candidatos.find((c) => c.numero === n)?.nome ?? n]));
    return {
      corrida: this.info,
      versao: this.versao,
      totais: this.totais,
      candidatos: this.candidatos,
      projecao: this.projecao,
      historico: this.historico,
      validacao: this.validacao,
      matematico: this.matematico(),
      equivalentes,
      nomesAnteriores,
      nacional: r.nacional,
      estados: r.estados,
      regioes: r.regioes,
      ultimaColeta: this.ultimaColeta,
      erroColeta: this.erroColeta,
    };
  }

  resumoUnidades(): UnidadeResumo[] {
    const saida: UnidadeResumo[] = [];
    const ordem = this.ordemModelo;
    for (const cd of this.codigos) {
      const mun = this.municipios[cd];
      const c = this.unidades.get(cd);
      const proj = this.porUnidade[cd];
      let projetado: Record<string, number> | undefined;
      if (proj) {
        projetado = {};
        const idx = proj.map((v, i) => [v, i] as const).filter(([, i]) => ordem[i] !== OUTROS).sort((a, b) => b[0] - a[0]).slice(0, 3);
        for (const [v, i] of idx) projetado[ordem[i]] = v;
      }
      saida.push({
        codigo: cd,
        nome: mun.nome,
        ibge: mun.ibge,
        uf: mun.uf,
        eleitorado: c?.eleitorado || this.covariaveis.aptosBase.get(cd) || 0,
        pst: c && c.secoesTotal > 0 ? c.secoesTotalizadas / c.secoesTotal : 0,
        validos: c?.validos ?? 0,
        votos: c?.votos ?? {},
        projetado,
      });
    }
    return saida;
  }
}

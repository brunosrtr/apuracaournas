// Simulação da noite de apuração presidencial de 2022 (1º ou 2º turno).
// O resultado real de 2022 (por município) é a "verdade"; o modelo só enxerga a
// apuração parcial simulada e as bases históricas equivalentes às que usa ao vivo
// (no 2º turno: o 1º turno da mesma eleição). Serve para demonstrar e validar o modelo.
//
// A ordem de apuração imita o padrão real: Sul/Sudeste/Centro-Oeste chegam antes,
// Norte/Nordeste e exterior depois, cidades grandes demoram mais e as primeiras
// seções de cada município não são uma amostra perfeitamente representativa.
import { Corrida } from '../corrida.ts';
import { Aleatorio } from '../modelo/algebra.ts';
import { montarCovariaveis, type Covariaveis } from '../modelo/variaveis.ts';
import { atribuirCores } from '../../shared/cores.ts';
import { PASSO_INSIGHTS, REGIAO_POR_UF } from '../config.ts';
import type { BasePresidente, Candidato, Contagem, CorridaInfo, MunicipioBase, RegistroHistorico } from '../../shared/tipos.ts';

/** minutos após as 17h em que cada macrorregião começa a ser totalizada (padrão parecido com 2022) */
export const ATRASO_REGIAO: Record<string, number> = { S: 0, SE: 4, CO: 6, NE: 16, N: 24, EX: 55 };

interface Plano {
  cd: string;
  h: RegistroHistorico;
  secoes: number;
  inicio: number;
  duracao: number;
  final: Float64Array;
  vies: Float64Array;
}

export function infoSimulacao(turno: number, anoAnterior: number): CorridaInfo {
  return {
    id: `sim-presidente-2022-${turno}t`,
    modo: 'simulacao',
    eleicao: turno === 2 ? 545 : 544,
    turno,
    cargo: 1,
    nomeCargo: 'Presidente',
    abrangencia: 'br',
    vagas: 1,
    maioriaAbsoluta: turno === 1,
    titulo: `Presidente · ${turno}º turno 2022 (simulação)`,
    anoAnterior,
    rotuloAnterior: turno === 2 ? '1º turno' : String(anoAnterior),
  };
}

export class Simulador {
  corrida: Corrida;
  ativa = false;
  /** minutos simulados por segundo real */
  velocidade = 1.5;
  minuto = 0;
  readonly turno: number;
  private planos: Plano[] = [];
  private numeros: string[];
  private fim = 0;
  private timer: NodeJS.Timeout | null = null;
  private aoMudar: (c: Corrida) => void;

  /**
   * @param verdade resultado real (2022) que a simulação reapresenta
   * @param bases eleições anteriores usadas como histórico (2018, 2014)
   * @param atrasos ordem da apuração por macrorregião (testes de estresse: ex. Nordeste por último)
   */
  constructor(
    municipios: Record<string, MunicipioBase>,
    verdade: BasePresidente,
    bases: BasePresidente[],
    aoMudar: (c: Corrida) => void,
    atrasos: Record<string, number> = ATRASO_REGIAO,
    opcoes: { turno?: number; covariaveis?: Covariaveis } = {},
  ) {
    this.aoMudar = aoMudar;
    this.turno = opcoes.turno ?? verdade.turno ?? 1;
    const codigos = Object.keys(verdade.municipios).filter((cd) => municipios[cd]);
    const munSim: Record<string, MunicipioBase> = {};
    for (const cd of codigos) munSim[cd] = municipios[cd];
    const cov = opcoes.covariaveis ?? montarCovariaveis(codigos, munSim, bases);
    this.corrida = new Corrida(infoSimulacao(this.turno, bases[0].ano), munSim, cov, bases[0]);

    this.numeros = verdade.candidatos.map((c) => c.numero);
    const cores = atribuirCores(this.numeros);
    const candidatos: Candidato[] = verdade.candidatos.map((c) => ({
      numero: c.numero, nome: c.nome, nomeCompleto: c.nome, partido: c.partido, coligacao: c.partido,
      sqcand: '', situacaoTse: '', destinacao: 'Válido', cor: cores[c.numero],
    }));
    this.corrida.candidatos = candidatos;
    const totalValidos = verdade.candidatos.reduce((a, c) => a + c.votos, 0);
    this.corrida.verdade = Object.fromEntries(verdade.candidatos.map((c) => [c.numero, c.votos / totalValidos]));

    const rng = new Aleatorio(2022);
    for (const cd of codigos) {
      const h = verdade.municipios[cd];
      if (h.aptos <= 0 || h.validos <= 0) continue;
      const regiao = REGIAO_POR_UF[h.uf] ?? 'SE';
      const exp = -Math.log(1 - rng.uniforme());
      const inicio = (atrasos[regiao] ?? 0) + 5 * exp + 6 * rng.uniforme();
      const duracao = (6 + 28 * Math.log10(1 + h.aptos / 20_000)) * (0.6 + 0.8 * rng.uniforme());
      const final = new Float64Array(this.numeros.length);
      const vies = new Float64Array(this.numeros.length);
      this.numeros.forEach((n, i) => {
        const p = (h.v[n] ?? 0) / h.validos;
        final[i] = p;
        vies[i] = 0.08 * Math.sqrt(p * (1 - p)) * rng.normal();
      });
      this.planos.push({ cd, h, secoes: Math.max(1, Math.round(h.aptos / 330)), inicio, duracao, final, vies });
      this.fim = Math.max(this.fim, inicio + duracao);
    }
    this.reiniciar();
  }

  get progresso() { return Math.min(1, this.minuto / this.fim); }

  relogio(): string {
    const total = 17 * 60 + Math.floor(this.minuto);
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${this.turno === 2 ? '30' : '02'}/10/2022 ${hh}:${mm}`;
  }

  iniciar() {
    if (this.minuto >= this.fim) this.reiniciar();
    if (this.timer) return;
    this.ativa = true;
    const passoMs = 1500;
    this.timer = setInterval(() => {
      this.minuto = Math.min(this.fim, this.minuto + (this.velocidade * passoMs) / 1000);
      this.atualizar();
      if (this.minuto >= this.fim) this.pausar();
    }, passoMs);
  }

  pausar() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ativa = false;
    this.aoMudar(this.corrida);
  }

  reiniciar() {
    const rodando = !!this.timer;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.minuto = 0;
    this.limparDerivados();
    this.atualizar();
    if (rodando) this.iniciar();
  }

  /** Posiciona a simulação em um instante (minutos após as 17h). */
  irPara(minuto: number) {
    const alvo = Math.max(0, Math.min(this.fim, minuto));
    // voltar no tempo invalida histórico, insights e validação calculados "no futuro"
    if (alvo < this.minuto) this.limparDerivados();
    this.minuto = alvo;
    this.atualizar();
  }

  private limparDerivados() {
    this.corrida.historico = [];
    this.corrida.projecao = null;
    this.corrida.porUnidade = {};
    this.corrida.validacao = { final: this.corrida.verdade ?? {}, pontos: [] };
    this.corrida.insights = [];
    this.corrida.proximoMarco = PASSO_INSIGHTS;
  }

  get duracaoTotal() { return this.fim; }

  private atualizar() {
    const C = this.numeros.length;
    const tot: Contagem = {
      secoesTotal: 0, secoesTotalizadas: 0, eleitorado: 0, eleitoradoTotalizado: 0, comparecimento: 0,
      abstencao: 0, validos: 0, brancos: 0, nulos: 0, votos: {},
    };
    for (const n of this.numeros) tot.votos[n] = 0;
    const fr = new Float64Array(C);
    for (const pl of this.planos) {
      const bruto = Math.min(1, Math.max(0, (this.minuto - pl.inicio) / pl.duracao));
      const secoesApur = Math.floor(bruto * pl.secoes + 1e-9);
      const f = secoesApur / pl.secoes;
      const h = pl.h;
      const cont: Contagem = {
        secoesTotal: pl.secoes,
        secoesTotalizadas: secoesApur,
        eleitorado: h.aptos,
        eleitoradoTotalizado: Math.round(h.aptos * f),
        comparecimento: Math.round(h.comp * f),
        abstencao: Math.round((h.aptos - h.comp) * f),
        validos: 0,
        brancos: Math.round(h.brancos * f),
        nulos: Math.round(h.nulos * f),
        votos: {},
      };
      if (f > 0) {
        let soma = 0;
        for (let i = 0; i < C; i++) { fr[i] = Math.max(0, pl.final[i] + pl.vies[i] * (1 - f)); soma += fr[i]; }
        const validos = Math.round(h.validos * f);
        let distrib = 0;
        for (let i = 0; i < C; i++) {
          const v = Math.round((fr[i] / soma) * validos);
          cont.votos[this.numeros[i]] = v;
          distrib += v;
        }
        cont.validos = distrib;
      }
      this.corrida.unidades.set(pl.cd, cont);
      tot.secoesTotal += cont.secoesTotal;
      tot.secoesTotalizadas += cont.secoesTotalizadas;
      tot.eleitorado += cont.eleitorado;
      tot.eleitoradoTotalizado += cont.eleitoradoTotalizado;
      tot.comparecimento += cont.comparecimento;
      tot.abstencao += cont.abstencao;
      tot.validos += cont.validos;
      tot.brancos += cont.brancos;
      tot.nulos += cont.nulos;
      for (const n of this.numeros) tot.votos[n] += cont.votos[n] ?? 0;
    }
    const candidatos = [...this.corrida.candidatos].sort((a, b) => tot.votos[b.numero] - tot.votos[a.numero]);
    this.corrida.aplicarUnificado({ contagem: tot, candidatos, vagas: 1, atualizadoEm: this.relogio() });
    this.corrida.ultimaColeta = Date.now();
    this.aoMudar(this.corrida);
  }
}

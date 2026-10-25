// Coleta incremental dos resultados oficiais no TSE (Presidente no Brasil; Governador e Senador por UF).
//
// A cada ciclo:
//   1. baixa o arquivo "unificado" da abrangência (BR ou UF) → totais oficiais;
//   2. baixa o andamento (…-ab.json) e só busca o JSON de um município quando ele mudou.
//      No caso nacional, primeiro o andamento por UF; só as UFs que mudaram são abertas.
// Assim o volume de requisições acompanha o ritmo da totalização.
import { ClienteTse, modoArquivos } from './cliente.ts';
import { caminhos, contagemVazia, lerAndamento, lerUnificado, type AndamentoUnidade, type TseAndamento, type TseUnificado } from './parse.ts';
import { Corrida } from '../corrida.ts';
import { CICLO, INTERVALO_COLETA_MS, URL_TSE } from '../config.ts';
import type { CorridaInfo } from '../../shared/tipos.ts';

interface ConfigEleicoes {
  pl: { cd: string; c: string; dt: string; e: { cd: string; t: string; abr: { cd: string; cp: { cd: string }[] }[] }[] }[];
}

const REBUSCA_PARCIAL_MS = 30_000;
const paraData = (dt: string) => { const [d, m, a] = dt.split('/'); return `${a}-${m}-${d}`; };

/** Descobre na configuração oficial a eleição presidencial mais recente do ciclo (1º ou 2º turno). */
export async function descobrirEleicao(cliente: ClienteTse): Promise<{ info: CorridaInfo; pleito: string }> {
  const r = await cliente.json<ConfigEleicoes>(caminhos.config(URL_TSE), false);
  if (r.tipo !== 'novo') throw new Error('configuração indisponível');
  const hoje = new Date().toISOString().slice(0, 10);
  const temCargo = (e: ConfigEleicoes['pl'][number]['e'][number], cargo: string) => e.abr.some((a) => a.cp.some((c) => c.cd === cargo));
  const candidatas = r.dados.pl
    .filter((p) => p.c === CICLO)
    .flatMap((p) => p.e.filter((e) => temCargo(e, '1')).map((e) => ({ p, e })))
    .sort((a, b) => paraData(a.p.dt).localeCompare(paraData(b.p.dt)));
  const escolha = candidatas.filter((x) => paraData(x.p.dt) <= hoje).at(-1) ?? candidatas[0];
  if (!escolha) throw new Error(`nenhuma eleição presidencial do ciclo ${CICLO} na configuração`);
  const turno = Number(escolha.e.t) || 1;
  const eleicao = Number(escolha.e.cd);
  return {
    pleito: `${escolha.p.dt} · eleição ${eleicao}`,
    info: {
      id: `presidente-${eleicao}`,
      modo: 'ao-vivo',
      eleicao,
      turno,
      cargo: 1,
      nomeCargo: 'Presidente',
      abrangencia: 'br',
      vagas: 1,
      maioriaAbsoluta: turno === 1,
      titulo: `Presidente · ${turno}º turno`,
      anoAnterior: 2022,
      rotuloAnterior: turno === 2 ? '1º turno' : '2022',
    },
  };
}

export class ColetorAoVivo {
  readonly cliente: ClienteTse;
  readonly corrida: Corrida;
  erro: string | null = null;
  ultimaColeta: number | null = null;

  private aoMudar: () => void;
  private projetar: () => void;
  private ativo: () => boolean;
  private intervaloMs: number;
  private assinaturaUf = new Map<string, string>();
  private buscado = new Map<string, { assinatura: string; quando: number }>();
  private ultimoAb = new Map<string, AndamentoUnidade[]>();
  private coletando = false;
  /** conteúdo do arquivo nacional e quando ele mudou pela última vez (detecção de CDN parada) */
  private assinaturaNacional = '';
  private mudouEm = Date.now();

  /** @param ativo coleta só enquanto devolver true (disputas estaduais: enquanto alguém as vê) */
  constructor(
    cliente: ClienteTse, corrida: Corrida, aoMudar: () => void, projetar: () => void,
    ativo: () => boolean = () => true, intervaloMs = INTERVALO_COLETA_MS,
  ) {
    this.intervaloMs = intervaloMs;
    this.cliente = cliente;
    this.corrida = corrida;
    this.aoMudar = aoMudar;
    this.projetar = projetar;
    this.ativo = ativo;
  }

  /** @param atrasoMs espera inicial (escalonar o início de muitos coletores) */
  iniciar(atrasoMs = 0) {
    setTimeout(() => void this.laco(), atrasoMs);
  }

  private async laco() {
    for (;;) {
      const inicio = Date.now();
      if (this.ativo()) await this.coletar();
      const espera = Math.max(2_000, this.intervaloMs - (Date.now() - inicio));
      await new Promise((ok) => setTimeout(ok, espera));
    }
  }

  private async andamento(uf: string): Promise<AndamentoUnidade[]> {
    const url = caminhos.andamento(URL_TSE, CICLO, this.corrida.info.eleicao, uf);
    const r = await this.cliente.json<TseAndamento>(url, true, true);
    if (r.tipo === 'novo') this.ultimoAb.set(url, lerAndamento(r.dados));
    return this.ultimoAb.get(url) ?? [];
  }

  private async coletar() {
    if (this.coletando) return;
    this.coletando = true;
    const c = this.corrida;
    const { eleicao, cargo, abrangencia } = c.info;
    try {
      const r = await this.cliente.json<TseUnificado>(caminhos.unificado(URL_TSE, CICLO, eleicao, abrangencia, cargo), true, true);
      if (r.tipo === 'novo') {
        const ass = `${r.dados.dg}|${r.dados.hg}|${r.dados.s?.st}`;
        if (ass !== this.assinaturaNacional) { this.assinaturaNacional = ass; this.mudouEm = Date.now(); }
        c.aplicarUnificado(lerUnificado(r.dados));
        c.registrarHistorico();
        this.aoMudar(); // totais oficiais já na tela; municípios e projeção chegam em seguida
      }
      if (abrangencia === 'br') await this.conferirCacheParado();
      c.erroColeta = r.tipo === 'ausente' ? 'O TSE ainda não publicou os dados desta eleição.' : null;
      if (abrangencia === 'br' && !modoArquivos.assinado) await this.conferirVersaoAssinada();
      const mudou = await this.coletarMunicipios();
      c.ultimaColeta = this.ultimaColeta = Date.now();
      this.erro = null;
      if (mudou || r.tipo === 'novo') {
        this.aoMudar();
        this.projetar();
      }
    } catch (e) {
      c.erroColeta = this.erro = `Falha ao consultar o TSE: ${(e as Error).message}`;
      console.error(`[${c.info.id}]`, c.erroColeta);
    } finally {
      this.coletando = false;
    }
  }

  /**
   * Se o arquivo nacional está parado há mais de 3 min com a apuração incompleta, pede uma cópia
   * sem cache. Se ela for mais nova, a CDN estava desatualizada: ignora o cache por 10 min.
   */
  private async conferirCacheParado() {
    const c = this.corrida;
    if (c.totais.percentualSecoes >= 0.999 || Date.now() - this.mudouEm < 180_000 || Date.now() < modoArquivos.furarCacheAte) return;
    const { eleicao, cargo } = c.info;
    try {
      const r = await this.cliente.json<TseUnificado>(caminhos.unificado(URL_TSE, CICLO, eleicao, 'br', cargo), false, true);
      if (r.tipo !== 'novo') return;
      const fresco = lerUnificado(r.dados);
      if (fresco.contagem.secoesTotalizadas > c.totais.secoesTotalizadas) {
        modoArquivos.furarCacheAte = Date.now() + 10 * 60_000;
        console.log(`[${new Date().toLocaleTimeString('pt-BR')}] CDN do TSE desatualizada (${c.totais.secoesTotalizadas} → ${fresco.contagem.secoesTotalizadas} seções sem cache): ignorando o cache por 10 min.`);
        c.aplicarUnificado(fresco);
        c.registrarHistorico();
        this.assinaturaNacional = `${r.dados.dg}|${r.dados.hg}|${r.dados.s?.st}`;
        this.mudouEm = Date.now();
        this.aoMudar();
      } else {
        this.mudouEm = Date.now() - 120_000; // confere de novo daqui a ~1 min
      }
    } catch { /* conferência opcional */ }
  }

  /** Compara a geração (dg/hg) do .json e do .jws nacionais; se o assinado estiver à frente, passa a usá-lo. */
  private async conferirVersaoAssinada() {
    const { eleicao, cargo } = this.corrida.info;
    const json = caminhos.unificado(URL_TSE, CICLO, eleicao, 'br', cargo);
    const instante = (d: { dg?: string; hg?: string } | null) => {
      if (!d?.dg || !d.hg) return 0;
      const [dia, mes, ano] = d.dg.split('/');
      return Date.parse(`${ano}-${mes}-${dia}T${d.hg}`) || 0;
    };
    try {
      const [a, b] = await Promise.all([
        this.cliente.json<{ dg?: string; hg?: string }>(json, false),
        this.cliente.json<{ dg?: string; hg?: string }>(`${json.slice(0, -5)}.jws`, false),
      ]);
      const tJson = a.tipo === 'novo' ? instante(a.dados) : 0;
      const tJws = b.tipo === 'novo' ? instante(b.dados) : 0;
      if (tJws > tJson) {
        modoArquivos.assinado = true;
        console.log('O TSE está atualizando primeiro os arquivos assinados (.jws): a coleta passa a usá-los.');
      }
    } catch { /* a conferência é opcional */ }
  }

  private async coletarMunicipios(): Promise<boolean> {
    const c = this.corrida;
    let ufs: { codigo: string; assinatura: string }[];
    if (c.info.abrangencia === 'br') {
      const porUf = await this.andamento('br');
      ufs = porUf.filter((a) => a.codigo !== 'br' && this.assinaturaUf.get(a.codigo) !== a.assinatura);
    } else {
      ufs = [{ codigo: c.info.abrangencia, assinatura: '' }];
    }
    let mudou = false;
    const agora = Date.now();
    await Promise.all(ufs.map(async ({ codigo: uf, assinatura }) => {
      const lista = await this.andamento(uf);
      const buscas: Promise<boolean>[] = [];
      let adiados = 0;
      for (const a of lista) {
        if (!c.municipios[a.codigo]) continue;
        const atual = c.unidades.get(a.codigo);
        if (!atual || atual.secoesTotalizadas === 0) {
          // ainda sem votos: registra andamento e eleitorado (usados no modelo)
          c.unidades.set(a.codigo, { ...(atual ?? contagemVazia()), secoesTotal: a.secoesTotal, eleitorado: a.eleitorado });
          if (!atual) mudou = true;
        }
        if (a.secoesTotalizadas === 0) continue;
        const b = this.buscado.get(a.codigo);
        if (b?.assinatura === a.assinatura) continue;
        const completo = a.secoesTotalizadas >= a.secoesTotal;
        if (b && !completo && agora - b.quando < REBUSCA_PARCIAL_MS) { adiados++; continue; }
        buscas.push(this.buscarMunicipio(uf, a));
      }
      const resultados = await Promise.all(buscas);
      if (resultados.some(Boolean)) mudou = true;
      if (assinatura && adiados === 0 && resultados.every(Boolean)) this.assinaturaUf.set(uf, assinatura);
    }));
    return mudou;
  }

  /**
   * Busca o resultado de um município. Se o arquivo vier atrás do andamento (cópia antiga da CDN),
   * tenta de novo sem cache; se ainda assim estiver atrás, não marca como lido — volta no próximo ciclo.
   */
  private async buscarMunicipio(uf: string, a: AndamentoUnidade): Promise<boolean> {
    try {
      const { eleicao, cargo } = this.corrida.info;
      const url = caminhos.unificado(URL_TSE, CICLO, eleicao, uf, cargo, a.codigo);
      let r = await this.cliente.json<TseUnificado>(url, false);
      let contagem = r.tipo === 'novo' ? lerUnificado(r.dados).contagem : null;
      if (!contagem || contagem.secoesTotalizadas < a.secoesTotalizadas) {
        r = await this.cliente.json<TseUnificado>(url, false, true);
        if (r.tipo === 'novo') contagem = lerUnificado(r.dados).contagem;
      }
      if (!contagem) return false;
      const atual = this.corrida.unidades.get(a.codigo);
      // nunca regride: uma cópia antiga não substitui dados mais novos
      if (atual && contagem.secoesTotalizadas < atual.secoesTotalizadas) return false;
      this.corrida.unidades.set(a.codigo, contagem);
      if (contagem.secoesTotalizadas >= a.secoesTotalizadas) {
        this.buscado.set(a.codigo, { assinatura: a.assinatura, quando: Date.now() });
      }
      return true;
    } catch {
      return false;
    }
  }
}

// Cliente HTTP para os arquivos públicos de divulgação do TSE.
// - limita requisições simultâneas (o servidor do TSE é compartilhado por todo o país);
// - usa requisições condicionais (ETag / Last-Modified) quando o servidor as oferece;
// - tenta novamente em falhas transitórias, com espera exponencial.
import { CONCORRENCIA } from '../config.ts';

export type ResultadoBusca<T> =
  | { tipo: 'novo'; dados: T }
  | { tipo: 'igual' }
  | { tipo: 'ausente' };

interface Validador { etag?: string; modificado?: string }

/**
 * O TSE publica cada arquivo em duas versões: .json e .jws (o mesmo JSON assinado, que o site
 * oficial lê). Se a versão assinada passar a ser a mais recente, toda a coleta muda para ela.
 */
export const modoArquivos = {
  assinado: false,
  /** até quando ignorar o cache da CDN (quando ela entrega arquivos desatualizados) */
  furarCacheAte: 0,
};

/** Conteúdo de um JWS compacto (cabeçalho.payload.assinatura): o payload em base64url. */
export function lerJws(texto: string): unknown {
  const partes = texto.trim().split('.');
  if (partes.length !== 3) throw new Error('JWS inválido');
  return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
}

export class ClienteTse {
  requisicoes = 0;
  falhas = 0;
  private ativos = 0;
  private fila: (() => void)[] = [];
  private validadores = new Map<string, Validador>();
  private limite: number;

  constructor(concorrencia = CONCORRENCIA) {
    this.limite = concorrencia;
  }

  private async vaga() {
    if (this.ativos < this.limite) { this.ativos++; return; }
    await new Promise<void>((ok) => this.fila.push(ok));
    this.ativos++;
  }

  private liberar() {
    this.ativos--;
    this.fila.shift()?.();
  }

  /** Busca um JSON (ou sua versão assinada .jws). Com `condicional`, devolve 'igual' se não mudou. */
  async json<T>(url: string, condicional = true, furarCache = false): Promise<ResultadoBusca<T>> {
    const base = modoArquivos.assinado && url.endsWith('.json') ? `${url.slice(0, -5)}.jws` : url;
    // parâmetro que muda a cada 15 s: obriga a CDN a buscar no servidor de origem
    const furar = furarCache || Date.now() < modoArquivos.furarCacheAte;
    const preferido = furar ? `${base}?_=${Math.floor(Date.now() / 15_000)}` : base;
    const r = await this.buscar<T>(preferido, condicional);
    if (r.tipo === 'ausente' && preferido !== url) return this.buscar<T>(url, condicional);
    if (r.tipo === 'ausente' && url.endsWith('.json')) return this.buscar<T>(`${url.slice(0, -5)}.jws`, condicional);
    return r;
  }

  private async buscar<T>(url: string, condicional: boolean): Promise<ResultadoBusca<T>> {
    await this.vaga();
    try {
      for (let tentativa = 0; ; tentativa++) {
        try {
          const cabecalhos: Record<string, string> = {
            'Accept': 'application/json',
            'User-Agent': 'apuracao-2026/1.0 (acompanhamento pessoal)',
          };
          const val = condicional ? this.validadores.get(url) : undefined;
          if (val?.etag) cabecalhos['If-None-Match'] = val.etag;
          if (val?.modificado) cabecalhos['If-Modified-Since'] = val.modificado;

          this.requisicoes++;
          const r = await fetch(url, { headers: cabecalhos, signal: AbortSignal.timeout(20_000) });
          if (r.status === 304) return { tipo: 'igual' };
          if (r.status === 404 || r.status === 403) { await r.body?.cancel(); return { tipo: 'ausente' }; }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);

          const texto = await r.text();
          const etag = r.headers.get('etag') ?? undefined;
          const modificado = r.headers.get('last-modified') ?? undefined;
          if (etag || modificado) this.validadores.set(url, { etag, modificado });
          return { tipo: 'novo', dados: (url.split('?')[0].endsWith('.jws') ? lerJws(texto) : JSON.parse(texto)) as T };
        } catch (erro) {
          if (tentativa >= 2) throw erro;
          await new Promise((ok) => setTimeout(ok, 800 * 2 ** tentativa));
        }
      }
    } catch (erro) {
      this.falhas++;
      throw new Error(`${(erro as Error).message} — ${url}`);
    } finally {
      this.liberar();
    }
  }
}

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import {
  BASES_AO_VIVO, CICLO, DIR_BASE, DIR_CACHE, DIR_DIST, DIR_GEO, HIPER_POR_TURNO, INTERVALO_COLETA_MS, PORTA,
  SIMULACAO, THREADS, TURNO_SIMULACAO, URL_TSE, MODO_PUBLICO, CORS_ORIGEM,
} from './config.ts';
import { ClienteTse } from './tse/cliente.ts';
import { ColetorAoVivo, descobrirEleicao } from './tse/coletor.ts';
import { caminhos } from './tse/parse.ts';
import { Simulador } from './simulacao/simulador.ts';
import { ExecutorModelo } from './modelo/executor.ts';
import { montarCovariaveis } from './modelo/variaveis.ts';
import { Corrida } from './corrida.ts';
import { gerarInsights } from './insights.ts';
import type { BasePresidente, MunicipioBase, StatusServidor } from '../shared/tipos.ts';

// ------------------------------------------------------------ base histórica
const arquivosBase = [...new Set(['municipios', ...Object.values(BASES_AO_VIVO).flat(),
  ...Object.values(SIMULACAO).flatMap((x) => [x.verdade, ...x.bases])])];
if (arquivosBase.some((a) => !existsSync(join(DIR_BASE, `${a}.json`))) || !existsSync(join(DIR_GEO, 'ufs.json'))) {
  console.log('Base histórica não encontrada — preparando agora (uma única vez)…\n');
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'dados', 'preparar.ts')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
const ler = <T>(arq: string): T => JSON.parse(readFileSync(join(DIR_BASE, `${arq}.json`), 'utf8')) as T;
const municipios = ler<Record<string, MunicipioBase>>('municipios');
const cacheBases = new Map<string, BasePresidente>();
const base = (nome: string) => {
  if (!cacheBases.has(nome)) cacheBases.set(nome, ler<BasePresidente>(nome));
  return cacheBases.get(nome)!;
};

/** Variáveis históricas de uma corrida: no 2º turno, a base principal é o 1º turno da mesma eleição. */
function covariaveisPara(turno: number, nomesBases: string[]) {
  const bases = nomesBases.map(base);
  return montarCovariaveis(Object.keys(municipios), municipios, bases, {
    // no 2º turno entram todos os candidatos relevantes do 1º turno (para estimar as transferências)
    quantosPrincipal: turno === 2 ? 6 : 4,
    // a "fração no 2º turno" da base principal seria o próprio resultado a prever
    ignorarSegPrincipal: turno === 2,
  });
}

// ------------------------------------------------------------ eventos (SSE)
const clientes = new Set<ServerResponse>();
const pendentesEnvio = new Map<string, NodeJS.Timeout>();
function notificar(c: Corrida) {
  if (pendentesEnvio.has(c.info.id)) return;
  pendentesEnvio.set(c.info.id, setTimeout(() => {
    pendentesEnvio.delete(c.info.id);
    const msg = `data: ${JSON.stringify({ id: c.info.id, versao: c.versao })}\n\n`;
    for (const r of clientes) r.write(msg);
  }, 250));
}
setInterval(() => { for (const r of clientes) r.write(': ping\n\n'); }, 20_000);

// ------------------------------------------------------------ modelo, coleta e simulação
// executores separados: a simulação nunca atrasa as projeções ao vivo
const executor = new ExecutorModelo(THREADS);
const executorSimulacao = new ExecutorModelo(Math.min(2, THREADS));
const projetar = (c: Corrida) => void c.projetar(
  c.info.modo === 'simulacao' ? executorSimulacao : executor,
  () => { verificarMarco(c); notificar(c); },
);

/** A cada 5% de seções totalizadas, gera e guarda uma análise de insights. */
function verificarMarco(c: Corrida) {
  const pst = c.totais.percentualSecoes;
  if (pst + 1e-9 < c.proximoMarco) return;
  const marco = Math.min(1, Math.round(Math.floor((pst + 1e-9) / 0.05) * 5) / 100);
  try {
    c.insights.push(gerarInsights(c, marco, c.insights.at(-1)));
    if (c.insights.length > 40) c.insights.shift();
  } catch (e) {
    console.error('Falha ao gerar insights:', e);
  }
  c.proximoMarco = marco + 0.05;
}

const cliente = new ClienteTse();
let aoVivo: { corrida: Corrida; coletor: ColetorAoVivo; pleito: string } | null = null;
let erroInicio: string | null = null;
(async () => {
  for (let tentativa = 0; !aoVivo; tentativa++) {
    try {
      const { info, pleito } = await descobrirEleicao(cliente);
      const nomesBases = BASES_AO_VIVO[info.turno] ?? BASES_AO_VIVO[1];
      const anterior = base(nomesBases[0]);
      const corrida = new Corrida(
        { ...info, anoAnterior: anterior.ano, rotuloAnterior: info.turno === 2 ? '1º turno' : String(anterior.ano) },
        municipios, covariaveisPara(info.turno, nomesBases), anterior,
      );
      corrida.hiper = HIPER_POR_TURNO[info.turno];
      const arquivo = join(DIR_CACHE, `ao-vivo-${info.eleicao}.json`);
      if (existsSync(arquivo)) {
        try {
          if (corrida.deDisco(JSON.parse(readFileSync(arquivo, 'utf8')))) {
            console.log(`Estado anterior restaurado (${corrida.historico.length} pontos de histórico).`);
            projetar(corrida);
          }
        } catch (e) { console.error('Não foi possível restaurar o estado salvo:', (e as Error).message); }
      }
      let versaoSalva = corrida.versao;
      setInterval(() => {
        if (corrida.versao === versaoSalva || corrida.totais.secoesTotalizadas === 0) return;
        versaoSalva = corrida.versao;
        mkdir(DIR_CACHE, { recursive: true })
          .then(() => writeFile(`${arquivo}.tmp`, JSON.stringify(corrida.paraDisco())))
          .then(() => rename(`${arquivo}.tmp`, arquivo))
          .catch((e) => console.error('Falha ao salvar estado:', e.message));
      }, 15_000);
      const coletor = new ColetorAoVivo(cliente, corrida, () => notificar(corrida), () => projetar(corrida));
      aoVivo = { corrida, coletor, pleito };
      coletor.iniciar();
      console.log(`Ao vivo: ${info.titulo} (${pleito}) · bases: ${nomesBases.join(', ')}`);
    } catch (e) {
      erroInicio = `Não foi possível ler a configuração do TSE: ${(e as Error).message}`;
      console.error(erroInicio);
      await new Promise((ok) => setTimeout(ok, Math.min(60_000, 5_000 * (tentativa + 1))));
    }
  }
})();

const cfgSim = SIMULACAO[TURNO_SIMULACAO];
const simulador = new Simulador(
  municipios,
  base(cfgSim.verdade),
  cfgSim.bases.map(base),
  (c) => { notificar(c); projetar(c); },
  undefined,
  { turno: TURNO_SIMULACAO, covariaveis: covariaveisPara(TURNO_SIMULACAO, cfgSim.bases) },
);
simulador.corrida.hiper = HIPER_POR_TURNO[TURNO_SIMULACAO];
if (MODO_PUBLICO) {
  // em produção a simulação é uma demonstração fixa: roda uma vez (~1 min) e para no resultado final
  simulador.velocidade = 2;
  simulador.iniciar();
}

function corrida(id: string): Corrida | null {
  if (id === 'simulacao' || id === simulador.corrida.info.id) return simulador.corrida;
  if (aoVivo && (id === 'ao-vivo' || id === aoVivo.corrida.info.id)) return aoVivo.corrida;
  return null;
}

function status(): StatusServidor {
  return {
    agora: Date.now(),
    aoVivo: {
      disponivel: !!aoVivo,
      pleito: aoVivo?.pleito ?? '',
      corrida: aoVivo?.corrida.info ?? null,
      intervaloColetaMs: INTERVALO_COLETA_MS,
      ultimaColeta: aoVivo?.coletor.ultimaColeta ?? null,
      erro: aoVivo?.coletor.erro ?? erroInicio,
      requisicoes: cliente.requisicoes,
    },
    simulacao: {
      controlavel: !MODO_PUBLICO,
      ativa: simulador.ativa,
      relogio: simulador.relogio(),
      velocidade: simulador.velocidade,
      progresso: simulador.progresso,
      corrida: simulador.corrida.info,
    },
  };
}

// ------------------------------------------------------------ HTTP
/**
 * Respostas grandes (estado e mapa por município) são serializadas e comprimidas uma vez por
 * versão da disputa, e não a cada visitante.
 */
const cacheRespostas = new Map<string, { chave: string; corpo: Buffer; gz: Buffer | null }>();
function enviarJsonCache(req: IncomingMessage, res: ServerResponse, id: string, chave: string, gerar: () => unknown) {
  let c = cacheRespostas.get(id);
  if (!c || c.chave !== chave) {
    const corpo = Buffer.from(JSON.stringify(gerar()));
    c = { chave, corpo, gz: corpo.length > 2048 ? gzipSync(corpo) : null };
    cacheRespostas.set(id, c);
  }
  const gzip = c.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(gzip ? c.gz : c.corpo);
}

const origensCors = CORS_ORIGEM.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
function aplicarCors(req: IncomingMessage, res: ServerResponse) {
  const origem = req.headers.origin;
  if (origensCors.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origem && origensCors.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }
}

/** "Recalcular agora" é caro: no máximo uma análise nova a cada 20 s por disputa. */
const ultimoRecalculo = new Map<string, number>();

function enviarJson(req: IncomingMessage, res: ServerResponse, dados: unknown, codigo = 200) {
  const corpo = Buffer.from(JSON.stringify(dados));
  const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && corpo.length > 2048;
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(gzip ? gzipSync(corpo) : corpo);
}

const cacheArquivos = new Map<string, Buffer>();
async function enviarArquivo(req: IncomingMessage, res: ServerResponse, caminho: string, tipo: string, maxAge = 0) {
  let corpo = cacheArquivos.get(caminho);
  if (!corpo) {
    const bruto = await readFile(caminho);
    corpo = tipo.startsWith('application/json') || tipo.startsWith('text/') || tipo.includes('javascript') ? gzipSync(bruto) : bruto;
    if (maxAge > 0 || caminho.startsWith(DIR_GEO)) cacheArquivos.set(caminho, corpo);
  }
  const comprimido = tipo.startsWith('application/json') || tipo.startsWith('text/') || tipo.includes('javascript');
  res.writeHead(200, {
    'Content-Type': tipo,
    'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache',
    ...(comprimido ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(corpo);
}

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function foto(res: ServerResponse, eleicao: string, uf: string, sq: string) {
  if (!/^\d+$/.test(eleicao) || !/^[a-z]{2}$/.test(uf) || !/^\d+$/.test(sq)) { res.writeHead(400).end(); return; }
  const dir = join(DIR_CACHE, 'fotos');
  const arq = join(dir, `${eleicao}-${uf}-${sq}.jpeg`);
  try {
    const corpo = await readFile(arq);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }).end(corpo);
    return;
  } catch { /* não está em cache */ }
  try {
    const r = await fetch(caminhos.foto(URL_TSE, CICLO, Number(eleicao), uf, sq), { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) { res.writeHead(404).end(); return; }
    const corpo = Buffer.from(await r.arrayBuffer());
    await mkdir(dir, { recursive: true });
    await writeFile(arq, corpo);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }).end(corpo);
  } catch {
    res.writeHead(404).end();
  }
}

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const partes = url.pathname.split('/').filter(Boolean);

    if (partes[0] === 'api') {
      aplicarCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
        res.end();
        return;
      }
      const [, recurso, a, b, c] = partes;
      if (recurso === 'status') return enviarJson(req, res, status());
      if (recurso === 'insights' && a) {
        const cr = corrida(a);
        if (!cr) return enviarJson(req, res, { erro: 'Disputa não encontrada' }, 404);
        if (b === 'recalcular' && req.method === 'POST') {
          const ultima = cr.insights.at(-1);
          if (ultima && Date.now() - (ultimoRecalculo.get(cr.info.id) ?? 0) < 20_000) return enviarJson(req, res, ultima);
          ultimoRecalculo.set(cr.info.id, Date.now());
          const analise = gerarInsights(cr, null, ultima);
          cr.insights.push(analise);
          if (cr.insights.length > 40) cr.insights.shift();
          return enviarJson(req, res, analise);
        }
        return enviarJson(req, res, { analises: cr.insights });
      }
      if (recurso === 'eventos') {
        // X-Accel-Buffering: proxies (nginx/Traefik) não devem segurar os eventos
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 3000\n\n');
        clientes.add(res);
        req.on('close', () => clientes.delete(res));
        return;
      }
      if (recurso === 'corrida' && a) {
        const cr = corrida(a);
        if (!cr) return enviarJson(req, res, { erro: 'Disputa não encontrada' }, 404);
        if (b === 'unidades') return enviarJsonCache(req, res, `${cr.info.id}:unidades`, String(cr.versao), () => cr.resumoUnidades());
        cr.ultimoAcesso = Date.now();
        const chave = `${cr.versao}|${cr.ultimaColeta}|${cr.erroColeta}|${cr.historico.length}|${cr.projecao?.disponivel}`;
        return enviarJsonCache(req, res, `${cr.info.id}:estado`, chave, () => cr.estado());
      }
      if (recurso === 'simulacao' && req.method === 'POST') {
        if (MODO_PUBLICO) return enviarJson(req, res, { erro: 'Simulação somente leitura neste servidor' }, 403);
        if (a === 'iniciar') simulador.iniciar();
        else if (a === 'pausar') simulador.pausar();
        else if (a === 'reiniciar') simulador.reiniciar();
        else if (a === 'velocidade') simulador.velocidade = Math.max(0.5, Math.min(30, Number(url.searchParams.get('v')) || 2));
        else if (a === 'ir') simulador.irPara(Number(url.searchParams.get('minuto')) || 0);
        if (a === 'ir') notificar(simulador.corrida);
        return enviarJson(req, res, status().simulacao);
      }
      if (recurso === 'geo') {
        if (a === 'ufs') return enviarArquivo(req, res, join(DIR_GEO, 'ufs.json'), TIPOS['.json'], 86400);
        if (a === 'mun' && b && /^[a-z]{2}$/.test(b) && existsSync(join(DIR_GEO, `mun-${b}.json`))) {
          return enviarArquivo(req, res, join(DIR_GEO, `mun-${b}.json`), TIPOS['.json'], 86400);
        }
      }
      if (recurso === 'foto' && a && b && c) return foto(res, a, b, c);
      return enviarJson(req, res, { erro: 'Rota não encontrada' }, 404);
    }

    // arquivos estáticos da interface (build do Vite)
    if (!existsSync(DIR_DIST)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Interface não compilada. Use "npm run dev" (desenvolvimento) ou "npm start".');
      return;
    }
    const alvo = normalize(join(DIR_DIST, decodeURIComponent(url.pathname)));
    const dentro = alvo.startsWith(DIR_DIST);
    const ehArquivo = dentro && existsSync(alvo) && (await stat(alvo)).isFile();
    const arquivo = ehArquivo ? alvo : join(DIR_DIST, 'index.html');
    const longo = arquivo.includes(`${join(DIR_DIST, 'assets')}`);
    return enviarArquivo(req, res, arquivo, TIPOS[extname(arquivo)] ?? 'application/octet-stream', longo ? 31_536_000 : 0);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) enviarJson(req, res, { erro: 'Erro interno' }, 500);
  }
});

servidor.listen(PORTA, () => {
  console.log(`\n  Apuração 2026 → http://localhost:${PORTA}\n`);
});

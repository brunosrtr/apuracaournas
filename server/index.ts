import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import {
  ANOS_BASE_AO_VIVO, ANOS_BASE_SIMULACAO, CICLO, CONCORRENCIA_ESTADUAL, DIR_BASE, DIR_CACHE, DIR_DIST, DIR_GEO,
  INTERVALO_COLETA_MS, INTERVALO_ESTADUAL_MS, NOMES_UF, PORTA, SIMULACOES_ESTADUAIS, THREADS, URL_TSE,
} from './config.ts';
import { ClienteTse } from './tse/cliente.ts';
import { ColetorAoVivo, descobrirEleicao } from './tse/coletor.ts';
import { caminhos } from './tse/parse.ts';
import { Simulador } from './simulacao/simulador.ts';
import { ExecutorModelo } from './modelo/executor.ts';
import { montarCovariaveis } from './modelo/variaveis.ts';
import { Corrida } from './corrida.ts';
import { resumirPartidos } from './partidos.ts';
import { gerarInsights } from './insights.ts';
import type { BasePresidente, MunicipioBase, StatusServidor } from '../shared/tipos.ts';

// ------------------------------------------------------------ base histórica
const anos = [...new Set([2022, ...ANOS_BASE_AO_VIVO, ...ANOS_BASE_SIMULACAO])];
const arquivosBase = ['municipios.json', ...anos.map((a) => `presidente-${a}.json`)];
if (arquivosBase.some((a) => !existsSync(join(DIR_BASE, a))) || !existsSync(join(DIR_GEO, 'ufs.json'))) {
  console.log('Base histórica não encontrada — preparando agora (uma única vez)…\n');
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'dados', 'preparar.ts')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
const ler = <T>(arq: string): T => JSON.parse(readFileSync(join(DIR_BASE, arq), 'utf8')) as T;
const municipios = ler<Record<string, MunicipioBase>>('municipios.json');
const bases = Object.fromEntries(anos.map((a) => [a, ler<BasePresidente>(`presidente-${a}.json`)])) as Record<number, BasePresidente>;

// ------------------------------------------------------------ eventos (SSE)
const clientes = new Set<ServerResponse>();
const pendentesEnvio = new Map<string, NodeJS.Timeout>();
function notificar(c: Corrida) {
  if (pendentesEnvio.has(c.info.id)) return;
  pendentesEnvio.set(c.info.id, setTimeout(() => {
    pendentesEnvio.delete(c.info.id);
    const msg = `data: ${JSON.stringify({ id: c.info.id, versao: c.versao })}\n\n`;
    for (const r of clientes) r.write(msg);
  }, 300));
}
setInterval(() => { for (const r of clientes) r.write(': ping\n\n'); }, 20_000);

// ------------------------------------------------------------ modelo, coleta e simulação
// executores separados: a simulação nunca atrasa as projeções ao vivo
const executor = new ExecutorModelo(THREADS);
const executorSimulacao = new ExecutorModelo(Math.min(2, THREADS));
const executorEstadual = new ExecutorModelo(Math.min(2, THREADS));
const projetar = (c: Corrida) => void c.projetar(
  c.info.modo === 'simulacao' ? executorSimulacao : c.info.cargo === 1 ? executor : executorEstadual,
  () => { verificarMarco(c); notificar(c); },
);

/** A cada 5% de seções totalizadas (Presidente), gera e guarda uma análise de insights. */
function verificarMarco(c: Corrida) {
  if (c.info.cargo !== 1) return;
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
let aoVivo: { corrida: Corrida; coletor: ColetorAoVivo; pleito: string; eleicaoEstadual: number | null } | null = null;
let erroInicio: string | null = null;
(async () => {
  for (let tentativa = 0; !aoVivo; tentativa++) {
    try {
      const { info, pleito, eleicaoEstadual } = await descobrirEleicao(cliente);
      const codigos = Object.keys(municipios);
      const cov = montarCovariaveis(codigos, municipios, ANOS_BASE_AO_VIVO.map((a) => bases[a]));
      const corrida = new Corrida({ ...info, anoAnterior: ANOS_BASE_AO_VIVO[0] }, municipios, cov, bases[ANOS_BASE_AO_VIVO[0]]);
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
      }, 20_000);
      const coletor = new ColetorAoVivo(cliente, corrida, () => notificar(corrida), () => projetar(corrida));
      aoVivo = { corrida, coletor, pleito, eleicaoEstadual };
      coletor.iniciar();
      iniciarEstaduais();
      console.log(`Ao vivo: ${info.titulo} (${pleito})`);
    } catch (e) {
      erroInicio = `Não foi possível ler a configuração do TSE: ${(e as Error).message}`;
      console.error(erroInicio);
      await new Promise((ok) => setTimeout(ok, Math.min(60_000, 5_000 * (tentativa + 1))));
    }
  }
})();

const simulador = new Simulador(
  municipios,
  bases[2022],
  ANOS_BASE_SIMULACAO.map((a) => bases[a]),
  (c) => { notificar(c); projetar(c); },
);

// Governador e Senador das 27 UFs: coletados o tempo todo (resumo por partido), com cliente,
// intervalo e threads próprios para nunca atrasar a disputa presidencial
const estaduais = new Map<string, Corrida>();
const clienteEstadual = new ClienteTse(CONCORRENCIA_ESTADUAL);

function iniciarEstaduais() {
  let i = 0;
  for (const uf of Object.keys(NOMES_UF)) {
    if (uf === 'zz') continue;
    for (const cargo of ['governador', 'senador']) obterEstadual(`${cargo}-${uf}`, 400 * i++);
  }
}

function obterEstadual(id: string, atrasoMs = 0): Corrida | null {
  const m = /^(governador|senador)-([a-z]{2})$/.exec(id);
  const eleicao = aoVivo?.eleicaoEstadual;
  if (!m || !eleicao || !NOMES_UF[m[2]] || m[2] === 'zz') return null;
  const existente = estaduais.get(id);
  if (existente) return existente;
  const [, nome, uf] = m;
  const cargo = nome === 'governador' ? 3 : 5;
  const munUf = Object.fromEntries(Object.entries(municipios).filter(([, mun]) => mun.uf === uf));
  const cov = montarCovariaveis(Object.keys(munUf), munUf, ANOS_BASE_AO_VIVO.map((a) => bases[a]));
  const nomeCargo = cargo === 3 ? 'Governador' : 'Senador';
  const c = new Corrida({
    id, modo: 'ao-vivo', eleicao, turno: 1, cargo, nomeCargo, abrangencia: uf,
    // 2026: renovação de 2/3 do Senado → 2 vagas por UF (atualizado pelo arquivo do TSE)
    vagas: cargo === 5 ? 2 : 1,
    maioriaAbsoluta: cargo === 3,
    titulo: `${nomeCargo} · ${NOMES_UF[uf]}`,
    anoAnterior: ANOS_BASE_AO_VIVO[0],
  }, munUf, cov, bases[ANOS_BASE_AO_VIVO[0]]);
  c.simulacoes = SIMULACOES_ESTADUAIS;
  const coletor = new ColetorAoVivo(clienteEstadual, c, () => notificar(c), () => projetar(c), () => true, INTERVALO_ESTADUAL_MS);
  estaduais.set(id, c);
  coletor.iniciar(atrasoMs);
  return c;
}

function corrida(id: string): Corrida | null {
  if (id === 'simulacao' || id === simulador.corrida.info.id) return simulador.corrida;
  if (aoVivo && (id === 'ao-vivo' || id === aoVivo.corrida.info.id)) return aoVivo.corrida;
  return obterEstadual(id);
}

function status(): StatusServidor {
  return {
    agora: Date.now(),
    aoVivo: {
      disponivel: !!aoVivo,
      pleito: aoVivo?.pleito ?? '',
      corrida: aoVivo?.corrida.info ?? null,
      eleicaoEstadual: aoVivo?.eleicaoEstadual ?? null,
      intervaloColetaMs: INTERVALO_COLETA_MS,
      ultimaColeta: aoVivo?.coletor.ultimaColeta ?? null,
      erro: aoVivo?.coletor.erro ?? erroInicio,
      requisicoes: cliente.requisicoes + clienteEstadual.requisicoes,
    },
    simulacao: {
      ativa: simulador.ativa,
      relogio: simulador.relogio(),
      velocidade: simulador.velocidade,
      progresso: simulador.progresso,
      corrida: simulador.corrida.info,
    },
  };
}

// ------------------------------------------------------------ HTTP
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
      const [, recurso, a, b, c] = partes;
      if (recurso === 'status') return enviarJson(req, res, status());
      if (recurso === 'insights' && a) {
        const cr = corrida(a);
        if (!cr) return enviarJson(req, res, { erro: 'Disputa não encontrada' }, 404);
        if (b === 'recalcular' && req.method === 'POST') {
          const analise = gerarInsights(cr, null, cr.insights.at(-1));
          cr.insights.push(analise);
          if (cr.insights.length > 40) cr.insights.shift();
          return enviarJson(req, res, analise);
        }
        return enviarJson(req, res, { analises: cr.insights });
      }
      if (recurso === 'partidos') {
        const todas = [...estaduais.values()];
        return enviarJson(req, res, resumirPartidos(todas.filter((x) => x.info.cargo === 3), todas.filter((x) => x.info.cargo === 5)));
      }
      if (recurso === 'eventos') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write('retry: 3000\n\n');
        clientes.add(res);
        req.on('close', () => clientes.delete(res));
        return;
      }
      if (recurso === 'corrida' && a) {
        const cr = corrida(a);
        if (!cr) return enviarJson(req, res, { erro: 'Disputa não encontrada' }, 404);
        if (b === 'unidades') return enviarJson(req, res, cr.resumoUnidades());
        return enviarJson(req, res, cr.estado());
      }
      if (recurso === 'simulacao' && req.method === 'POST') {
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

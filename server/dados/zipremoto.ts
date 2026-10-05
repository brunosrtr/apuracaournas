// Leitura parcial de arquivos .zip remotos via HTTP Range.
// Os pacotes do Portal de Dados Abertos do TSE chegam a 600 MB, mas só
// precisamos de alguns CSVs internos: lemos o diretório central do zip e
// baixamos apenas as entradas desejadas, descompactando em streaming.
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';

export interface EntradaZip {
  nome: string;
  metodo: number;
  tamComprimido: number;
  tamOriginal: number;
  offsetLocal: number;
}

async function intervalo(url: string, inicio: number, fim: number): Promise<Buffer> {
  const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}` } });
  if (r.status !== 206) throw new Error(`Servidor não aceitou Range (HTTP ${r.status}) em ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function listarZip(url: string): Promise<EntradaZip[]> {
  const cab = await fetch(url, { method: 'HEAD' });
  if (!cab.ok) throw new Error(`HTTP ${cab.status} em ${url}`);
  const tamanho = Number(cab.headers.get('content-length'));
  const inicioCauda = Math.max(0, tamanho - 65_557);
  const cauda = await intervalo(url, inicioCauda, tamanho - 1);

  let eocd = -1;
  for (let i = cauda.length - 22; i >= 0; i--) {
    if (cauda.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Fim do diretório central não encontrado');

  let total = cauda.readUInt16LE(eocd + 10);
  let tamDir = cauda.readUInt32LE(eocd + 12);
  let offDir = cauda.readUInt32LE(eocd + 16);

  if (total === 0xffff || tamDir === 0xffffffff || offDir === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || cauda.readUInt32LE(loc) !== 0x07064b50) throw new Error('Localizador ZIP64 ausente');
    const offZ64 = Number(cauda.readBigUInt64LE(loc + 8));
    const z64 = await intervalo(url, offZ64, offZ64 + 55);
    total = Number(z64.readBigUInt64LE(32));
    tamDir = Number(z64.readBigUInt64LE(40));
    offDir = Number(z64.readBigUInt64LE(48));
  }

  const dir = await intervalo(url, offDir, offDir + tamDir - 1);
  const entradas: EntradaZip[] = [];
  let p = 0;
  while (p + 46 <= dir.length && dir.readUInt32LE(p) === 0x02014b50) {
    const metodo = dir.readUInt16LE(p + 10);
    let tamComprimido = dir.readUInt32LE(p + 20);
    let tamOriginal = dir.readUInt32LE(p + 24);
    const nNome = dir.readUInt16LE(p + 28);
    const nExtra = dir.readUInt16LE(p + 30);
    const nComent = dir.readUInt16LE(p + 32);
    let offsetLocal = dir.readUInt32LE(p + 42);
    const nome = dir.toString('latin1', p + 46, p + 46 + nNome);

    let x = p + 46 + nNome;
    const fimExtra = x + nExtra;
    while (x + 4 <= fimExtra) {
      const id = dir.readUInt16LE(x);
      const tam = dir.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (tamOriginal === 0xffffffff) { tamOriginal = Number(dir.readBigUInt64LE(q)); q += 8; }
        if (tamComprimido === 0xffffffff) { tamComprimido = Number(dir.readBigUInt64LE(q)); q += 8; }
        if (offsetLocal === 0xffffffff) { offsetLocal = Number(dir.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + tam;
    }
    entradas.push({ nome, metodo, tamComprimido, tamOriginal, offsetLocal });
    p += 46 + nNome + nExtra + nComent;
  }
  if (entradas.length !== total) console.warn(`Aviso: esperado ${total} entradas, lidas ${entradas.length}`);
  return entradas;
}

/** Itera as linhas (latin1) de um arquivo dentro de um zip remoto, sem baixar o zip inteiro. */
export async function* linhasDoZip(url: string, entrada: EntradaZip): AsyncGenerator<string> {
  const cabLocal = await intervalo(url, entrada.offsetLocal, entrada.offsetLocal + 29);
  const inicio = entrada.offsetLocal + 30 + cabLocal.readUInt16LE(26) + cabLocal.readUInt16LE(28);
  const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${inicio + entrada.tamComprimido - 1}` } });
  if (r.status !== 206 || !r.body) throw new Error(`Falha ao baixar ${entrada.nome}: HTTP ${r.status}`);

  let fluxo: NodeJS.ReadableStream = Readable.fromWeb(r.body as never);
  if (entrada.metodo === 8) fluxo = fluxo.pipe(createInflateRaw());
  else if (entrada.metodo !== 0) throw new Error(`Método de compressão ${entrada.metodo} não suportado`);

  let resto = '';
  for await (const pedaco of fluxo) {
    const texto = resto + (pedaco as Buffer).toString('latin1');
    const linhas = texto.split('\n');
    resto = linhas.pop() ?? '';
    for (const l of linhas) yield l.endsWith('\r') ? l.slice(0, -1) : l;
  }
  if (resto) yield resto;
}

/** Divide uma linha CSV do TSE (separador ";" e campos entre aspas). */
export function dividirCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; } else aspas = false;
      } else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { campos.push(atual); atual = ''; }
    else atual += ch;
  }
  campos.push(atual);
  return campos;
}

/** Itera registros (objetos coluna→valor) de um CSV dentro de um zip remoto. */
export async function* registrosDoZip(
  url: string,
  filtroNome: (nome: string) => boolean,
): AsyncGenerator<Record<string, string>> {
  const entradas = await listarZip(url);
  const entrada = entradas.find((e) => filtroNome(e.nome));
  if (!entrada) throw new Error(`Arquivo não encontrado no zip ${url}. Disponíveis: ${entradas.map((e) => e.nome).join(', ')}`);
  console.log(`  ↳ ${entrada.nome} (${(entrada.tamComprimido / 1e6).toFixed(1)} MB comprimido)`);
  let cabecalho: string[] | null = null;
  for await (const linha of linhasDoZip(url, entrada)) {
    if (!linha) continue;
    const campos = dividirCsv(linha);
    if (!cabecalho) { cabecalho = campos; continue; }
    const reg: Record<string, string> = {};
    for (let i = 0; i < cabecalho.length; i++) reg[cabecalho[i]] = campos[i];
    yield reg;
  }
}

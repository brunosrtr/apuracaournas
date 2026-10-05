// Prepara a base histórica usada pelo modelo de projeção.
// Fontes: Portal de Dados Abertos do TSE (resultados 2018 e 2022 por município),
// configuração oficial de municípios de 2026 e malhas/regiões do IBGE.
//
// Uso: npm run dados   (≈ 25 MB de download, roda uma vez)
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registrosDoZip } from './zipremoto.ts';
import { ANOS_BASE_AO_VIVO, ANOS_BASE_SIMULACAO, DIR_BASE, DIR_GEO, UF_POR_CODIGO_IBGE, URL_TSE } from '../config.ts';
import type { BasePresidente, MunicipioBase, RegistroHistorico } from '../../shared/tipos.ts';

const ODSELE = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const IBGE = 'https://servicodados.ibge.gov.br/api';

const num = (r: Record<string, string>, ...colunas: string[]): number => {
  for (const c of colunas) {
    const v = r[c];
    if (v !== undefined && v !== '' && !v.startsWith('#')) return Number(v) || 0;
  }
  return 0;
};
const codMun = (v: string) => v.replace(/\D/g, '').padStart(5, '0');

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return (await r.json()) as T;
}

async function salvar(caminho: string, dados: unknown) {
  await writeFile(caminho, JSON.stringify(dados));
  console.log(`  ✓ ${caminho}`);
}

// ---------------------------------------------------------------- municípios
async function prepararMunicipios(): Promise<Record<string, MunicipioBase>> {
  console.log('• Municípios (TSE 2026 + regiões intermediárias do IBGE)');
  type CfgMun = { abr: { cd: string; ds: string; mu: { cd: string; cdi: string; nm: string; c: string }[] }[] };
  const cfg = await json<CfgMun>(`${URL_TSE}/ele2026/6257/config/mun-e006257-cm.json`);
  type Loc = Record<string, string | number>;
  const locais = await json<Loc[]>(`${IBGE}/v1/localidades/municipios?view=nivelado`);
  const porIbge = new Map(locais.map((l) => [String(l['municipio-id']), l]));

  const saida: Record<string, MunicipioBase> = {};
  for (const uf of cfg.abr) {
    for (const m of uf.mu) {
      const loc = porIbge.get(m.cdi);
      saida[m.cd] = {
        uf: uf.cd.toLowerCase(),
        nome: m.nm,
        ibge: m.cdi || '',
        capital: m.c === 's',
        ri: loc ? String(loc['regiao-intermediaria-id']) : `${uf.cd.toLowerCase()}-x`,
        riNome: loc ? String(loc['regiao-intermediaria-nome']) : uf.ds,
      };
    }
  }
  console.log(`  ${Object.keys(saida).length} municípios (inclui exterior)`);
  return saida;
}

// ---------------------------------------------------------------- presidente
/** Vencedor de cada 2º turno (referência da variável "2º turno"). */
const VENCEDOR_2T: Record<number, string> = { 2014: '13', 2018: '17', 2022: '13' };

async function prepararPresidente(ano: number): Promise<BasePresidente> {
  console.log(`• Presidente ${ano} por município`);
  const mun: Record<string, RegistroHistorico> = {};
  const segundo: Record<string, { a: number; total: number }> = {};
  const cands = new Map<string, { numero: string; nome: string; partido: string; votos: number }>();
  const vencedor2T = VENCEDOR_2T[ano];

  for await (const r of registrosDoZip(
    `${ODSELE}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`,
    (n) => n.endsWith(`_${ano}_BR.csv`),
  )) {
    if (r.CD_CARGO !== '1') continue;
    const cd = codMun(r.CD_MUNICIPIO);
    const votos = num(r, 'QT_VOTOS_NOMINAIS_VALIDOS', 'QT_VOTOS_NOMINAIS');
    const numero = r.NR_CANDIDATO;
    if (r.NR_TURNO === '2') {
      const s = (segundo[cd] ??= { a: 0, total: 0 });
      s.total += votos;
      if (numero === vencedor2T) s.a += votos;
      continue;
    }
    const reg = (mun[cd] ??= { uf: r.SG_UF.toLowerCase(), aptos: 0, comp: 0, brancos: 0, nulos: 0, validos: 0, v: {} });
    reg.v[numero] = (reg.v[numero] ?? 0) + votos;
    reg.validos += votos;
    const c = cands.get(numero) ?? { numero, nome: r.NM_URNA_CANDIDATO, partido: r.SG_PARTIDO, votos: 0 };
    c.votos += votos;
    cands.set(numero, c);
  }

  for await (const r of registrosDoZip(
    `${ODSELE}/detalhe_votacao_munzona/detalhe_votacao_munzona_${ano}.zip`,
    (n) => n.endsWith(`_${ano}_BR.csv`),
  )) {
    if (r.CD_CARGO !== '1' || r.NR_TURNO !== '1') continue;
    const reg = mun[codMun(r.CD_MUNICIPIO)];
    if (!reg) continue;
    reg.aptos += num(r, 'QT_APTOS');
    reg.comp += num(r, 'QT_COMPARECIMENTO');
    reg.brancos += num(r, 'QT_VOTOS_BRANCOS');
    reg.nulos += num(r, 'QT_TOTAL_VOTOS_NULOS', 'QT_VOTOS_NULOS');
  }

  for (const [cd, s] of Object.entries(segundo)) {
    if (mun[cd] && s.total > 0) mun[cd].seg = s.a / s.total;
  }
  const candidatos = [...cands.values()].sort((a, b) => b.votos - a.votos);
  console.log(`  ${Object.keys(mun).length} municípios; ${candidatos.map((c) => `${c.nome} ${c.votos.toLocaleString('pt-BR')}`).slice(0, 4).join(' · ')}`);
  return { ano, vencedor2T, candidatos, municipios: mun };
}

// ---------------------------------------------------------------- malhas do IBGE
async function prepararGeo() {
  console.log('• Malhas geográficas do IBGE');
  type FC = { type: string; features: { type: string; properties: Record<string, string>; geometry: unknown }[] };
  const ufs = await json<FC>(`${IBGE}/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF`);
  for (const f of ufs.features) f.properties = { uf: UF_POR_CODIGO_IBGE[f.properties.codarea] ?? f.properties.codarea };
  await salvar(join(DIR_GEO, 'ufs.json'), ufs);

  const muns = await json<FC>(`${IBGE}/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`);
  const porUf: Record<string, FC> = {};
  for (const f of muns.features) {
    const uf = UF_POR_CODIGO_IBGE[f.properties.codarea.slice(0, 2)];
    if (!uf) continue;
    (porUf[uf] ??= { type: 'FeatureCollection', features: [] }).features.push({ ...f, properties: { ibge: f.properties.codarea } });
  }
  for (const [uf, fc] of Object.entries(porUf)) await writeFile(join(DIR_GEO, `mun-${uf}.json`), JSON.stringify(fc));
  console.log(`  ✓ ${Object.keys(porUf).length} malhas estaduais de municípios`);
}

async function main() {
  const t0 = Date.now();
  await mkdir(DIR_BASE, { recursive: true });
  await mkdir(DIR_GEO, { recursive: true });

  await salvar(join(DIR_BASE, 'municipios.json'), await prepararMunicipios());
  for (const ano of [...new Set([2022, ...ANOS_BASE_AO_VIVO, ...ANOS_BASE_SIMULACAO])].sort()) {
    await salvar(join(DIR_BASE, `presidente-${ano}.json`), await prepararPresidente(ano));
  }
  await prepararGeo();
  console.log(`\nBase histórica pronta em ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
}

main().catch((e) => {
  console.error('\nFalha ao preparar os dados:', e);
  process.exit(1);
});

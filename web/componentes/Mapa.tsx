import { useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { EstadoCorrida, UnidadeResumo } from '../../shared/tipos.ts';
import { fmtCompacto, fmtPct, titulo } from '../formato.ts';

type Malha = FeatureCollection<Geometry, { uf?: string; ibge?: string }>;
const cacheGeo = new Map<string, Promise<Malha>>();

/** O d3-geo usa geometria esférica: anéis no sentido anti-horário (padrão RFC 7946) viram "o mundo todo menos o polígono". */
function corrigirOrientacao(m: Malha): Malha {
  for (const f of m.features) {
    if (geoArea(f) <= 2 * Math.PI) continue;
    const g = f.geometry;
    if (g.type === 'Polygon') g.coordinates.forEach((anel: Position[]) => anel.reverse());
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((pol) => pol.forEach((anel: Position[]) => anel.reverse()));
  }
  return m;
}

function carregarGeo(chave: string): Promise<Malha> {
  let p = cacheGeo.get(chave);
  if (!p) {
    p = fetch(chave === 'ufs' ? '/api/geo/ufs' : `/api/geo/mun/${chave}`).then((r) => r.json()).then(corrigirOrientacao);
    cacheGeo.set(chave, p);
  }
  return p;
}

interface Resumo {
  nome: string;
  pst: number;
  eleitorado: number;
  validos: number;
  votos: Record<string, number>;
  projetado?: Record<string, number>;
}

const NOMES_UF: Record<string, string> = {
  ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal', es: 'Espírito Santo',
  go: 'Goiás', ma: 'Maranhão', mt: 'Mato Grosso', ms: 'Mato Grosso do Sul', mg: 'Minas Gerais', pa: 'Pará', pb: 'Paraíba', pr: 'Paraná',
  pe: 'Pernambuco', pi: 'Piauí', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', rs: 'Rio Grande do Sul', ro: 'Rondônia', rr: 'Roraima',
  sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe', to: 'Tocantins',
};

function lider(votos: Record<string, number>): [string, number, number] | null {
  const ord = Object.entries(votos).sort((a, b) => b[1] - a[1]);
  if (!ord.length || ord[0][1] <= 0) return null;
  const total = ord.reduce((a, [, v]) => a + v, 0);
  return [ord[0][0], ord[0][1] / total, ((ord[0][1] - (ord[1]?.[1] ?? 0)) / total)];
}

export function Mapa({ estado, unidades, aoSelecionarUf }: { estado: EstadoCorrida; unidades: UnidadeResumo[] | null; aoSelecionarUf?: (uf: string) => void }) {
  const nacional = true;
  const [ufAberta, setUfAberta] = useState<string | null>(null);
  const [malha, setMalha] = useState<Malha | null>(null);
  const [dica, setDica] = useState<{ x: number; y: number; r: Resumo } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => { setUfAberta(null); }, [estado.corrida.id]);
  useEffect(() => {
    let vivo = true;
    setMalha(null);
    carregarGeo(ufAberta ?? 'ufs').then((m) => vivo && setMalha(m)).catch(() => {});
    return () => { vivo = false; };
  }, [ufAberta]);

  const cores = useMemo(() => new Map(estado.candidatos.map((c) => [c.numero, c.cor])), [estado.candidatos]);
  const nomes = useMemo(() => new Map(estado.candidatos.map((c) => [c.numero, titulo(c.nome)])), [estado.candidatos]);

  // resumos por feição (UF no mapa nacional, município no estadual)
  const resumos = useMemo(() => {
    const m = new Map<string, Resumo>();
    if (!unidades) return m;
    if (!ufAberta) {
      for (const u of unidades) {
        if (u.uf === 'zz') continue;
        const r = m.get(u.uf) ?? { nome: NOMES_UF[u.uf] ?? u.uf, pst: 0, eleitorado: 0, validos: 0, votos: {}, projetado: {} };
        r.eleitorado += u.eleitorado;
        r.pst += u.pst * u.eleitorado;
        r.validos += u.validos;
        for (const [n, v] of Object.entries(u.votos)) r.votos[n] = (r.votos[n] ?? 0) + v;
        if (u.projetado) for (const [n, f] of Object.entries(u.projetado)) r.projetado![n] = (r.projetado![n] ?? 0) + f * u.eleitorado;
        m.set(u.uf, r);
      }
      for (const r of m.values()) {
        r.pst = r.eleitorado ? r.pst / r.eleitorado : 0;
        for (const n of Object.keys(r.projetado!)) r.projetado![n] /= r.eleitorado || 1;
      }
    } else {
      for (const u of unidades) if (u.uf === ufAberta && u.ibge) m.set(u.ibge, { nome: titulo(u.nome), pst: u.pst, eleitorado: u.eleitorado, validos: u.validos, votos: u.votos, projetado: u.projetado });
    }
    return m;
  }, [unidades, ufAberta]);

  const L = 600;
  const desenho = useMemo(() => {
    if (!malha) return null;
    const proj = geoMercator();
    const caminho = geoPath(proj);
    proj.fitWidth(L - 16, malha);
    const [[x0, y0], [x1, y1]] = caminho.bounds(malha);
    const altura = Math.min(640, Math.max(260, y1 - y0 + 16));
    proj.fitExtent([[8, 8], [L - 8, altura - 8]], malha);
    return { altura, feicoes: malha.features.map((f) => ({ chave: (f.properties.uf ?? f.properties.ibge)!, d: caminho(f) ?? '' })), x0, x1 };
  }, [malha]);

  const coresUsadas = new Set<string>();
  const preenchimento = (r: Resumo | undefined) => {
    if (!r) return { fill: 'var(--mapa-vazio)', opacity: 1 };
    const obs = r.validos > 0 ? lider(r.votos) : null;
    if (obs) {
      const cor = cores.get(obs[0]) ?? 'var(--accent)';
      coresUsadas.add(obs[0]);
      const intens = 0.35 + 0.65 * Math.min(1, obs[2] / 0.3);
      return { fill: cor, opacity: r.pst < 0.999 ? Math.max(0.3, intens * (0.55 + 0.45 * r.pst)) : intens };
    }
    if (r.projetado) {
      const pl = lider(r.projetado);
      if (pl) {
        coresUsadas.add(pl[0]);
        return { fill: `url(#hach-${pl[0]})`, opacity: 1 };
      }
    }
    return { fill: 'var(--mapa-vazio)', opacity: 1 };
  };

  const titulo2 = ufAberta ? (NOMES_UF[ufAberta] ?? ufAberta.toUpperCase()) : 'Brasil';
  const paleta = [...cores.entries()];

  return (
    <>
      <h2>
        Mapa · {titulo2}
        {nacional && ufAberta && <button className="voltar" onClick={() => setUfAberta(null)} style={{ marginLeft: 6 }}>← Brasil</button>}
        {ufAberta && aoSelecionarUf && <button className="voltar" onClick={() => aoSelecionarUf(ufAberta)}>Resumo do estado</button>}
        <span className="extra muted">{nacional && !ufAberta ? 'clique em um estado para o resumo' : 'por município'}</span>
      </h2>
      <div className="mapa-caixa" ref={caixa} onMouseLeave={() => setDica(null)}>
        {!desenho ? (
          <div className="esqueleto" style={{ height: 420 }} />
        ) : (
          <svg viewBox={`0 0 ${L} ${desenho.altura}`} role="img" aria-label={`Mapa de ${titulo2} colorido pelo candidato mais votado`}>
            <defs>
              {paleta.map(([n, cor]) => (
                <pattern key={n} id={`hach-${n}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="var(--mapa-vazio)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={cor} strokeWidth="2.6" opacity="0.75" />
                </pattern>
              ))}
            </defs>
            {desenho.feicoes.map((f) => {
              const r = resumos.get(f.chave);
              const p = preenchimento(r);
              return (
                <path
                  key={f.chave}
                  d={f.d}
                  fill={p.fill}
                  fillOpacity={p.opacity}
                  className={nacional && !ufAberta ? 'clicavel' : undefined}
                  onClick={nacional && !ufAberta ? () => { setDica(null); setUfAberta(f.chave); aoSelecionarUf?.(f.chave); } : undefined}
                  onMouseMove={(ev) => {
                    if (!r || !caixa.current) return;
                    const b = caixa.current.getBoundingClientRect();
                    setDica({ x: ev.clientX - b.left, y: ev.clientY - b.top, r });
                  }}
                />
              );
            })}
          </svg>
        )}
        {dica && (
          <div className="dica" style={{ left: Math.min(dica.x + 14, (caixa.current?.clientWidth ?? 400) - 220), top: dica.y + 14 }}>
            <h4>{dica.r.nome}</h4>
            <div className="muted" style={{ marginBottom: 6 }}>
              {fmtPct(dica.r.pst, 1)} apurado · {fmtCompacto(dica.r.eleitorado)} eleitores
            </div>
            {dica.r.validos > 0
              ? Object.entries(dica.r.votos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => (
                <div className="linha" key={n}>
                  <span><i style={{ background: cores.get(n) }} />{nomes.get(n) ?? n}</span>
                  <strong className="num">{fmtPct(v / dica.r.validos, 1)}</strong>
                </div>
              ))
              : <div className="muted">Sem votos apurados</div>}
            {dica.r.projetado && dica.r.pst < 0.999 && (
              <div className="muted" style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                Projeção: {Object.entries(dica.r.projetado).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, f]) => `${(nomes.get(n) ?? n).split(' ')[0]} ${fmtPct(f, 1)}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mapa-legenda">
        {[...coresUsadas].slice(0, 5).map((n) => <span key={n}><i style={{ background: cores.get(n) }} />{nomes.get(n)}</span>)}
        <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--muted) 0 2px, var(--mapa-vazio) 2px 5px)' }} />ainda sem votos (líder projetado)</span>
        <span>cor mais forte = vantagem maior</span>
      </div>
    </>
  );
}

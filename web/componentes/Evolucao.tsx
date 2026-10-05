import { useState } from 'react';
import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtPct, titulo } from '../formato.ts';

const L = 640, A = 270;
const M = { e: 44, d: 110, t: 14, b: 30 };

export function Evolucao({ estado }: { estado: EstadoCorrida }) {
  const [foco, setFoco] = useState<number | null>(null);
  const h = estado.historico;
  if (h.length < 1) return <div className="vazio">O gráfico aparece com as primeiras atualizações da apuração.</div>;

  const ultimo = h[h.length - 1];
  const base = Object.keys(ultimo.projetado).length ? ultimo.projetado : null;
  // foca nos competitivos: no mínimo os que disputam as vagas (+1), e quem tem ≥ 12%
  const fracao = (n: string) => (base ? base[n].m : ultimo.observado[n]);
  const minimo = 2;
  const principais = Object.keys(base ?? ultimo.observado)
    .sort((a, b) => fracao(b) - fracao(a))
    .filter((n, i) => i < minimo || fracao(n) >= 0.12)
    .slice(0, 4);
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));

  let min = 1, max = 0;
  for (const p of h) {
    for (const n of principais) {
      const vals = [p.observado[n], p.projetado[n]?.lo, p.projetado[n]?.hi, p.verdade?.[n]].filter((v): v is number => v !== undefined);
      for (const v of vals) { min = Math.min(min, v); max = Math.max(max, v); }
    }
  }
  const folga = Math.max(0.01, (max - min) * 0.08);
  min = Math.max(0, min - folga);
  max = Math.min(1, max + folga);

  const xMax = Math.max(0.05, ...h.map((p) => p.pst));
  const x = (v: number) => M.e + (v / Math.max(xMax, 0.25)) * (L - M.e - M.d);
  const y = (v: number) => M.t + (1 - (v - min) / (max - min)) * (A - M.t - M.b);
  const linha = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join('');

  const passo = (max - min) > 0.3 ? 0.1 : (max - min) > 0.12 ? 0.05 : (max - min) > 0.05 ? 0.02 : 0.01;
  const ticksY: number[] = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max; v += passo) ticksY.push(v);
  const ticksX = [0, 0.25, 0.5, 0.75, 1].filter((v) => v <= Math.max(xMax, 0.25) + 1e-9);

  // posições dos rótulos à direita sem sobreposição
  const rotulos = principais.map((n) => {
    const v = ultimo.projetado[n]?.m ?? ultimo.observado[n] ?? 0;
    return { n, yy: y(v), v };
  }).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < rotulos.length; i++) if (rotulos[i].yy - rotulos[i - 1].yy < 26) rotulos[i].yy = rotulos[i - 1].yy + 26;

  const pf = foco !== null ? h[foco] : null;

  return (
    <div className="grafico">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        role="img"
        aria-label="Evolução das frações apurada e projetada ao longo da apuração"
        onMouseMove={(ev) => {
          const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((ev.clientX - r.left) / r.width) * L;
          let melhor = 0, dist = Infinity;
          h.forEach((p, i) => { const d = Math.abs(x(p.pst) - px); if (d < dist) { dist = d; melhor = i; } });
          setFoco(melhor);
        }}
        onMouseLeave={() => setFoco(null)}
      >
        <g className="eixo">
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={M.e} x2={L - M.d} y1={y(v)} y2={y(v)} />
              <text x={M.e - 6} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text>
            </g>
          ))}
          {ticksX.map((v) => <text key={v} x={x(v)} y={A - 8} textAnchor="middle">{Math.round(v * 100)}%</text>)}
          <line className="eixo-base" x1={M.e} x2={L - M.d} y1={A - M.b} y2={A - M.b} />
        </g>
        {estado.corrida.maioriaAbsoluta && 0.5 > min && 0.5 < max && (
          <line x1={M.e} x2={L - M.d} y1={y(0.5)} y2={y(0.5)} stroke="var(--muted)" strokeDasharray="2 4" />
        )}
        {principais.map((n) => {
          const cor = cand.get(n)?.cor ?? 'var(--accent)';
          const comProj = h.filter((p) => p.projetado[n]);
          const faixa = comProj.length > 1
            ? `${linha(comProj.map((p) => [p.pst, p.projetado[n].hi]))}L${[...comProj].reverse().map((p) => `${x(p.pst).toFixed(1)},${y(p.projetado[n].lo).toFixed(1)}`).join('L')}Z`
            : null;
          const verdade = ultimo.verdade?.[n];
          return (
            <g key={n}>
              {faixa && <path d={faixa} fill={cor} opacity={0.14} />}
              {comProj.length > 1 && <path d={linha(comProj.map((p) => [p.pst, p.projetado[n].m]))} fill="none" stroke={cor} strokeWidth={2} strokeDasharray="6 4" />}
              <path d={linha(h.filter((p) => p.observado[n] !== undefined).map((p) => [p.pst, p.observado[n]]))} fill="none" stroke={cor} strokeWidth={2.4} strokeLinejoin="round" />
              {verdade !== undefined && (
                <line x1={M.e} x2={L - M.d} y1={y(verdade)} y2={y(verdade)} stroke={cor} strokeWidth={1} strokeDasharray="1 3" opacity={0.9} />
              )}
            </g>
          );
        })}
        {rotulos.map(({ n, yy, v }) => (
          <g key={n}>
            <text x={L - M.d + 8} y={yy - 2} style={{ fill: cand.get(n)?.cor, fontWeight: 700, fontSize: 12 }}>{titulo(cand.get(n)?.nome ?? n).split(' ').slice(0, 2).join(' ')}</text>
            <text x={L - M.d + 8} y={yy + 11} style={{ fontSize: 11 }}>{fmtPct(v, 1)}</text>
          </g>
        ))}
        {pf && (
          <g>
            <line x1={x(pf.pst)} x2={x(pf.pst)} y1={M.t} y2={A - M.b} stroke="var(--text)" opacity={0.25} />
            {principais.map((n) => pf.observado[n] !== undefined && (
              <circle key={n} cx={x(pf.pst)} cy={y(pf.observado[n])} r={4} fill={cand.get(n)?.cor} stroke="var(--surface)" strokeWidth={1.5} />
            ))}
          </g>
        )}
      </svg>
      <div className="legenda-barra" style={{ justifyContent: 'space-between' }}>
        <span>
          <span style={{ marginRight: 14 }}><i style={{ width: 18, height: 2.5, background: 'var(--text-2)' }} />apurado</span>
          <span style={{ marginRight: 14 }}><i style={{ width: 18, height: 0, borderTop: '2px dashed var(--text-2)' }} />projeção</span>
          <span style={{ marginRight: 14 }}><i style={{ width: 14, height: 10, background: 'var(--text-2)', opacity: 0.2 }} />intervalo de 95%</span>
          {ultimo.verdade && <span><i style={{ width: 18, height: 0, borderTop: '2px dotted var(--text-2)' }} />resultado final real</span>}
        </span>
        {pf && (
          <span className="num">
            {fmtPct(pf.pst, 1)} apurado:{' '}
            {principais.map((n) => `${titulo(cand.get(n)?.nome ?? n).split(' ')[0]} ${fmtPct(pf.observado[n] ?? 0, 1)}${pf.projetado[n] ? ` → ${fmtPct(pf.projetado[n].m, 1)}` : ''}`).join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

/** Evolução da chance de 2º turno e de vitória no 1º turno ao longo da apuração. */
export function EvolucaoProbabilidades({ estado }: { estado: EstadoCorrida }) {
  const pts = estado.historico.filter((p) => p.probs);
  if (pts.length < 2) return <div className="vazio">As probabilidades aparecem ao longo da apuração.</div>;
  const LP = 480, AP = 250;
  const MP = { e: 40, d: 12, t: 12, b: 30 };
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const xMax = Math.max(0.25, ...pts.map((p) => p.pst));
  const x = (v: number) => MP.e + (v / xMax) * (LP - MP.e - MP.d);
  const y = (v: number) => MP.t + (1 - v) * (AP - MP.t - MP.b);
  const linha = (vals: [number, number][]) => vals.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join('');
  const maioria = estado.corrida.maioriaAbsoluta;
  const numeros = [...new Set(pts.flatMap((p) => Object.keys(p.probs!.vitoria)))]
    .filter((n) => pts.some((p) => (p.probs!.vitoria[n] ?? 0) > 0.02));
  const ultimo = pts[pts.length - 1].probs!;
  const series = [
    ...(maioria ? [{ chave: '2t', rotulo: '2º turno', cor: 'var(--accent)', vals: pts.map((p) => [p.pst, p.probs!.segundoTurno] as [number, number]), fim: ultimo.segundoTurno }] : []),
    ...numeros.map((n) => ({
      chave: n,
      rotulo: `${titulo(cand.get(n)?.nome ?? n).split(' ')[0]} ${maioria ? 'no 1º turno' : 'vence'}`,
      cor: cand.get(n)?.cor ?? 'var(--muted)',
      vals: pts.map((p) => [p.pst, p.probs!.vitoria[n] ?? 0] as [number, number]),
      fim: ultimo.vitoria[n] ?? 0,
    })),
  ];
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${LP} ${AP}`} role="img" aria-label="Evolução das probabilidades durante a apuração">
        <g className="eixo">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={MP.e} x2={LP - MP.d} y1={y(v)} y2={y(v)} />
              <text x={MP.e - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].filter((v) => v <= xMax + 1e-9).map((v) => <text key={v} x={x(v)} y={AP - 8} textAnchor="middle">{v * 100}%</text>)}
        </g>
        {series.map((s) => <path key={s.chave} d={linha(s.vals)} fill="none" stroke={s.cor} strokeWidth={2.4} strokeLinejoin="round" />)}
      </svg>
      <div className="legenda-barra">
        {series.map((s) => (
          <span key={s.chave}><i style={{ width: 18, height: 3, background: s.cor }} />{s.rotulo}: <strong className="num">{fmtPct(s.fim, 1)}</strong></span>
        ))}
      </div>
    </div>
  );
}

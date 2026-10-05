import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtPct, fmtProb, titulo } from '../formato.ts';

const L = 640, A = 230;
const M = { e: 16, d: 16, t: 28, b: 30 };

/** Histograma das frações finais simuladas dos dois primeiros colocados. */
export function Distribuicao({ estado }: { estado: EstadoCorrida }) {
  const p = estado.projecao;
  const h = p?.disponivel ? p.histograma : null;
  if (!p || !h) return <div className="vazio">A distribuição aparece quando o modelo estiver calibrado.</div>;

  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const bins = h.series[0].contagens.length;
  const maxY = Math.max(...h.series.flatMap((s) => s.contagens), 1e-9);
  const x = (v: number) => M.e + ((v - h.inicio) / (h.fim - h.inicio)) * (L - M.e - M.d);
  const y = (v: number) => A - M.b - (v / maxY) * (A - M.t - M.b);
  const largura = (L - M.e - M.d) / bins;
  const passo = h.fim - h.inicio > 0.3 ? 0.1 : h.fim - h.inicio > 0.12 ? 0.05 : h.fim - h.inicio > 0.05 ? 0.02 : 0.01;
  const ticks: number[] = [];
  for (let v = Math.ceil(h.inicio / passo) * passo; v <= h.fim + 1e-9; v += passo) ticks.push(v);
  const maioria = estado.corrida.maioriaAbsoluta && h.inicio < 0.5 && h.fim > 0.5;

  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Distribuição simulada da fração de votos válidos dos dois primeiros colocados">
        <g className="eixo">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={M.t} y2={A - M.b} />
              <text x={x(v)} y={A - 10} textAnchor="middle">{(100 * v).toFixed(passo < 0.02 ? 1 : 0)}%</text>
            </g>
          ))}
          <line className="eixo-base" x1={M.e} x2={L - M.d} y1={A - M.b} y2={A - M.b} />
        </g>
        {h.series.map((s) => {
          const cor = cand.get(s.numero)?.cor ?? 'var(--accent)';
          return (
            <g key={s.numero}>
              {s.contagens.map((v, i) => v > 0 && (
                <rect key={i} x={M.e + i * largura + 0.5} y={y(v)} width={Math.max(0.5, largura - 1)} height={A - M.b - y(v)} fill={cor} opacity={0.62} rx={1} />
              ))}
            </g>
          );
        })}
        {maioria && (
          <g>
            <line x1={x(0.5)} x2={x(0.5)} y1={M.t - 8} y2={A - M.b} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x(0.5) + (x(0.5) > L * 0.7 ? -5 : 5)} y={M.t - 12} textAnchor={x(0.5) > L * 0.7 ? 'end' : 'start'} style={{ fill: 'var(--text)', fontWeight: 650 }}>50% — maioria absoluta</text>
          </g>
        )}
      </svg>
      <div className="legenda-barra">
        {h.series.map((s) => {
          const c = p.candidatos.find((x) => x.numero === s.numero);
          return (
            <span key={s.numero}>
              <i style={{ width: 12, height: 12, borderRadius: 3, background: cand.get(s.numero)?.cor }} />
              <strong>{titulo(cand.get(s.numero)?.nome ?? s.numero)}</strong>
              {c && <> · mediana {fmtPct(c.p50, 1)} · 95% dos cenários entre {fmtPct(c.p025, 1)} e {fmtPct(c.p975, 1)}{estado.corrida.maioriaAbsoluta ? ` · acima de 50% em ${fmtProb(c.probVitoria)}` : ''}</>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

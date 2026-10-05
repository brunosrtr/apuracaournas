import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtPct, titulo } from '../formato.ts';

const L = 640, A = 240;
const M = { e: 48, d: 20, t: 12, b: 30 };

export function Validacao({ estado }: { estado: EstadoCorrida }) {
  const v = estado.validacao;
  const pontos = v?.pontos ?? [];
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const finais = Object.entries(v?.final ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (pontos.length < 2) {
    return (
      <div className="cartao">
        <div className="vazio">Inicie a simulação: a cada atualização, a projeção é comparada com o resultado final real de 2022.</div>
      </div>
    );
  }
  const maxErro = Math.max(0.01, ...pontos.map((p) => Math.max(p.erroParcial, p.erroProjecao)));
  const x = (pst: number) => M.e + pst * (L - M.e - M.d);
  const y = (e: number) => M.t + (1 - e / maxErro) * (A - M.t - M.b);
  const caminho = (k: 'erroProjecao' | 'erroParcial') => pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.pst).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const cobertura = pontos.reduce((a, p) => a + p.cobertura80, 0) / pontos.length;
  const cobertura95 = pontos.reduce((a, p) => a + p.cobertura95, 0) / pontos.length;
  const marco = pontos.find((p) => p.erroProjecao < 0.005);
  const ticks = [0, maxErro / 2, maxErro];

  return (
    <div className="grade">
      <section className="cartao col-7">
        <h2>Erro médio dos 4 principais candidatos<span className="extra muted">pontos percentuais</span></h2>
        <div className="grafico">
          <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Erro da projeção comparado ao erro do resultado parcial">
            <g className="eixo">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.e} x2={L - M.d} y1={y(t)} y2={y(t)} />
                  <text x={M.e - 6} y={y(t) + 4} textAnchor="end">{(100 * t).toFixed(1)}</text>
                </g>
              ))}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={x(t)} y={A - 8} textAnchor="middle">{Math.round(t * 100)}%</text>)}
            </g>
            <path d={caminho('erroParcial')} fill="none" stroke="var(--muted)" strokeWidth={2.2} />
            <path d={caminho('erroProjecao')} fill="none" stroke="var(--ok)" strokeWidth={2.6} />
          </svg>
        </div>
        <div className="legenda-barra">
          <span><i style={{ width: 18, height: 3, background: 'var(--muted)' }} />olhando só o parcial</span>
          <span><i style={{ width: 18, height: 3, background: 'var(--ok)' }} />projeção do modelo</span>
        </div>
      </section>
      <section className="cartao col-5">
        <h2>Resumo</h2>
        <div className="metricas" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="metrica"><span>Cobertura do intervalo de 80%</span><strong className="num">{fmtPct(cobertura, 0)}</strong></div>
          <div className="metrica"><span>Cobertura da margem de 95%</span><strong className="num">{fmtPct(cobertura95, 0)}</strong></div>
          <div className="metrica"><span>Erro &lt; 0,5 p.p. a partir de</span><strong className="num">{marco ? `${fmtPct(marco.pst, 1)} apurado` : '—'}</strong></div>
        </div>
        <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 650, margin: '18px 0 8px' }}>Resultado real (1º turno 2022)</div>
        {finais.map(([n, f]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span className="tag"><i style={{ background: cand.get(n)?.cor }} />{titulo(cand.get(n)?.nome ?? n)}</span>
            <strong className="num">{fmtPct(f)}</strong>
          </div>
        ))}
        <p className="aviso">O ideal é a cobertura ficar perto do nível nominal (80% e 95%): bem acima significa intervalos largos demais; bem abaixo, confiança excessiva.</p>
      </section>
    </div>
  );
}

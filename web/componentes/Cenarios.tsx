import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtCompacto, fmtPct, fmtProb, titulo } from '../formato.ts';

function BarraProb({ rotulo, prob, cor, detalhe }: { rotulo: string; prob: number; cor: string; detalhe?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 4, gap: 8 }}>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotulo}</span>
        <strong className="num">{fmtProb(prob)}</strong>
      </div>
      <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0.5, prob * 100)}%`, background: cor, borderRadius: 4, transition: 'width .6s' }} />
      </div>
      {detalhe && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{detalhe}</div>}
    </div>
  );
}

const Titulo = ({ children }: { children: string }) => (
  <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 650, margin: '16px 0 8px' }}>{children}</div>
);

export function Cenarios({ estado }: { estado: EstadoCorrida }) {
  const p = estado.projecao;
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const nome = (n: string) => titulo(cand.get(n)?.nome ?? n);
  const cor = (n: string) => cand.get(n)?.cor ?? 'var(--accent)';

  if (!p?.disponivel) {
    return (
      <>
        <h2>Probabilidades</h2>
        <div className="vazio">{p?.motivo ?? 'As probabilidades aparecem quando houver votos apurados suficientes para calibrar o modelo.'}</div>
      </>
    );
  }

  const maioria = estado.corrida.maioriaAbsoluta;
  const reais = p.candidatos.filter((c) => !c.agrupado);
  const eleitorado = estado.totais.eleitorado;
  const faixaPct = (f: { media: number; p025: number; p975: number }, base: number) =>
    base > 0 ? `${fmtPct(f.media / base, 1)} (${fmtPct(f.p025 / base, 1)}–${fmtPct(f.p975 / base, 1)})` : '—';

  return (
    <>
      <h2>Probabilidades<span className="extra muted">{p.simulacoes.toLocaleString('pt-BR')} cenários</span></h2>
      {maioria ? (
        <>
          <BarraProb rotulo="Haverá 2º turno" prob={p.probSegundoTurno} cor="var(--accent)" />
          {reais.filter((c) => c.probVitoria >= 0.001).slice(0, 3).map((c) => (
            <BarraProb key={c.numero} rotulo={`${nome(c.numero)} vence no 1º turno`} prob={c.probVitoria} cor={cor(c.numero)} />
          ))}
          {p.paresSegundoTurno.length > 0 && (
            <>
              <Titulo>Confrontos mais prováveis no 2º turno</Titulo>
              {p.paresSegundoTurno.slice(0, 3).map((par) => (
                <BarraProb key={`${par.a}-${par.b}`} rotulo={`${nome(par.a)} × ${nome(par.b)}`} prob={par.prob} cor={`linear-gradient(90deg, ${cor(par.a)}, ${cor(par.b)})`} />
              ))}
            </>
          )}
          <Titulo>Termina em 1º lugar</Titulo>
          {[...reais].sort((a, b) => b.probPrimeiro - a.probPrimeiro).filter((c) => c.probPrimeiro >= 0.001).slice(0, 3).map((c) => (
            <BarraProb key={c.numero} rotulo={nome(c.numero)} prob={c.probPrimeiro} cor={cor(c.numero)} />
          ))}
        </>
      ) : (
        reais.slice(0, 2).map((c) => (
          <BarraProb key={c.numero} rotulo={`${nome(c.numero)} eleito`} prob={c.probVitoria} cor={cor(c.numero)} detalhe={`projeção ${fmtPct(c.media, 1)} dos válidos`} />
        ))
      )}
      <div className="metricas" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', gridTemplateColumns: '1fr 1fr' }}>
        <div className="metrica"><span>Comparecimento projetado (IC 95%)</span><strong className="num" style={{ fontSize: 14 }}>{faixaPct(p.comparecimento, eleitorado)}</strong></div>
        <div className="metrica">
          <span>Brancos + nulos projetados</span>
          <strong className="num" style={{ fontSize: 14 }}>
            {fmtPct(p.brancosNulos.media, 1)}
            {p.brancosNulos.p975 - p.brancosNulos.p025 > 0.001 && ` (${fmtPct(p.brancosNulos.p025, 1)}–${fmtPct(p.brancosNulos.p975, 1)})`}
          </strong>
        </div>
        <div className="metrica"><span>Votos válidos projetados</span><strong className="num" style={{ fontSize: 14 }}>{fmtCompacto(p.validos.media)} ({fmtCompacto(p.validos.p025)}–{fmtCompacto(p.validos.p975)})</strong></div>
        <div className="metrica"><span>Abstenção projetada</span><strong className="num" style={{ fontSize: 14 }}>{eleitorado > 0 ? fmtPct(1 - p.comparecimento.media / eleitorado, 1) : '—'}</strong></div>
      </div>
    </>
  );
}

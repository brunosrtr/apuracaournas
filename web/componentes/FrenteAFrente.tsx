import type { Candidato, EstadoCorrida, ProjecaoCandidato } from '../../shared/tipos.ts';
import { fmtCompacto, fmtInt, fmtPct, fmtPP, fmtProb, titulo } from '../formato.ts';
import { Foto } from './Candidatos.tsx';

interface Lado {
  c: Candidato;
  votos: number;
  apurado: number;
  pj: ProjecaoCandidato | undefined;
  /** fração dos válidos no 1º turno (contexto antes e durante a apuração) */
  primeiro: number | undefined;
}

function CartaoCandidato({ lado, estado, direita, temVotos }: { lado: Lado; estado: EstadoCorrida; direita?: boolean; temVotos: boolean }) {
  const { c, pj } = lado;
  const favorito = (pj?.probVitoria ?? 0) >= 0.5;
  return (
    <div className={`faf-lado${direita ? ' direita' : ''}`}>
      <div className="faf-id">
        <Foto c={c} estado={estado} tamanho={64} />
        <div style={{ minWidth: 0 }}>
          <div className="faf-nome" title={titulo(c.nomeCompleto)}>{titulo(c.nome)}</div>
          <div className="faf-partido">{c.numero} · {c.partido}</div>
        </div>
      </div>
      <div className="faf-rotulo">{pj ? 'Projeção final' : 'Apurado'}</div>
      <div className="faf-numero num" style={{ color: c.cor }}>
        {pj ? fmtPct(pj.media, 1) : temVotos ? fmtPct(lado.apurado, 2) : '—'}
        {pj && <small>±{'\u00a0'}{fmtPP(pj.margem95)}</small>}
      </div>
      <div className="faf-detalhe num">
        {pj && <div>apurado <strong>{fmtPct(lado.apurado, 2)}</strong></div>}
        <div className="muted">{temVotos ? `${fmtInt(lado.votos)} votos` : 'aguardando votos'}</div>
        {lado.primeiro !== undefined && <div className="muted">1º turno: {fmtPct(lado.primeiro, 1)}</div>}
      </div>
      {pj && (
        <div className={`faf-chance${favorito ? ' favorito' : ''}`} style={favorito ? { background: c.cor } : undefined}>
          <span className="faf-chance-rotulo">Chance de vitória</span><span className="faf-chance-curto">Chance</span> <strong className="num">{fmtProb(pj.probVitoria)}</strong>
        </div>
      )}
    </div>
  );
}

/** Painel principal do 2º turno: os dois candidatos, a barra de disputa e o que falta para virar. */
export function FrenteAFrente({ estado }: { estado: EstadoCorrida }) {
  const t = estado.totais;
  const p = estado.projecao?.disponivel ? estado.projecao : null;
  const validos = estado.candidatos.filter((c) => c.destinacao === 'Válido');
  if (validos.length < 2) return <div className="vazio">Os candidatos aparecem quando o TSE publicar a eleição.</div>;

  const lados: Lado[] = validos.slice(0, 2).map((c) => ({
    c,
    votos: t.votos[c.numero] ?? 0,
    apurado: t.validos > 0 ? (t.votos[c.numero] ?? 0) / t.validos : 0,
    pj: p?.candidatos.find((x) => x.numero === c.numero),
    primeiro: estado.corrida.turno === 2 ? estado.nacional.anteriorFinal[c.numero] : undefined,
  }));
  // à esquerda, quem lidera a projeção (ou o parcial, antes de haver projeção)
  lados.sort((a, b) => (b.pj?.media ?? b.apurado) - (a.pj?.media ?? a.apurado));
  const [a, b] = lados;
  const temVotos = t.validos > 0;
  const pos = (v: number) => `${(100 * Math.min(1, Math.max(0, v))).toFixed(2)}%`;

  // quanto o candidato atrás no parcial precisa dos válidos restantes para virar. Vem do
  // servidor (calculado sobre a mesma apuração da projeção), para não misturar uma contagem
  // mais nova com uma projeção feita um instante antes.
  const restantes = p?.restante.validos.media ?? 0;
  const [, atras] = a.votos >= b.votos ? [a, b] : [b, a];
  const lider = p?.candidatos.find((c) => !c.agrupado)?.numero;
  const { liderPrecisa, liderProjetado } = p?.restante ?? { liderPrecisa: null, liderProjetado: null };
  const atrasELider = atras.c.numero === lider;
  const precisa = liderPrecisa === null ? null : atrasELider ? liderPrecisa : 1 - liderPrecisa;
  const projetadoAtras = liderProjetado === null ? null : atrasELider ? liderProjetado : 1 - liderProjetado;
  const l = p?.lideranca;

  return (
    <section className="cartao col-12 faf">
      <div className="faf-cabeca">
        <CartaoCandidato lado={a} estado={estado} temVotos={temVotos} />
        <div className="faf-centro">
          <span className="faf-x">×</span>
          <span className="muted">2º turno</span>
        </div>
        <CartaoCandidato lado={b} estado={estado} direita temVotos={temVotos} />
      </div>

      <div className="faf-barra" aria-label={`Apurado: ${titulo(a.c.nome)} ${fmtPct(a.apurado, 1)}, ${titulo(b.c.nome)} ${fmtPct(b.apurado, 1)}`}>
        <div className="faf-trilho">
          {temVotos ? (
            <>
              <div className="faf-seg" style={{ width: pos(a.apurado), background: a.c.cor }} />
              <div className="faf-seg" style={{ width: pos(b.apurado), background: b.c.cor }} />
            </>
          ) : <div className="faf-seg vazio" style={{ width: '100%' }} />}
        </div>
        {a.pj && (
          <>
            <div className="faf-faixa" style={{ left: pos(a.pj.p025), width: `calc(${pos(a.pj.p975)} - ${pos(a.pj.p025)})` }} />
            <div className="faf-marcador" style={{ left: pos(a.pj.media) }} title={`Projeção: ${fmtPct(a.pj.media, 2)}`} />
          </>
        )}
        <div className="faf-meio"><span>50%</span></div>
      </div>
      <div className="faf-legenda">
        <span><i style={{ background: 'var(--text-2)' }} />barra: apurado</span>
        {a.pj && <span><i className="marcador" />projeção de {titulo(a.c.nome).split(' ')[0]}</span>}
        {a.pj && <span><i className="faixa" />margem de erro (95%)</span>}
      </div>

      <div className="faf-kpis">
        <div>
          <span>Vantagem projetada</span>
          <strong className="num">{l ? fmtPP(l.pontos.media) : temVotos ? fmtPP(Math.abs(a.apurado - b.apurado)) : '—'}</strong>
          <small className="num">{l ? `IC 95%: ${fmtPP(l.pontos.p025)} a ${fmtPP(l.pontos.p975)} · ${fmtCompacto(Math.abs(l.votos.media))} votos` : temVotos ? 'no parcial' : 'aguardando votos'}</small>
        </div>
        <div>
          <span>Votos válidos ainda por apurar</span>
          <strong className="num">{p ? fmtCompacto(restantes) : '—'}</strong>
          <small className="num">{p ? `IC 95%: ${fmtCompacto(p.restante.validos.p025)}–${fmtCompacto(p.restante.validos.p975)}` : ''}</small>
        </div>
        <div>
          <span>Para virar</span>
          <strong className="num">{precisa === null ? '—' : precisa > 1 ? 'impossível' : `${fmtPct(precisa, 1)}`}</strong>
          <small>
            {precisa === null ? 'aparece com a projeção'
              : precisa > 1 ? `${titulo(atras.c.nome).split(' ')[0]} não alcança mais`
                : <>dos restantes para {titulo(atras.c.nome).split(' ')[0]}{projetadoAtras !== null && <> · projeção: <strong className="num">{fmtPct(projetadoAtras, 1)}</strong></>}</>}
          </small>
        </div>
        <div>
          <span>Comparecimento projetado</span>
          <strong className="num">{p && t.eleitorado > 0 ? fmtPct(p.comparecimento.media / t.eleitorado, 1) : '—'}</strong>
          <small className="num">{p && t.eleitorado > 0 ? `abstenção ${fmtPct(1 - p.comparecimento.media / t.eleitorado, 1)}` : ''}</small>
        </div>
      </div>
    </section>
  );
}

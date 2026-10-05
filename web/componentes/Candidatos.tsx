import { useState } from 'react';
import type { Candidato, EstadoCorrida, ProjecaoCandidato } from '../../shared/tipos.ts';
import { fmtCompacto, fmtInt, fmtPct, fmtPP, fmtProb, iniciais, titulo } from '../formato.ts';

export function Foto({ c, estado, tamanho = 48 }: { c: Candidato; estado: EstadoCorrida; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const url = estado.corrida.modo === 'ao-vivo' && c.sqcand && !falhou
    ? `/api/foto/${estado.corrida.eleicao}/${estado.corrida.abrangencia}/${c.sqcand}`
    : null;
  return (
    <div className="foto" style={{ background: c.cor, width: tamanho, height: tamanho }} aria-hidden>
      {iniciais(c.nome)}
      {url && <img src={url} alt="" loading="lazy" onError={() => setFalhou(true)} />}
    </div>
  );
}

const VISIVEIS = 6;
const classeProb = (p: number) => (p > 0.9 ? 'forte' : p > 0.5 ? 'medio' : '');

export function Candidatos({ estado, visiveis = VISIVEIS }: { estado: EstadoCorrida; visiveis?: number }) {
  const [todos, setTodos] = useState(false);
  const t = estado.totais;
  const proj = estado.projecao?.disponivel ? estado.projecao : null;
  const porNumero = new Map<string, ProjecaoCandidato>(proj?.candidatos.map((c) => [c.numero, c]) ?? []);
  const maioria = estado.corrida.maioriaAbsoluta;

  const lista = estado.candidatos.filter((c) => c.destinacao === 'Válido' || (t.votos[c.numero] ?? 0) > 0);
  const ordenados = [...lista].sort((a, b) => {
    const pa = porNumero.get(a.numero)?.media, pb = porNumero.get(b.numero)?.media;
    if (pa !== undefined && pb !== undefined && pa !== pb) return pb - pa;
    return (t.votos[b.numero] ?? 0) - (t.votos[a.numero] ?? 0);
  });
  if (!ordenados.length) return <div className="vazio">Os candidatos aparecem assim que o TSE publicar a eleição.</div>;

  let escala = 0.05;
  for (const c of ordenados) {
    escala = Math.max(escala, t.validos > 0 ? (t.votos[c.numero] ?? 0) / t.validos : 0, porNumero.get(c.numero)?.p975 ?? 0);
  }
  escala = Math.min(1, Math.max(maioria ? 0.56 : escala, escala) * 1.08);
  const x = (v: number) => `${(100 * Math.min(1, Math.max(0, v) / escala)).toFixed(2)}%`;
  const exibidos = todos ? ordenados : ordenados.slice(0, visiveis);

  return (
    <>
      <div className="candidatos">
        {exibidos.map((c) => {
          const votos = t.votos[c.numero] ?? 0;
          const frac = t.validos > 0 ? votos / t.validos : 0;
          const pj = porNumero.get(c.numero);
          const anulado = c.destinacao !== 'Válido';
          return (
            <article className="cand" key={c.numero} style={anulado ? { opacity: 0.55 } : undefined}>
              <Foto c={c} estado={estado} />
              <div style={{ minWidth: 0 }}>
                <div className="cand-nome" title={titulo(c.nomeCompleto)}>{titulo(c.nome)}</div>
                <div className="cand-sub">
                  {c.numero} · {c.partido}{c.coligacao && c.coligacao !== c.partido ? ` · ${c.coligacao}` : ''}
                  {anulado && ` · ${c.destinacao}`}
                </div>
              </div>
              <div className="cand-pct">
                {pj ? (
                  <>
                    <strong className="num" title="Projeção do resultado final">{fmtPct(pj.media, 1)}</strong>
                    <span className="num">± {fmtPP(pj.margem95)} · apurado {fmtPct(frac)}</span>
                  </>
                ) : (
                  <>
                    <strong className="num">{fmtPct(frac)}</strong>
                    <span className="num">{fmtInt(votos)} votos</span>
                  </>
                )}
              </div>
              <div className="cand-barra" aria-hidden>
                <div className="trilho" />
                <div className="obs" style={{ width: x(frac), background: c.cor }} />
                {pj && (
                  <>
                    <div className="faixa fina" style={{ left: x(pj.p025), width: `calc(${x(pj.p975)} - ${x(pj.p025)})`, background: c.cor }} />
                    <div className="faixa" style={{ left: x(pj.p10), width: `calc(${x(pj.p90)} - ${x(pj.p10)})`, background: c.cor }} />
                    <div className="media" style={{ left: x(pj.media), background: 'var(--text)' }} />
                  </>
                )}
                {maioria && <div className="meta" style={{ left: x(0.5) }}><span>50%</span></div>}
              </div>
              {pj && (
                <div className="cand-proj">
                  <span className="num">
                    IC 95% <strong>{fmtPct(pj.p025, 1)} – {fmtPct(pj.p975, 1)}</strong>
                    <span className="muted"> · {fmtCompacto(pj.votos.media)} votos ({fmtCompacto(pj.votos.p025)}–{fmtCompacto(pj.votos.p975)}) · apurados {fmtInt(votos)}</span>
                  </span>
                  {!pj.agrupado && pj.probPrimeiro >= 0.005 && <span className={`chip ${classeProb(pj.probPrimeiro)}`}>1º lugar {fmtProb(pj.probPrimeiro)}</span>}
                  {maioria && !pj.agrupado && pj.probVitoria >= 0.005 && <span className={`chip ${classeProb(pj.probVitoria)}`}>Vence no 1º turno {fmtProb(pj.probVitoria)}</span>}
                  {maioria && !pj.agrupado && pj.probSegundoTurno >= 0.005 && <span className={`chip ${classeProb(pj.probSegundoTurno)}`}>2º turno {fmtProb(pj.probSegundoTurno)}</span>}
                  {!maioria && !pj.agrupado && <span className={`chip ${classeProb(pj.probVitoria)}`}>Eleito {fmtProb(pj.probVitoria)}</span>}
                  {pj.agrupado && <span className="chip" title="Candidatos com menos de 1% são projetados em grupo e divididos na proporção apurada">projeção agrupada</span>}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {ordenados.length > visiveis && (
        <button className="mais" onClick={() => setTodos(!todos)}>
          {todos ? 'Mostrar menos' : `Mostrar todos os ${ordenados.length} candidatos`}
        </button>
      )}
      <div className="legenda-barra">
        <span><i style={{ width: 14, height: 8, borderRadius: 4, background: 'var(--muted)' }} />apurado</span>
        {proj && <span><i style={{ width: 3, height: 11, background: 'var(--text)' }} />projeção</span>}
        {proj && <span><i style={{ width: 16, height: 4, background: 'var(--muted)' }} />80%</span>}
        {proj && <span><i style={{ width: 16, height: 1.5, background: 'var(--muted)' }} />95% (margem de erro)</span>}
      </div>
    </>
  );
}

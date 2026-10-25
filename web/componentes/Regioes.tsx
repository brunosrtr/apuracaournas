import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtCompacto, fmtPct, fmtPP, titulo } from '../formato.ts';
import { Delta } from './Comparacao.tsx';

/** Um cartão por macrorregião: apurado × projetado (com IC 95%) e variação vs eleição anterior. */
export function Regioes({ estado }: { estado: EstadoCorrida }) {
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const proj = estado.projecao?.disponivel ? estado.projecao : null;
  const porRegiao = new Map(proj?.regioes.map((r) => [r.codigo, r]) ?? []);
  const ano = estado.corrida.rotuloAnterior;

  return (
    <div className="grade">
      {estado.regioes.map((r) => {
        const pj = porRegiao.get(r.codigo);
        const numeros = pj ? pj.candidatos.map((c) => c.numero).slice(0, 3)
          : Object.entries(r.votos).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
        const escala = Math.max(0.3, ...numeros.map((n) => Math.max(pj?.candidatos.find((c) => c.numero === n)?.p975 ?? 0, r.validos > 0 ? (r.votos[n] ?? 0) / r.validos : 0))) * 1.08;
        const x = (v: number) => `${(100 * Math.min(1, v / escala)).toFixed(1)}%`;
        return (
          <section className="cartao regiao" key={r.codigo} style={{ gridColumn: 'span 4' }}>
            <h2>{r.nome}<span className="extra muted">{fmtPct(r.pst, 0)} apurado · {fmtCompacto(r.eleitorado)} eleitores</span></h2>
            {numeros.length === 0 && <div className="vazio">Sem votos apurados ainda.</div>}
            {numeros.map((n) => {
              const c = cand.get(n);
              const obs = r.validos > 0 ? (r.votos[n] ?? 0) / r.validos : 0;
              const pc = pj?.candidatos.find((x) => x.numero === n);
              const ant = r.anteriorMesmos[n];
              return (
                <div key={n} className="regiao-linha">
                  <div className="regiao-topo">
                    <span className="tag"><i style={{ background: c?.cor }} />{titulo(c?.nome ?? n)}</span>
                    <span className="num">
                      {pc ? <><strong>{fmtPct(pc.media, 1)}</strong> <span className="muted">± {fmtPP((pc.p975 - pc.p025) / 2)}</span></> : <strong>{fmtPct(obs, 1)}</strong>}
                    </span>
                  </div>
                  <div className="cand-barra" style={{ height: 20 }}>
                    <div className="trilho" style={{ top: 9 }} />
                    <div className="obs" style={{ top: 9, width: x(obs), background: c?.cor }} />
                    {pc && <div className="faixa" style={{ top: 2, left: x(pc.p025), width: `calc(${x(pc.p975)} - ${x(pc.p025)})`, background: c?.cor }} />}
                    {pc && <div className="media" style={{ top: 0, height: 9, left: x(pc.media), background: 'var(--text)' }} />}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    apurado {fmtPct(obs, 1)}
                    {ant !== undefined && r.validos > 0 && <> · vs {ano} nos mesmos municípios <Delta v={obs - ant} /></>}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

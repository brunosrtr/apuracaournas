import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtPct, fmtPP, titulo } from '../formato.ts';

/** Variação em relação à eleição anterior, para candidatos do mesmo partido (ou o mesmo candidato). */
export function Comparacao({ estado }: { estado: EstadoCorrida }) {
  const ano = estado.corrida.rotuloAnterior;
  // no 2º turno os candidatos são os mesmos do 1º: a coluna de equivalente seria redundante
  const t2 = estado.corrida.turno === 2;
  const n = estado.nacional;
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const proj = new Map(estado.projecao?.disponivel ? estado.projecao.candidatos.map((c) => [c.numero, c]) : []);
  const fracao = (num: string) => proj.get(num)?.media ?? (n.validos > 0 ? (n.votos[num] ?? 0) / n.validos : 0);
  const pares = Object.entries(estado.equivalentes).sort((a, b) => fracao(b[0]) - fracao(a[0]));

  return (
    <>
      <h2>Comparação com {t2 ? 'o 1º turno' : ano}<span className="extra muted">{t2 ? 'mesmos candidatos, mesmos municípios' : 'mesmo candidato ou mesmo partido'}</span></h2>
      {!pares.length ? (
        <div className="vazio">Nenhum candidato com equivalente direto em {ano}.</div>
      ) : (
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr>
                <th>Candidato</th>
                {!t2 && <th>Equivalente em {ano}</th>}
                <th className="direita" title="Fração atual nos municípios já apurados">Apurado agora</th>
                <th className="direita" title={`Fração em ${ano} nos mesmos municípios, na mesma proporção já apurada`}>{ano} nos mesmos municípios</th>
                <th className="direita">Variação</th>
                <th className="direita">Projeção final</th>
                <th className="direita">{t2 ? 'Final do 1º turno' : `Resultado final ${ano}`}</th>
                <th className="direita">Variação projetada</th>
              </tr>
            </thead>
            <tbody>
              {pares.map(([atual, anterior]) => {
                const obs = n.validos > 0 ? (n.votos[atual] ?? 0) / n.validos : NaN;
                const mesmos = n.anteriorMesmos[atual];
                const final = n.anteriorFinal[atual];
                const pj = proj.get(atual);
                const c = cand.get(atual);
                return (
                  <tr key={atual}>
                    <td><span className="tag"><i style={{ background: c?.cor }} />{titulo(c?.nome ?? atual)}</span> <span className="muted">{c?.partido}</span></td>
                    {!t2 && <td className="muted">{titulo(estado.nomesAnteriores[anterior] ?? anterior)} ({anterior})</td>}
                    <td className="direita num">{Number.isFinite(obs) ? fmtPct(obs, 1) : '—'}</td>
                    <td className="direita num">{mesmos !== undefined && n.validos > 0 ? fmtPct(mesmos, 1) : '—'}</td>
                    <td className="direita num"><Delta v={Number.isFinite(obs) && mesmos !== undefined && n.validos > 0 ? obs - mesmos : null} /></td>
                    <td className="direita num">{pj ? `${fmtPct(pj.media, 1)} ± ${fmtPP(pj.margem95)}` : '—'}</td>
                    <td className="direita num">{final !== undefined ? fmtPct(final, 1) : '—'}</td>
                    <td className="direita num"><Delta v={pj && final !== undefined ? pj.media - final : null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="aviso">
        "Nos mesmos municípios" pondera cada município pela fração já apurada, para comparar o mesmo eleitorado e eliminar o efeito da ordem da apuração.
      </p>
    </>
  );
}

export function Delta({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) return <span className="muted">—</span>;
  const cor = Math.abs(v) < 0.0005 ? 'var(--muted)' : v > 0 ? 'var(--ok)' : 'var(--live)';
  return <strong style={{ color: cor }}>{fmtPP(v, 1, true)}</strong>;
}

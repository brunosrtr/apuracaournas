import { useEffect } from 'react';
import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtCompacto, fmtDataHoraTse, fmtPct, fmtPP, fmtProb, titulo } from '../formato.ts';
import { Delta } from './Comparacao.tsx';

/** Presidente na UF: apurado, projeção estadual com margem de erro e variação vs eleição anterior. */
function PresidenteNoEstado({ uf, presidente }: { uf: string; presidente: EstadoCorrida }) {
  const resumo = presidente.estados.find((r) => r.codigo === uf);
  const proj = presidente.projecao?.disponivel ? presidente.projecao.estados.find((e) => e.codigo === uf) : undefined;
  const cand = new Map(presidente.candidatos.map((c) => [c.numero, c]));
  if (!resumo) return <div className="vazio">Sem dados deste estado.</div>;
  const numeros = proj ? proj.candidatos.map((c) => c.numero)
    : Object.entries(resumo.votos).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  const ano = presidente.corrida.rotuloAnterior;

  if (!numeros.length) {
    return <div className="vazio">Os votos para presidente neste estado aparecem com a apuração.</div>;
  }
  return (
    <>
      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              <th>Candidato</th>
              <th className="direita">Apurado</th>
              <th className="direita">Projeção ± 95%</th>
              <th className="direita" title="Chance de terminar em 1º lugar no estado">Chance de vencer no estado</th>
              <th className="direita" title={`Variação vs ${ano} nos mesmos municípios`}>vs {ano}</th>
            </tr>
          </thead>
          <tbody>
            {numeros.map((n) => {
              const c = cand.get(n);
              const obs = resumo.validos > 0 ? (resumo.votos[n] ?? 0) / resumo.validos : null;
              const p = proj?.candidatos.find((x) => x.numero === n);
              const ant = resumo.anteriorMesmos[n];
              return (
                <tr key={n}>
                  <td><span className="tag"><i style={{ background: c?.cor }} />{titulo(c?.nome ?? n)}</span></td>
                  <td className="direita num">{obs !== null ? fmtPct(obs, 1) : '—'}</td>
                  <td className="direita num">{p ? <><strong>{fmtPct(p.media, 1)}</strong> <span className="muted">± {fmtPP((p.p975 - p.p025) / 2)}</span></> : '—'}</td>
                  <td className="direita num">{p ? fmtProb(p.probPrimeiro) : '—'}</td>
                  <td className="direita num"><Delta v={obs !== null && ant !== undefined ? obs - ant : null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {Object.keys(resumo.anteriorFinal).length > 0 && (
        <p className="aviso" style={{ marginTop: 8 }}>
          Resultado {presidente.corrida.turno === 2 ? 'do 1º turno' : `de ${ano}`} no estado: {Object.entries(resumo.anteriorFinal).sort((a, b) => b[1] - a[1]).map(([n, f]) => `${titulo(presidente.nomesAnteriores[presidente.equivalentes[n]] ?? n).split(' ')[0]} ${fmtPct(f, 1)}`).join(' · ')}
        </p>
      )}
    </>
  );
}

interface Props {
  uf: string;
  presidente: EstadoCorrida;
  aoFechar: () => void;
}

/** Painel lateral aberto ao clicar num estado: resultado presidencial na UF. */
export function PainelEstado({ uf, presidente, aoFechar }: Props) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  const resumo = presidente.estados.find((r) => r.codigo === uf);
  const nomeUf = resumo?.nome ?? uf.toUpperCase();
  const t = presidente.totais;

  return (
    <div className="painel-fundo" onClick={aoFechar}>
      <aside className="painel" role="dialog" aria-modal="true" aria-label={`Resumo de ${nomeUf}`} onClick={(e) => e.stopPropagation()}>
        <header className="painel-topo">
          <div>
            <h2>{nomeUf}</h2>
            <small className="muted num">
              {resumo ? `${fmtCompacto(resumo.eleitorado)} eleitores · ${fmtPct(resumo.pst, 1)} das seções apuradas` : ''}
              {t.atualizadoEm ? ` · TSE ${fmtDataHoraTse(t.atualizadoEm)}` : ''}
            </small>
          </div>
          <button className="botao-icone" onClick={aoFechar} aria-label="Fechar painel do estado" title="Fechar (Esc)">✕</button>
        </header>
        <section className="painel-secao">
          <div className="painel-titulo">Presidente em {nomeUf}</div>
          <PresidenteNoEstado uf={uf} presidente={presidente} />
        </section>
        <p className="aviso">Projeção estadual pelo mesmo modelo nacional, com margem de erro de 95%.</p>
      </aside>
    </div>
  );
}

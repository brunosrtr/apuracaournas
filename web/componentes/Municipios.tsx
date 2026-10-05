import { useMemo, useState } from 'react';
import type { EstadoCorrida, UnidadeResumo } from '../../shared/tipos.ts';
import { fmtInt, fmtPct, fmtPP, titulo } from '../formato.ts';

type Ordem = 'eleitorado' | 'nome' | 'pst' | 'margem';
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Municipios({ estado, unidades }: { estado: EstadoCorrida; unidades: UnidadeResumo[] | null }) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('eleitorado');
  const [limite, setLimite] = useState(100);
  const cand = useMemo(() => new Map(estado.candidatos.map((c) => [c.numero, c])), [estado.candidatos]);
  const nacional = true;

  const principais = useMemo(() => {
    const t = estado.totais.votos;
    const base = estado.projecao?.disponivel ? estado.projecao.candidatos.map((c) => c.numero) : Object.keys(t).sort((a, b) => t[b] - t[a]);
    return base.slice(0, 3);
  }, [estado]);

  const linhas = useMemo(() => {
    if (!unidades) return [];
    const q = semAcento(busca.trim());
    return unidades
      .filter((u) => !q || semAcento(u.nome).includes(q) || u.uf === q)
      .map((u) => {
        const ord = Object.entries(u.votos).sort((a, b) => b[1] - a[1]);
        const margem = u.validos > 0 && ord.length > 1 ? (ord[0][1] - ord[1][1]) / u.validos : u.validos > 0 ? 1 : -1;
        return { u, lider: u.validos > 0 ? ord[0]?.[0] : undefined, margem };
      })
      .sort((a, b) =>
        ordem === 'nome' ? a.u.nome.localeCompare(b.u.nome, 'pt-BR')
          : ordem === 'pst' ? b.u.pst - a.u.pst
            : ordem === 'margem' ? b.margem - a.margem
              : b.u.eleitorado - a.u.eleitorado);
  }, [unidades, busca, ordem]);

  if (!unidades) return <div className="cartao esqueleto" style={{ height: 300 }} />;

  const cab = (rotulo: string, chave: Ordem, direita = false) => (
    <th className={direita ? 'direita' : undefined} aria-sort={ordem === chave ? 'descending' : undefined}>
      <button onClick={() => setOrdem(chave)}>{rotulo}{ordem === chave ? ' ↓' : ''}</button>
    </th>
  );

  return (
    <div className="cartao">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="busca" placeholder={nacional ? 'Buscar município ou UF (ex.: marau, rs)' : 'Buscar município'} value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(100); }} />
        <span className="muted" style={{ fontSize: 13 }}>{fmtInt(linhas.length)} municípios{nacional ? ' (inclui exterior, UF "ZZ")' : ''}</span>
      </div>
      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              {cab('Município', 'nome')}
              {nacional && <th>UF</th>}
              {cab('Eleitores', 'eleitorado', true)}
              {cab('Apurado', 'pst')}
              <th>Líder</th>
              {cab('Margem', 'margem', true)}
              {principais.map((n) => <th key={n} className="direita">{titulo(cand.get(n)?.nome ?? n).split(' ').slice(0, 2).join(' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.slice(0, limite).map(({ u, lider, margem }) => (
              <tr key={u.codigo}>
                <td style={{ fontWeight: 600 }}>{titulo(u.nome)}</td>
                {nacional && <td className="muted">{u.uf.toUpperCase()}</td>}
                <td className="direita num">{fmtInt(u.eleitorado)}</td>
                <td className="num"><span className="mini-barra"><div style={{ width: `${u.pst * 100}%` }} /></span>{fmtPct(u.pst, 0)}</td>
                <td>
                  {lider
                    ? <span className="tag"><i style={{ background: cand.get(lider)?.cor }} />{titulo(cand.get(lider)?.nome ?? lider).split(' ').slice(0, 2).join(' ')}</span>
                    : u.projetado
                      ? <span className="muted" title="Líder projetado (sem votos apurados)">proj. {titulo(cand.get(Object.entries(u.projetado).sort((a, b) => b[1] - a[1])[0][0])?.nome ?? '').split(' ')[0]}</span>
                      : <span className="muted">—</span>}
                </td>
                <td className="direita num">{margem >= 0 ? fmtPP(margem) : '—'}</td>
                {principais.map((n) => (
                  <td key={n} className="direita num">
                    {u.validos > 0 ? fmtPct((u.votos[n] ?? 0) / u.validos, 1) : u.projetado?.[n] ? <span className="muted">{fmtPct(u.projetado[n], 1)}*</span> : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length > limite && <button className="mais" onClick={() => setLimite(limite + 200)}>Mostrar mais</button>}
      <p className="aviso">* valores com asterisco são projeções do modelo para municípios ainda sem votos apurados.</p>
    </div>
  );
}

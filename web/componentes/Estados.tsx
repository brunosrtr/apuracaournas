import { useMemo, useState } from 'react';
import type { EstadoCorrida, ProjecaoRegional, ResumoRegional } from '../../shared/tipos.ts';
import { fmtCompacto, fmtPct, fmtPP, fmtProb, titulo } from '../formato.ts';
import { Delta } from './Comparacao.tsx';

type Ordem = 'eleitorado' | 'apurado' | 'margem' | 'nome';

/** Tabela por UF: apurado, projeção com margem de erro, líder projetado e variação vs eleição anterior. */
export function Estados({ estado, aoSelecionarUf }: { estado: EstadoCorrida; aoSelecionarUf?: (uf: string) => void }) {
  const [ordem, setOrdem] = useState<Ordem>('eleitorado');
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const proj = estado.projecao?.disponivel ? estado.projecao : null;
  const porUf = new Map<string, ProjecaoRegional>(proj?.estados.map((e) => [e.codigo, e]) ?? []);
  const principais = (proj?.lideranca ? [proj.lideranca.primeiro, proj.lideranca.segundo] : Object.entries(estado.totais.votos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n));
  const comparado = principais.find((n) => estado.equivalentes[n]);
  const nome = (n: string) => titulo(cand.get(n)?.nome ?? n).split(' ')[0];

  const linhas = useMemo(() => {
    const margem = (r: ResumoRegional) => {
      const pj = porUf.get(r.codigo);
      if (pj && pj.candidatos.length > 1) return pj.candidatos[0].media - pj.candidatos[1].media;
      const ord = Object.values(r.votos).sort((a, b) => b - a);
      return r.validos > 0 && ord.length > 1 ? (ord[0] - ord[1]) / r.validos : -1;
    };
    return [...estado.estados].sort((a, b) =>
      ordem === 'nome' ? a.nome.localeCompare(b.nome, 'pt-BR')
        : ordem === 'apurado' ? b.pst - a.pst
          : ordem === 'margem' ? margem(a) - margem(b)
            : b.eleitorado - a.eleitorado);
  }, [estado.estados, ordem, porUf]);

  const cab = (rotulo: string, chave: Ordem, direita = false) => (
    <th className={direita ? 'direita' : undefined}><button onClick={() => setOrdem(chave)}>{rotulo}{ordem === chave ? ' ↓' : ''}</button></th>
  );

  return (
    <div className="cartao">
      <div className="tabela-caixa">
        <table>
          <thead>
            <tr>
              {cab('Estado', 'nome')}
              {cab('Eleitores', 'eleitorado', true)}
              {cab('Apurado', 'apurado')}
              {principais.map((n) => <th key={n} className="direita">{nome(n)}: apurado → projeção</th>)}
              {cab('Líder projetado', 'margem')}
              {comparado && <th className="direita" title={`${nome(comparado)} agora × ${estado.corrida.anoAnterior} nos mesmos municípios`}>{nome(comparado)} vs {estado.corrida.anoAnterior}</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => {
              const pj = porUf.get(r.codigo);
              const lider = pj?.candidatos[0];
              return (
                <tr key={r.codigo}>
                  <td style={{ fontWeight: 600 }}>
                    {aoSelecionarUf && r.codigo !== 'zz'
                      ? <button className="link" onClick={() => aoSelecionarUf(r.codigo)} title="Abrir resumo do estado (Presidente, Governador e Senador)">{r.nome}</button>
                      : r.nome} <span className="muted">{r.codigo.toUpperCase()}</span>
                  </td>
                  <td className="direita num">{fmtCompacto(r.eleitorado)}</td>
                  <td className="num"><span className="mini-barra"><div style={{ width: `${r.pst * 100}%` }} /></span>{fmtPct(r.pst, 0)}</td>
                  {principais.map((n) => {
                    const obs = r.validos > 0 ? (r.votos[n] ?? 0) / r.validos : null;
                    const c = pj?.candidatos.find((x) => x.numero === n);
                    return (
                      <td key={n} className="direita num">
                        <span className="muted">{obs !== null ? fmtPct(obs, 1) : '—'}</span>
                        {c && <> → <strong>{fmtPct(c.media, 1)}</strong> <span className="muted">± {fmtPP((c.p975 - c.p025) / 2)}</span></>}
                      </td>
                    );
                  })}
                  <td>
                    {lider ? (
                      <span className="tag"><i style={{ background: cand.get(lider.numero)?.cor }} />{nome(lider.numero)} <span className="muted num">{fmtProb(lider.probPrimeiro)}</span></span>
                    ) : <span className="muted">—</span>}
                  </td>
                  {comparado && (
                    <td className="direita num">
                      <Delta v={r.validos > 0 && r.anteriorMesmos[comparado] !== undefined ? (r.votos[comparado] ?? 0) / r.validos - r.anteriorMesmos[comparado] : null} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="aviso">
        Projeção estadual com margem de erro de 95% (± meia-largura do intervalo). A porcentagem ao lado do líder é a chance de ele terminar em 1º no estado.
      </p>
    </div>
  );
}

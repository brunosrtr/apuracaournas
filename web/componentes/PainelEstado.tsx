import { useEffect, useState } from 'react';
import type { EstadoCorrida } from '../../shared/tipos.ts';
import { calcularChamada } from '../../shared/chamada.ts';
import { api, useEventos } from '../cliente.ts';
import { fmtCompacto, fmtDataHora, fmtDataHoraTse, fmtPct, fmtPP, fmtProb, titulo } from '../formato.ts';
import { FaixaChamada } from './Chamada.tsx';
import { Candidatos } from './Candidatos.tsx';
import { Delta } from './Comparacao.tsx';

/** Presidente na UF: apurado, projeção estadual com margem de erro e variação vs eleição anterior. */
function PresidenteNoEstado({ uf, presidente }: { uf: string; presidente: EstadoCorrida }) {
  const resumo = presidente.estados.find((r) => r.codigo === uf);
  const proj = presidente.projecao?.disponivel ? presidente.projecao.estados.find((e) => e.codigo === uf) : undefined;
  const cand = new Map(presidente.candidatos.map((c) => [c.numero, c]));
  if (!resumo) return <div className="vazio">Sem dados deste estado.</div>;
  const numeros = proj ? proj.candidatos.map((c) => c.numero)
    : Object.entries(resumo.votos).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  const ano = presidente.corrida.anoAnterior;

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
              <th className="direita" title="Chance de terminar em 1º no estado">1º no estado</th>
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
          Resultado de {ano} no estado: {Object.entries(resumo.anteriorFinal).sort((a, b) => b[1] - a[1]).map(([n, f]) => `${titulo(presidente.nomesAnteriores[presidente.equivalentes[n]] ?? n).split(' ')[0]} ${fmtPct(f, 1)}`).join(' · ')}
        </p>
      )}
    </>
  );
}

/** Governador ou Senador: chamada, andamento, cenários e candidatos com projeção. */
function Disputa({ estado }: { estado: EstadoCorrida }) {
  const t = estado.totais;
  const p = estado.projecao?.disponivel ? estado.projecao : null;
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const nome = (n: string) => titulo(cand.get(n)?.nome ?? n);
  const senado = !estado.corrida.maioriaAbsoluta && estado.corrida.vagas > 1;
  return (
    <>
      <FaixaChamada chamada={calcularChamada(estado)} />
      <div className="painel-linha muted">
        <span className="num">{fmtPct(t.percentualSecoes)} das seções</span>
        {t.atualizadoEm && <span>Última atualização do TSE: <strong className="num">{fmtDataHoraTse(t.atualizadoEm)}</strong></span>}
        {p && <span className="num">Projeção: {fmtDataHora(p.calculadaEm)} · {p.simulacoes.toLocaleString('pt-BR')} cenários</span>}
      </div>
      {p && (
        <div className="kpis kpis-2">
          {estado.corrida.maioriaAbsoluta ? (
            <>
              <div className="kpi"><span className="kpi-rotulo">Chance de 2º turno</span><strong className="kpi-valor num">{fmtProb(p.probSegundoTurno)}</strong>
                <span className="kpi-detalhe">{p.paresSegundoTurno[0] ? `mais provável: ${nome(p.paresSegundoTurno[0].a)} × ${nome(p.paresSegundoTurno[0].b)} (${fmtProb(p.paresSegundoTurno[0].prob)})` : '—'}</span></div>
              {p.lideranca && (
                <div className="kpi"><span className="kpi-rotulo">Vantagem projetada</span><strong className="kpi-valor num">{fmtPP(p.lideranca.pontos.media)}</strong>
                  <span className="kpi-detalhe">{nome(p.lideranca.primeiro)} sobre {nome(p.lideranca.segundo)} · IC 95%: {fmtPP(p.lideranca.pontos.p025)} a {fmtPP(p.lideranca.pontos.p975)}</span></div>
              )}
            </>
          ) : p.lideranca && (
            <>
              <div className="kpi"><span className="kpi-rotulo">{senado ? `Disputa pela ${estado.corrida.vagas}ª vaga` : 'Vantagem projetada'}</span><strong className="kpi-valor num">{fmtPP(p.lideranca.pontos.media)}</strong>
                <span className="kpi-detalhe">{nome(p.lideranca.primeiro)} sobre {nome(p.lideranca.segundo)} · IC 95%: {fmtPP(p.lideranca.pontos.p025)} a {fmtPP(p.lideranca.pontos.p975)}</span></div>
              <div className="kpi"><span className="kpi-rotulo">Chance de {nome(p.lideranca.primeiro).split(' ')[0]} ficar à frente</span><strong className="kpi-valor num">{fmtProb(p.lideranca.probPrimeiroAFrente)}</strong>
                <span className="kpi-detalhe">{senado ? 'os dois mais votados são eleitos; cada eleitor vota em dois' : ''}</span></div>
            </>
          )}
        </div>
      )}
      <Candidatos estado={estado} visiveis={5} />
    </>
  );
}

interface Props {
  uf: string;
  presidente: EstadoCorrida;
  aoFechar: () => void;
}

/** Painel lateral aberto ao clicar num estado: Presidente na UF, Governador e Senador com projeção. */
export function PainelEstado({ uf, presidente, aoFechar }: Props) {
  const aoVivo = presidente.corrida.modo === 'ao-vivo';
  const [gov, setGov] = useState<EstadoCorrida | null>(null);
  const [sen, setSen] = useState<EstadoCorrida | null>(null);
  const [falha, setFalha] = useState(false);
  const idGov = `governador-${uf}`, idSen = `senador-${uf}`;

  useEffect(() => {
    setGov(null);
    setSen(null);
    setFalha(false);
    if (!aoVivo) return;
    const carregar = () => {
      api.corrida(idGov).then(setGov).catch(() => setFalha(true));
      api.corrida(idSen).then(setSen).catch(() => setFalha(true));
    };
    carregar();
    const t = setInterval(carregar, 20_000);
    return () => clearInterval(t);
  }, [aoVivo, idGov, idSen]);

  useEventos((ev) => {
    if (ev.id === idGov) api.corrida(idGov).then(setGov).catch(() => {});
    if (ev.id === idSen) api.corrida(idSen).then(setSen).catch(() => {});
  });

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  const resumo = presidente.estados.find((r) => r.codigo === uf);
  const nomeUf = resumo?.nome ?? uf.toUpperCase();

  const corpoEstadual = (e: EstadoCorrida | null) => {
    if (!aoVivo) return <div className="vazio">Governador e Senador estão disponíveis só no modo ao vivo (a simulação reapresenta apenas Presidente).</div>;
    if (falha && !e) return <div className="vazio">Não foi possível carregar esta disputa agora. Nova tentativa em instantes.</div>;
    if (!e || (!e.candidatos.length && !e.ultimaColeta)) {
      return <div className="esqueleto" style={{ height: 160, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }}>Carregando dados do TSE…</div>;
    }
    return <Disputa estado={e} />;
  };

  return (
    <div className="painel-fundo" onClick={aoFechar}>
      <aside className="painel" role="dialog" aria-modal="true" aria-label={`Resumo de ${nomeUf}`} onClick={(e) => e.stopPropagation()}>
        <header className="painel-topo">
          <div>
            <h2>{nomeUf}</h2>
            <small className="muted num">
              {resumo ? `${fmtCompacto(resumo.eleitorado)} eleitores · ${fmtPct(resumo.pst, 1)} das seções apuradas (Presidente)` : ''}
            </small>
          </div>
          <button className="botao-icone" onClick={aoFechar} aria-label="Fechar painel do estado" title="Fechar (Esc)">✕</button>
        </header>

        <section className="painel-secao">
          <div className="painel-titulo">Presidente em {nomeUf}</div>
          <PresidenteNoEstado uf={uf} presidente={presidente} />
        </section>

        <section className="painel-secao">
          <div className="painel-titulo">Governador{gov ? <span className="muted"> · {gov.candidatos.length} candidatos</span> : null}</div>
          {corpoEstadual(gov)}
        </section>

        <section className="painel-secao">
          <div className="painel-titulo">Senador{sen ? <span className="muted"> · {sen.corrida.vagas} {sen.corrida.vagas > 1 ? 'vagas' : 'vaga'}</span> : null}</div>
          {corpoEstadual(sen)}
        </section>
        <p className="aviso">Governador e Senador usam o mesmo modelo, aplicado aos municípios do estado, com o histórico presidencial de 2022 e 2018 como base.</p>
      </aside>
    </div>
  );
}

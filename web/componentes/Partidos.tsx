import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bloco, DesempenhoBloco, ResumoPartidos, ResumoPartidosUf } from '../../shared/tipos.ts';
import { BLOCOS, CORES_BLOCO, NOMES_BLOCO } from '../../shared/ideologia.ts';
import { api, useEventos } from '../cliente.ts';
import { fmtDataHora, fmtPct, fmtProb, titulo } from '../formato.ts';

const um = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Arredonda frações esperadas para inteiros que somam `total` (maiores restos). */
function distribuir(esperados: number[], total: number): number[] {
  const soma = esperados.reduce((a, b) => a + b, 0);
  if (soma <= 0) return esperados.map(() => 0);
  const alvo = esperados.map((v) => (v / soma) * total);
  const base = alvo.map(Math.floor);
  let faltam = total - base.reduce((a, b) => a + b, 0);
  const ordem = alvo.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) { if (faltam-- <= 0) break; base[i]++; }
  return base;
}

/** Semicírculo de cadeiras, da esquerda para a direita. */
function Hemiciclo({ cadeiras, total }: { cadeiras: Record<Bloco, number>; total: number }) {
  const filas = 4;
  const raios = Array.from({ length: filas }, (_, i) => 0.45 + (0.55 * i) / (filas - 1));
  const somaR = raios.reduce((a, b) => a + b, 0);
  const qtd = raios.map((r) => Math.round((total * r) / somaR));
  qtd[filas - 1] += total - qtd.reduce((a, b) => a + b, 0);
  const pts: { x: number; y: number; ang: number }[] = [];
  raios.forEach((r, i) => {
    for (let j = 0; j < qtd[i]; j++) {
      const ang = qtd[i] === 1 ? Math.PI / 2 : Math.PI * (1 - j / (qtd[i] - 1));
      pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang), ang });
    }
  });
  pts.sort((a, b) => b.ang - a.ang);
  const cores: string[] = [];
  for (const b of BLOCOS) for (let i = 0; i < cadeiras[b]; i++) cores.push(CORES_BLOCO[b]);
  return (
    <svg viewBox="-1.1 -1.08 2.2 1.16" role="img" aria-label="Distribuição projetada das vagas do Senado por bloco" style={{ width: '100%', maxWidth: 440, display: 'block', margin: '0 auto' }}>
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={-p.y} r={0.052} fill={cores[i] ?? 'var(--surface-3)'} />)}
      <text x={0} y={-0.14} textAnchor="middle" style={{ fontSize: 0.2, fontWeight: 800, fill: 'var(--text)' }}>{total}</text>
      <text x={0} y={0.0} textAnchor="middle" style={{ fontSize: 0.075, fill: 'var(--muted)' }}>vagas em disputa</text>
    </svg>
  );
}

/** Um quadrado por estado, colorido pelo bloco do 1º colocado projetado para governador. */
function MosaicoEstados({ estados, aoSelecionarUf }: { estados: ResumoPartidosUf[]; aoSelecionarUf?: (uf: string) => void }) {
  const ordem = (e: ResumoPartidosUf) => {
    const l = e.governador[0];
    return l ? BLOCOS.indexOf(l.bloco) * 10 - l.probPrimeiro : 99;
  };
  return (
    <div className="mosaico">
      {[...estados].sort((a, b) => ordem(a) - ordem(b)).map((e) => {
        const l = [...e.governador].sort((a, b) => b.probPrimeiro - a.probPrimeiro)[0];
        const opac = l ? 0.35 + 0.65 * Math.min(1, Math.max(0, (l.probPrimeiro - 0.4) / 0.6)) : 1;
        return (
          <button
            key={e.uf}
            className="mosaico-uf"
            style={{ background: l ? CORES_BLOCO[l.bloco] : 'var(--surface-3)', opacity: l ? opac : 1, color: l ? '#fff' : 'var(--muted)' }}
            title={l ? `${e.nome}: ${titulo(l.nome)} (${l.partido}) lidera — chance de 1º lugar ${fmtProb(l.probPrimeiro)}` : `${e.nome}: aguardando votos`}
            onClick={() => aoSelecionarUf?.(e.uf)}
          >
            {e.uf.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function BarraBlocos({ valores, rotulo }: { valores: Record<Bloco, number>; rotulo: string }) {
  const total = BLOCOS.reduce((a, b) => a + valores[b], 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{rotulo}</div>
      <div className="barra-blocos">
        {BLOCOS.map((b) => total > 0 && valores[b] > 0 && (
          <div key={b} style={{ width: `${(100 * valores[b]) / total}%`, background: CORES_BLOCO[b] }} title={`${NOMES_BLOCO[b]}: ${fmtPct(valores[b] / total, 1)}`}>
            {valores[b] / total > 0.08 ? fmtPct(valores[b] / total, 0) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendaBlocos({ blocos, valor }: { blocos: DesempenhoBloco[]; valor: (b: DesempenhoBloco) => string }) {
  return (
    <div className="legenda-blocos">
      {blocos.map((b) => (
        <div key={b.bloco}>
          <span className="tag"><i style={{ background: CORES_BLOCO[b.bloco] }} />{NOMES_BLOCO[b.bloco]}</span>
          <strong className="num">{valor(b)}</strong>
        </div>
      ))}
    </div>
  );
}

export function Partidos({ aoSelecionarUf }: { aoSelecionarUf?: (uf: string) => void }) {
  const [dados, setDados] = useState<ResumoPartidos | null>(null);
  const ultima = useRef(0);
  const pendente = useRef<number | null>(null);
  const carregar = useCallback(() => {
    if (pendente.current) return;
    const espera = Math.max(0, 5_000 - (Date.now() - ultima.current));
    pendente.current = window.setTimeout(() => {
      pendente.current = null;
      ultima.current = Date.now();
      api.partidos().then(setDados).catch(() => {});
    }, espera);
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30_000);
    return () => { clearInterval(t); if (pendente.current) clearTimeout(pendente.current); pendente.current = null; };
  }, [carregar]);
  useEventos((ev) => { if (/^(governador|senador)-/.test(ev.id)) carregar(); });

  if (!dados) return <div className="cartao esqueleto" style={{ height: 320 }} />;

  const semDados = dados.comProjecao.governador + dados.comProjecao.senado === 0;
  const blocos = BLOCOS.map((b) => dados.blocos.find((x) => x.bloco === b)!).filter(Boolean);
  const cadeiras = Object.fromEntries(BLOCOS.map((b, i) => [b, distribuir(blocos.map((x) => x.senado.cadeiras), dados.vagasSenado)[i]])) as Record<Bloco, number>;
  const votosGov = Object.fromEntries(blocos.map((b) => [b.bloco, b.governador.votos])) as Record<Bloco, number>;
  const votosSen = Object.fromEntries(blocos.map((b) => [b.bloco, b.senado.votos])) as Record<Bloco, number>;

  return (
    <div className="grade">
      {semDados && (
        <div className="cartao col-12"><div className="vazio">As projeções por partido aparecem quando os estados começarem a apurar Governador e Senador.</div></div>
      )}
      <section className="cartao col-6">
        <h2>Governadores · 27 estados<span className="extra muted">{dados.comProjecao.governador} com projeção</span></h2>
        <MosaicoEstados estados={dados.estados} aoSelecionarUf={aoSelecionarUf} />
        <LegendaBlocos blocos={blocos} valor={(b) => `${um(b.governador.estadosEm1)} estados em 1º · ${um(b.governador.eleitos1T)} eleitos no 1º turno`} />
        <BarraBlocos valores={votosGov} rotulo="Votos projetados para governador, somados no país" />
        <p className="aviso">Cor de cada estado: bloco do 1º colocado projetado; mais forte = mais provável. Clique para abrir o estado.</p>
      </section>
      <section className="cartao col-6">
        <h2>Senado · {dados.vagasSenado} vagas em disputa<span className="extra muted">{dados.comProjecao.senado} estados com projeção</span></h2>
        <Hemiciclo cadeiras={cadeiras} total={dados.vagasSenado} />
        <LegendaBlocos blocos={blocos} valor={(b) => `${um(b.senado.cadeiras)} cadeiras (80%: ${b.senado.cadeirasP10}–${b.senado.cadeirasP90})`} />
        <BarraBlocos valores={votosSen} rotulo="Votos projetados para senador, somados no país" />
        <p className="aviso">Não inclui os 27 senadores eleitos em 2022, cujos mandatos vão até 2031.</p>
      </section>

      <section className="cartao col-12">
        <h2>Desempenho por partido<span className="extra muted">calculado {fmtDataHora(dados.calculadoEm)}</span></h2>
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr>
                <th>Partido</th>
                <th>Bloco</th>
                <th className="direita" title="Número esperado de estados em que o partido termina em 1º para governador">Gov.: estados em 1º</th>
                <th className="direita">Gov.: eleitos no 1º turno</th>
                <th className="direita">Gov.: no 2º turno</th>
                <th className="direita">Gov.: votos</th>
                <th className="direita">Senado: cadeiras (80%)</th>
                <th className="direita">Senado: votos</th>
              </tr>
            </thead>
            <tbody>
              {dados.partidos.map((p) => (
                <tr key={p.partido}>
                  <td style={{ fontWeight: 650 }}>{p.partido}</td>
                  <td><span className="tag"><i style={{ background: CORES_BLOCO[p.bloco] }} />{NOMES_BLOCO[p.bloco]}</span></td>
                  <td className="direita num">{p.governador.candidatos ? um(p.governador.estadosEm1) : '—'}</td>
                  <td className="direita num">{p.governador.candidatos ? um(p.governador.eleitos1T) : '—'}</td>
                  <td className="direita num">{p.governador.candidatos ? um(p.governador.em2T) : '—'}</td>
                  <td className="direita num">{p.governador.candidatos ? fmtPct(p.governador.fracaoVotos, 1) : '—'}</td>
                  <td className="direita num">{p.senado.candidatos ? <><strong>{um(p.senado.cadeiras)}</strong> <span className="muted">({p.senado.cadeirasP10}–{p.senado.cadeirasP90})</span></> : '—'}</td>
                  <td className="direita num">{p.senado.candidatos ? fmtPct(p.senado.fracaoVotos, 1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aviso">
          Valores esperados: soma das probabilidades de cada candidato do partido nas 27 UFs (ex.: dois candidatos com 50% de chance = 1,0 cadeira esperada).
          Classificação ideológica aproximada, editável em <code>shared/ideologia.ts</code>.
        </p>
      </section>

      <section className="cartao col-12">
        <h2>Por estado<span className="extra muted">clique para abrir o resumo</span></h2>
        <div className="grade-ufs">
          {dados.estados.map((e) => (
            <button key={e.uf} className="uf-cartao" onClick={() => aoSelecionarUf?.(e.uf)}>
              <div className="uf-topo"><strong>{e.nome}</strong><span className="muted num">{fmtPct(e.pstGovernador, 0)}</span></div>
              <div className="uf-linha">
                <span className="muted">Gov.</span>
                {e.governador.length ? e.governador.slice(0, 2).map((c) => (
                  <span key={c.numero} className="chip-bloco" style={{ borderColor: CORES_BLOCO[c.bloco] }} title={`${titulo(c.nome)} · 1º lugar ${fmtProb(c.probPrimeiro)}`}>
                    {c.partido} {fmtPct(c.media, 0)}
                  </span>
                )) : <span className="muted">aguardando</span>}
              </div>
              <div className="uf-linha">
                <span className="muted">Sen.</span>
                {e.senado.length ? e.senado.slice(0, 2).map((c) => (
                  <span key={c.numero} className="chip-bloco" style={{ borderColor: CORES_BLOCO[c.bloco] }} title={`${titulo(c.nome)} · eleito ${fmtProb(c.probVitoria)}`}>
                    {c.partido} {fmtProb(c.probVitoria)}
                  </span>
                )) : <span className="muted">aguardando</span>}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

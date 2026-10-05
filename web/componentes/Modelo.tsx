import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtInt, fmtPct, titulo } from '../formato.ts';

export function Modelo({ estado }: { estado: EstadoCorrida }) {
  const p = estado.projecao;
  const d = p?.diagnostico;
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const nome = (n: string) => titulo(cand.get(n)?.nome ?? n);
  // chaves numéricas de objeto saem em ordem crescente; ordena pela projeção
  const ordem = d ? p!.candidatos.map((c) => c.numero).filter((n) => d.coeficientes[n]) : [];

  return (
    <div className="grade">
      <section className="cartao col-12">
        <h2>Por que não basta olhar o parcial</h2>
        <p style={{ marginTop: 0, color: 'var(--text-2)', maxWidth: 900 }}>
          A ordem da apuração não é aleatória: algumas regiões e cidades chegam antes de outras. Em 2022, Bolsonaro liderou o
          1º turno até cerca de 70% das urnas apuradas, porque Norte e Nordeste foram totalizados depois. O modelo corrige isso
          comparando cada município já apurado com o seu histórico em duas eleições e estimando o que falta em cada município
          ainda não apurado. A margem de erro (95%) é a meia-largura do intervalo que contém 95% dos cenários simulados.
        </p>
        <ol className="passos">
          <li>
            <strong>Quanto falta apurar</strong>
            Para cada município: eleitorado de 2026 ainda não apurado (cadastro oficial do TSE, que já inclui o crescimento ou
            a queda de cada cidade desde 2022) × comparecimento esperado × fração de válidos. O comparecimento histórico é
            corrigido pela variação já observada na região.
          </li>
          <li>
            <strong>Regressão com o histórico</strong>
            Para cada candidato, uma regressão bayesiana ponderada explica o voto nos municípios apurados a partir de variáveis
            das duas eleições anteriores. Quem já disputou (o mesmo candidato ou o mesmo partido) tem priori de "swing logístico":
            a mesma geografia de antes, ajustada à força atual. Peso de cada município = 1/(τ² + s²).
          </li>
          <li>
            <strong>Efeitos regionais</strong>
            Desvios sistemáticos por macrorregião, UF e região intermediária do IBGE são estimados por DerSimonian–Laird e
            encolhidos (empirical Bayes). Se uma região atrasar (ex.: o Nordeste), ela é projetada pelo próprio histórico, e um
            choque comum às regiões ainda sem votos alarga a margem até elas começarem a ser apuradas.
          </li>
          <li>
            <strong>Combinação com o parcial</strong>
            Em municípios parcialmente apurados, a previsão do modelo e o parcial observado são combinados pela precisão de cada
            um (atualização normal–normal). Com 100% apurado, vale o resultado oficial.
          </li>
          <li>
            <strong>Monte Carlo</strong>
            Milhares de cenários, divididos entre várias threads, sorteiam coeficientes, efeitos regionais, ruído municipal e
            choques de comparecimento correlacionados. Daí saem a margem de erro, a vantagem e as probabilidades.
            Candidatos com menos de 1% são projetados em grupo.
          </li>
        </ol>
        <div className="formula" style={{ marginTop: 16 }}>
          θ̂ᵢ = k·pᵢ + (1 − k)·(xᵢ′β + uₘₐ꜀ᵣₒ + u_UF + u_região) &nbsp;&nbsp; k = P/(P + s²) &nbsp;&nbsp; s² = p(1−p)(1−f)(1/n + δ²)
          &nbsp;&nbsp;·&nbsp;&nbsp; votos finaisᵢ = apuradosᵢ + restanteᵢ × fração projetada do restante
        </div>
      </section>

      <section className="cartao col-12">
        <h2>Diagnóstico ao vivo{d && <span className="extra muted">calculado em {d.tempoMs} ms</span>}</h2>
        {!d ? (
          <div className="vazio">{p?.motivo ?? 'O diagnóstico aparece quando o modelo estiver calibrado com votos apurados.'}</div>
        ) : (
          <>
            <div className="metricas" style={{ marginBottom: 18 }}>
              <div className="metrica"><span>Municípios com votos</span><strong className="num">{fmtInt(d.unidadesComDados)} <small>de {fmtInt(d.unidadesTotal)}</small></strong></div>
              <div className="metrica"><span>Eleitorado apurado</span><strong className="num">{fmtPct(d.fracaoEleitoradoApurado, 1)}</strong></div>
              <div className="metrica"><span>Cenários simulados</span><strong className="num">{fmtInt(p!.simulacoes)} <small>em {d.workers} threads</small></strong></div>
              <div className="metrica"><span>Base histórica</span><strong style={{ fontSize: 13.5 }}>{d.baseHistorica}</strong></div>
            </div>
            <div className="tabela-caixa">
              <table>
                <thead>
                  <tr>
                    <th>Candidato</th>
                    <th className="direita" title="Ajuste da regressão nos municípios apurados">R²</th>
                    <th className="direita" title="Desvio residual típico entre municípios">τ (município)</th>
                    <th className="direita" title="Desvio típico entre regiões">σ (regiões)</th>
                  </tr>
                </thead>
                <tbody>
                  {ordem.map((n) => (
                    <tr key={n}>
                      <td><span className="tag"><i style={{ background: cand.get(n)?.cor }} />{nome(n)}</span></td>
                      <td className="direita num">{d.r2[n].toFixed(3)}</td>
                      <td className="direita num">{(100 * d.tau[n]).toFixed(2)} p.p.</td>
                      <td className="direita num">{(100 * d.sigmaRegiao[n]).toFixed(2)} p.p.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grade" style={{ marginTop: 18 }}>
              {ordem.slice(0, 2).map((n) => {
                const coefs = d.coeficientes[n];
                const lim = Math.max(0.02, ...coefs.slice(1).map((c) => Math.abs(c.valor) + c.erro));
                const pos = (v: number) => `${50 + (50 * Math.max(-lim, Math.min(lim, v))) / lim}%`;
                return (
                  <div className="col-5" key={n} style={{ gridColumn: 'span 6' }}>
                    <div style={{ fontWeight: 650, marginBottom: 8 }}>
                      <span className="tag"><i style={{ background: cand.get(n)?.cor }} />{nome(n)}</span>
                      <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}> · efeito de +1 desvio-padrão (p.p.)</span>
                    </div>
                    <table>
                      <tbody>
                        {coefs.slice(1).map((c) => (
                          <tr key={c.variavel}>
                            <td style={{ whiteSpace: 'normal' }}>{c.variavel}</td>
                            <td>
                              <span className="coef-barra">
                                <span className="zero" />
                                <span className="val" style={{
                                  left: c.valor >= 0 ? '50%' : pos(c.valor),
                                  width: `${(50 * Math.min(lim, Math.abs(c.valor))) / lim}%`,
                                  background: cand.get(n)?.cor,
                                }} />
                                <span className="err" style={{ left: pos(c.valor - c.erro), width: `calc(${pos(c.valor + c.erro)} - ${pos(c.valor - c.erro)})` }} />
                              </span>
                            </td>
                            <td className="direita num">{c.valor >= 0 ? '+' : ''}{(100 * c.valor).toFixed(2)}</td>
                            <td className="direita num muted" title="Média a priori (swing logístico)">{c.priori ? `priori ${(100 * c.priori).toFixed(1)}` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
            <p className="aviso">
              Intervalos de 80% (p10–p90) vêm das simulações. A projeção não usa pesquisas: apenas votos já apurados e eleições anteriores.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

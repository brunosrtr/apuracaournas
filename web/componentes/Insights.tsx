import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnaliseInsights, CategoriaInsight, EstadoCorrida, Insight } from '../../shared/tipos.ts';
import { api } from '../cliente.ts';
import { fmtDataHora, fmtDataHoraTse } from '../formato.ts';

const CATEGORIAS: Record<CategoriaInsight, string> = {
  nacional: 'Brasil',
  virada: 'Virada',
  regiao: 'Região',
  estado: 'Estado',
  municipio: 'Cidade',
  comparecimento: 'Comparecimento',
  projecao: 'Projeção',
  novos: 'Candidato novo',
};

const rotuloAnalise = (a: AnaliseInsights) =>
  a.marco !== null ? `Aos ${Math.round(100 * a.marco)}% apurados` : `Sob demanda (${(100 * a.pst).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% apurados)`;

function Cartao({ i, cor, novo }: { i: Insight; cor?: string; novo: boolean }) {
  const seta = i.tom === 'alta' ? '▲' : i.tom === 'baixa' ? '▼' : '◆';
  return (
    <article className="insight" style={{ borderLeftColor: cor ?? 'var(--accent)' }}>
      <div className="insight-topo">
        <span className={`insight-seta ${i.tom}`} aria-hidden>{seta}</span>
        <span className="chip">{CATEGORIAS[i.categoria]}</span>
        {novo && <span className="chip medio">novo</span>}
      </div>
      <h3>{i.titulo}</h3>
      <p>{i.texto}</p>
    </article>
  );
}

export function Insights({ estado }: { estado: EstadoCorrida }) {
  const id = estado.corrida.modo === 'simulacao' ? 'simulacao' : 'ao-vivo';
  const [analises, setAnalises] = useState<AnaliseInsights[] | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);
  const ultimaCarga = useRef(0);

  const carregar = useCallback(() => {
    ultimaCarga.current = Date.now();
    api.insights(id).then((r) => setAnalises(r.analises)).catch(() => {});
  }, [id]);

  useEffect(() => {
    setAnalises(null);
    carregar();
    const t = setInterval(carregar, 20_000);
    return () => clearInterval(t);
  }, [carregar]);

  // nova versão da apuração → confere se surgiu análise de um novo marco (no máximo a cada 5 s)
  useEffect(() => {
    if (Date.now() - ultimaCarga.current > 5_000) carregar();
  }, [estado.versao, carregar]);

  const recalcular = () => {
    setCalculando(true);
    api.recalcularInsights(id)
      .then((a) => setAnalises((lista) => [...(lista ?? []), a]))
      .catch(() => {})
      .finally(() => setCalculando(false));
  };

  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const ano = estado.corrida.rotuloAnterior;
  const atual = analises?.at(-1);
  const anterior = analises && analises.length > 1 ? analises[analises.length - 2] : undefined;
  const idsAnteriores = new Set(anterior?.insights.map((i) => i.id) ?? []);

  return (
    <div className="grade">
      <section className="cartao col-12">
        <div className="insights-topo">
          <div>
            <h2 style={{ marginBottom: 4 }}>Insights da apuração</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Gerados automaticamente a cada 5% de seções apuradas, comparando com {estado.corrida.turno === 2 ? 'o 1º turno' : ano} <strong>nos mesmos municípios e na mesma proporção já apurada</strong>.
              Assim a diferença reflete mudança de voto, não a ordem da apuração.
            </p>
          </div>
          <button className="botao primario" onClick={recalcular} disabled={calculando || estado.totais.validos <= 0} style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {calculando ? 'Calculando…' : '↻ Recalcular agora'}
          </button>
        </div>
        {atual && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Análise exibida: <strong>{rotuloAnalise(atual)}</strong> · gerada {fmtDataHora(atual.criadoEm)}
            {atual.atualizadoTse && <> · dados do TSE de {fmtDataHoraTse(atual.atualizadoTse)}</>}
          </div>
        )}
      </section>

      {!analises ? (
        <div className="cartao col-12 esqueleto" style={{ height: 240 }} />
      ) : !atual ? (
        <div className="cartao col-12">
          <div className="vazio">
            {estado.totais.validos > 0
              ? 'A primeira análise sai quando 5% das seções estiverem apuradas. Use "Recalcular agora" para gerar uma antes disso.'
              : 'Os insights aparecem quando a apuração começar.'}
          </div>
        </div>
      ) : (
        <>
          <section className="col-12 insights-grade">
            {atual.insights.length === 0 && <div className="cartao vazio">Ainda não há diferenças relevantes em relação {estado.corrida.turno === 2 ? 'ao 1º turno' : `a ${ano}`}.</div>}
            {atual.insights.map((i) => (
              <Cartao key={i.id} i={i} cor={i.numero ? cand.get(i.numero)?.cor : undefined} novo={!!anterior && !idsAnteriores.has(i.id)} />
            ))}
          </section>

          {analises.length > 1 && (
            <section className="cartao col-12">
              <h2>Análises anteriores<span className="extra muted">{analises.length - 1}</span></h2>
              <div className="historico-insights">
                {[...analises].slice(0, -1).reverse().map((a, k) => {
                  const idx = analises.length - 2 - k;
                  return (
                    <div key={`${a.criadoEm}-${idx}`} className="historico-item">
                      <button className="link" onClick={() => setAberta(aberta === idx ? null : idx)} aria-expanded={aberta === idx}>
                        {aberta === idx ? '▾' : '▸'} {rotuloAnalise(a)} · {fmtDataHora(a.criadoEm)} · {a.insights.length} insights
                      </button>
                      {aberta === idx && (
                        <ul>
                          {a.insights.map((i) => <li key={i.id}><strong>{i.titulo}.</strong> <span className="muted">{i.texto}</span></li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

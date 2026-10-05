import type { ReactNode } from 'react';
import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtCompacto, fmtPct, fmtPP, fmtProb, titulo } from '../formato.ts';

function Kpi({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: ReactNode; detalhe: ReactNode; cor?: string }) {
  return (
    <div className="kpi" style={cor ? { borderTopColor: cor } : undefined}>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor num">{valor}</strong>
      <span className="kpi-detalhe">{detalhe}</span>
    </div>
  );
}

/** Indicadores principais da projeção: quem lidera, por quanto, com que margem e chance. */
export function Resumo({ estado }: { estado: EstadoCorrida }) {
  const p = estado.projecao;
  const cand = new Map(estado.candidatos.map((c) => [c.numero, c]));
  const nome = (n: string) => titulo(cand.get(n)?.nome ?? n);

  if (!p?.disponivel || !p.lideranca) {
    return (
      <section className="cartao col-12">
        <div className="kpis">
          {['1º colocado (projeção)', '2º colocado (projeção)', 'Vantagem projetada', 'Chance de 2º turno', 'Para vencer no 1º turno'].map((r) => (
            <Kpi key={r} rotulo={r} valor="—" detalhe={p?.motivo ?? 'Aparece com os primeiros votos apurados'} />
          ))}
        </div>
      </section>
    );
  }

  const l = p.lideranca;
  const c1 = p.candidatos.find((c) => c.numero === l.primeiro)!;
  const c2 = p.candidatos.find((c) => c.numero === l.segundo)!;
  const maioria = estado.corrida.maioriaAbsoluta;
  const precisa = p.restante.liderPrecisa;

  let textoPrecisa: ReactNode = '—';
  let detalhePrecisa: ReactNode = 'sem votos restantes relevantes';
  if (precisa !== null) {
    if (precisa > 1) { textoPrecisa = 'impossível'; detalhePrecisa = 'nem 100% dos válidos restantes bastariam'; }
    else if (precisa <= 0) { textoPrecisa = 'garantido'; detalhePrecisa = 'já tem mais da metade dos válidos possíveis'; }
    else {
      textoPrecisa = fmtPct(precisa, 1);
      detalhePrecisa = <>dos válidos restantes para {nome(l.primeiro).split(' ')[0]} · projeção: <strong className="num">{fmtPct(p.restante.liderProjetado ?? 0, 1)}</strong></>;
    }
  }

  return (
    <section className="cartao col-12">
      <div className="kpis">
        <Kpi
          rotulo="1º colocado (projeção)"
          cor={cand.get(l.primeiro)?.cor}
          valor={<>{fmtPct(c1.media, 1)} <small>± {fmtPP(c1.margem95)}</small></>}
          detalhe={<><strong>{nome(l.primeiro)}</strong> · {fmtCompacto(c1.votos.media)} votos</>}
        />
        <Kpi
          rotulo="2º colocado (projeção)"
          cor={cand.get(l.segundo)?.cor}
          valor={<>{fmtPct(c2.media, 1)} <small>± {fmtPP(c2.margem95)}</small></>}
          detalhe={<><strong>{nome(l.segundo)}</strong> · {fmtCompacto(c2.votos.media)} votos</>}
        />
        <Kpi
          rotulo="Vantagem projetada"
          valor={fmtPP(l.pontos.media)}
          detalhe={<>IC 95%: {fmtPP(l.pontos.p025)} a {fmtPP(l.pontos.p975)} · {fmtCompacto(Math.abs(l.votos.media))} votos · {nome(l.primeiro).split(' ')[0]} à frente em {fmtProb(l.probPrimeiroAFrente)}</>}
        />
        {maioria ? (
          <Kpi
            rotulo="Chance de 2º turno"
            valor={fmtProb(p.probSegundoTurno)}
            detalhe={<>vitória de {nome(l.primeiro).split(' ')[0]} no 1º turno: {fmtProb(c1.probVitoria)}</>}
          />
        ) : (
          <Kpi rotulo="Chance de vitória" valor={fmtProb(c1.probVitoria)} detalhe={nome(l.primeiro)} />
        )}
        <Kpi rotulo={maioria ? 'Para vencer no 1º turno' : 'Votos válidos restantes'} valor={maioria ? textoPrecisa : fmtCompacto(p.restante.validos.media)} detalhe={maioria ? detalhePrecisa : `IC 95%: ${fmtCompacto(p.restante.validos.p025)}–${fmtCompacto(p.restante.validos.p975)}`} />
      </div>
    </section>
  );
}

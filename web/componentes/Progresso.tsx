import type { EstadoCorrida } from '../../shared/tipos.ts';
import { fmtCompacto, fmtDataHoraTse, fmtInt, fmtPct, haQuanto } from '../formato.ts';

export function Progresso({ estado, agora }: { estado: EstadoCorrida; agora: number }) {
  const t = estado.totais;
  const comp = t.comparecimento;
  const apuradoEleit = t.eleitorado > 0 ? t.eleitoradoTotalizado / t.eleitorado : 0;
  const p = estado.projecao;
  return (
    <>
      <div className="progresso-topo">
        <span className="grande num">{fmtPct(t.percentualSecoes)}</span>
        <span className="rotulo">
          das seções totalizadas · {fmtInt(t.secoesTotalizadas)} de {fmtInt(t.secoesTotal)}
        </span>
        <span className="hora">
          {t.atualizadoEm ? `Atualização do TSE: ${fmtDataHoraTse(t.atualizadoEm, true)}` : 'Sem totalização ainda'}
          {estado.corrida.modo === 'ao-vivo' && ` · consulta ${haQuanto(estado.ultimaColeta, agora)}`}
        </span>
      </div>
      <div className="barra-progresso" role="progressbar" aria-valuenow={Math.round(t.percentualSecoes * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${t.percentualSecoes * 100}%` }} />
      </div>
      <div className="metricas">
        <div className="metrica"><span>Eleitorado</span><strong className="num">{fmtCompacto(t.eleitorado)}</strong></div>
        <div className="metrica"><span>Eleitorado apurado</span><strong className="num">{fmtPct(apuradoEleit, 1)}</strong></div>
        <div className="metrica">
          <span>Comparecimento</span>
          <strong className="num">{t.eleitoradoTotalizado > 0 ? fmtPct(comp / t.eleitoradoTotalizado, 1) : '—'}</strong>
          {p?.disponivel && t.eleitorado > 0 && <small className="num" title="Comparecimento final projetado">proj. {fmtPct(p.comparecimento.media / t.eleitorado, 1)}</small>}
        </div>
        <div className="metrica"><span>Votos válidos</span><strong className="num">{fmtCompacto(t.validos)}</strong></div>
        <div className="metrica"><span>Brancos</span><strong className="num">{comp > 0 ? fmtPct(t.brancos / comp, 1) : '—'}</strong></div>
        <div className="metrica"><span>Nulos</span><strong className="num">{comp > 0 ? fmtPct(t.nulos / comp, 1) : '—'}</strong></div>
        <div className="metrica">
          <span>Eleitores a apurar</span>
          <strong className="num">{fmtCompacto(Math.max(0, t.eleitorado - t.eleitoradoTotalizado))}</strong>
          {p?.disponivel && <small className="num" title="Votos válidos restantes estimados (IC 95%)">≈ {fmtCompacto(p.restante.validos.media)} válidos</small>}
        </div>
      </div>
    </>
  );
}

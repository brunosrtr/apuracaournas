import type { EstadoCorrida, StatusServidor, Totais } from '../../shared/tipos.ts';
import { fmtDataHora, fmtDataHoraTse, fmtHora, fmtPct, haQuanto } from '../formato.ts';

interface Props {
  estado: EstadoCorrida | null;
  status: StatusServidor | null;
  conectado: boolean;
  agora: number;
}

/** Minutos desde a última publicação do TSE (horário de Brasília) com a apuração ainda incompleta. */
function minutosSemPublicar(t: Totais, agora: number) {
  if (!t.atualizadoEm || t.percentualSecoes >= 0.999) return 0;
  const [data, hora] = t.atualizadoEm.split(' ');
  const [d, m, a] = data.split('/');
  const instante = Date.parse(`${a}-${m}-${d}T${hora}-03:00`);
  return Number.isFinite(instante) ? Math.floor((agora - instante) / 60_000) : 0;
}

/**
 * No celular, a porcentagem de seções totalizadas fica no cabeçalho fixo (abaixo da faixa de
 * atualização), acima dos candidatos.
 */
export function ProgressoFixo({ estado }: { estado: EstadoCorrida | null }) {
  if (!estado) return null;
  const t = estado.totais;
  return (
    <div className="progresso-fixo">
      <div className="pf-linha">
        <span><strong className="num">{fmtPct(t.percentualSecoes)}</strong> das seções totalizadas</span>
      </div>
      <div className="pf-barra" role="progressbar" aria-valuenow={Math.round(t.percentualSecoes * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${t.percentualSecoes * 100}%` }} />
      </div>
    </div>
  );
}

/** Barra fixa no topo: quando o TSE atualizou, quando a projeção foi recalculada e a próxima consulta. */
export function Atualizacao({ estado, status, conectado, agora }: Props) {
  if (!estado) return null;
  const sim = estado.corrida.modo === 'simulacao';
  const t = estado.totais;
  const p = estado.projecao?.disponivel ? estado.projecao : null;
  const intervalo = status?.aoVivo.intervaloColetaMs ?? 20_000;
  // o status (lido a cada 5 s) traz a última consulta mesmo quando nada mudou no TSE
  const ultima = (sim ? null : status?.aoVivo.ultimaColeta) ?? estado.ultimaColeta;
  const proxima = !sim && ultima ? Math.max(0, Math.ceil((ultima + intervalo - agora) / 1000)) : null;
  // dados do TSE parados há muito tempo com a apuração incompleta
  const paradoMin = sim ? 0 : minutosSemPublicar(t, agora);
  return (
    <div className="atualizacao" role="status" aria-live="off">
      <span className="atu-item">
        <span className={`ponto ${!conectado ? 'alerta' : sim ? 'ok' : 'vivo'}`} />
        {!conectado ? 'Reconectando ao servidor…' : sim ? 'Simulação' : 'Atualização automática ativa'}
      </span>
      <span className="atu-item">
        {sim ? 'Horário simulado' : 'Última atualização do TSE'}:{' '}
        <strong className="num" title={t.atualizadoEm ? fmtDataHoraTse(t.atualizadoEm, true) : undefined}>
          {t.atualizadoEm ? fmtDataHoraTse(t.atualizadoEm) : 'ainda sem totalização'}
        </strong>
      </span>
      {p && (
        <span className="atu-item">
          Projeção recalculada: <strong className="num" title={fmtDataHora(p.calculadaEm, true)}>{fmtDataHora(p.calculadaEm)}</strong>
        </span>
      )}
      {paradoMin >= 10 && (
        <span className="atu-item atu-alerta">
          ⚠ O TSE não publica dados novos há {paradoMin} min. O sistema segue consultando a cada {Math.round(intervalo / 1000)} s.
        </span>
      )}
      {!sim && ultima && (
        <span className="atu-item muted num">
          Consulta ao TSE às {fmtHora(ultima)} ({haQuanto(ultima, agora)}) · {proxima ? `próxima em ${proxima} s` : 'consultando agora…'}
        </span>
      )}
    </div>
  );
}

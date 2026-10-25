import type { ReactNode } from 'react';
import type { EstadoCorrida, Modo } from '../../shared/tipos.ts';
import { haQuanto } from '../formato.ts';

interface Props {
  modo: Modo;
  aoMudarModo: (m: Modo) => void;
  /** falso no servidor público: sem o seletor ao vivo / simulação */
  comSimulacao: boolean;
  estado: EstadoCorrida | null;
  conectado: boolean;
  agora: number;
  tema: 'claro' | 'escuro';
  alternarTema: () => void;
  /** conteúdo extra no cabeçalho fixo (barra de atualização) */
  extra?: ReactNode;
}

export function Cabecalho({ modo, aoMudarModo, comSimulacao, estado, conectado, agora, tema, alternarTema, extra }: Props) {
  const apurando = (estado?.totais.secoesTotalizadas ?? 0) > 0;
  let pilula;
  if (!conectado) pilula = <span className="pilula"><span className="ponto alerta" />Reconectando…</span>;
  else if (modo === 'simulacao') pilula = <span className="pilula"><span className="ponto vivo" style={{ background: 'var(--math)' }} />Simulação · 2022</span>;
  else if (estado?.erroColeta && !apurando) pilula = <span className="pilula" title={estado.erroColeta}><span className="ponto alerta" />Aguardando TSE</span>;
  else if (apurando) {
    pilula = (
      <span className="pilula" title={`Última consulta ao TSE ${haQuanto(estado!.ultimaColeta, agora)}`}>
        <span className="ponto vivo" />Ao vivo{estado!.totais.atualizadoEm ? ` · TSE ${estado!.totais.atualizadoEm.split(' ')[1]}` : ''}
      </span>
    );
  } else pilula = <span className="pilula"><span className="ponto ok" />Conectado ao TSE · aguardando 17h</span>;

  return (
    <header className="topo">
      <div className="topo-linha">
        <div className="marca">
          <div className="marca-icone" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-6" />
            </svg>
          </div>
          <div>
            <h1>Apuração · Presidente</h1>
            <small>{modo === 'simulacao' ? `Simulação do ${estado?.corrida.turno ?? 2}º turno de 2022` : `Eleições 2026 · ${estado?.corrida.turno ?? 2}º turno`}</small>
          </div>
        </div>
        {pilula}
        {comSimulacao && (
          <div className="segmentado" role="group" aria-label="Modo">
            <button aria-pressed={modo === 'ao-vivo'} onClick={() => aoMudarModo('ao-vivo')}>Ao vivo 2026</button>
            <button aria-pressed={modo === 'simulacao'} onClick={() => aoMudarModo('simulacao')}>Simulação 2022</button>
          </div>
        )}
        <button className="botao-icone" onClick={alternarTema} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'} title="Alternar tema">
          {tema === 'escuro' ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
      </div>
      {extra}
    </header>
  );
}

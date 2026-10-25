import type { StatusServidor } from '../../shared/tipos.ts';

interface Props {
  sim: StatusServidor['simulacao'];
  aoAgir: (acao: string, params?: string) => void;
}

const VELOCIDADES = [0.5, 1.5, 4, 10];

export function ControlesSimulacao({ sim, aoAgir }: Props) {
  const terminou = sim.progresso >= 1;
  return (
    <div className="sim" role="region" aria-label="Controles da simulação">
      <div>
        <strong>Simulação · {sim.corrida.turno}º turno de 2022</strong>
        <div className="muted" style={{ fontSize: 12.5, maxWidth: 420 }}>
          {sim.corrida.turno === 2 ? 'O modelo vê só a apuração parcial e o 1º turno, e é comparado ao resultado real ao final.' : 'O modelo vê só a apuração parcial (histórico: 2018 e 2014) e é comparado ao resultado real ao final.'}
        </div>
      </div>
      <div className="relogio num">{sim.relogio?.split(' ')[1] ?? '17:00'}</div>
      <div className="trilha" aria-label={`Progresso ${Math.round(sim.progresso * 100)}%`}><div style={{ width: `${sim.progresso * 100}%` }} /></div>
      {sim.ativa ? (
        <button className="botao primario" onClick={() => aoAgir('pausar')}>❚❚ Pausar</button>
      ) : (
        <button className="botao primario" onClick={() => aoAgir('iniciar')}>▶ {terminou ? 'Repetir' : sim.progresso > 0 ? 'Continuar' : 'Iniciar'}</button>
      )}
      <button className="botao" onClick={() => aoAgir('reiniciar')}>↺ Reiniciar</button>
      <div className="segmentado" role="group" aria-label="Velocidade">
        {VELOCIDADES.map((v) => (
          <button key={v} aria-pressed={sim.velocidade === v} onClick={() => aoAgir('velocidade', `?v=${v}`)} title={`${v} minuto(s) simulado(s) por segundo`}>
            {v < 1 ? '½' : v}×
          </button>
        ))}
      </div>
    </div>
  );
}

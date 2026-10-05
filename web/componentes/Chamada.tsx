import type { ReactNode } from 'react';
import type { Chamada } from '../../shared/tipos.ts';

const ICONES: Record<Chamada['status'], ReactNode> = {
  aguardando: <path d="M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />,
  indefinido: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  provavel: <path d="m3 17 6-6 4 4 8-8M14 7h7v7" />,
  projetado: <path d="M20 6 9 17l-5-5" />,
  matematico: <><path d="M20 6 9 17l-5-5" /><path d="M2 12h0" /></>,
};

export function FaixaChamada({ chamada }: { chamada: Chamada }) {
  return (
    <div className={`chamada ${chamada.status}`} role="status" aria-live="polite">
      <div className="icone" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {ICONES[chamada.status]}
        </svg>
      </div>
      <div>
        <h3>{chamada.titulo}</h3>
        <p>{chamada.detalhe}</p>
      </div>
    </div>
  );
}

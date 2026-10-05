import { useEffect, useRef, useState } from 'react';
import type { AnaliseInsights, EstadoCorrida, ResumoPartidos, StatusServidor, UnidadeResumo } from '../shared/tipos.ts';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  status: () => json<StatusServidor>('/api/status'),
  corrida: (id: string) => json<EstadoCorrida>(`/api/corrida/${id}`),
  unidades: (id: string) => json<UnidadeResumo[]>(`/api/corrida/${id}/unidades`),
  partidos: () => json<ResumoPartidos>('/api/partidos'),
  insights: (id: string) => json<{ analises: AnaliseInsights[] }>(`/api/insights/${id}`),
  recalcularInsights: (id: string) => json<AnaliseInsights>(`/api/insights/${id}/recalcular`, { method: 'POST' }),
  simulacao: (acao: string, params = '') => json<StatusServidor['simulacao']>(`/api/simulacao/${acao}${params}`, { method: 'POST' }),
};

type Ouvinte = (ev: { id: string; versao: number }) => void;
const ouvintes = new Set<Ouvinte>();
let fonte: EventSource | null = null;
let conectado = false;
const ouvintesConexao = new Set<(ok: boolean) => void>();

function garantirFonte() {
  if (fonte) return;
  fonte = new EventSource('/api/eventos');
  fonte.onopen = () => { conectado = true; ouvintesConexao.forEach((f) => f(true)); };
  fonte.onerror = () => { conectado = false; ouvintesConexao.forEach((f) => f(false)); };
  fonte.onmessage = (m) => {
    try {
      const ev = JSON.parse(m.data);
      ouvintes.forEach((f) => f(ev));
    } catch { /* ignora */ }
  };
}

/** Recebe avisos do servidor (SSE) sempre que uma disputa muda. */
export function useEventos(ouvinte: Ouvinte) {
  const ref = useRef(ouvinte);
  ref.current = ouvinte;
  useEffect(() => {
    garantirFonte();
    const f: Ouvinte = (ev) => ref.current(ev);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);
}

export function useConexao(): boolean {
  const [ok, setOk] = useState(conectado);
  useEffect(() => {
    garantirFonte();
    ouvintesConexao.add(setOk);
    return () => { ouvintesConexao.delete(setOk); };
  }, []);
  return ok;
}

/** Relógio que atualiza a cada `ms` (para "há X segundos"). */
export function useAgora(ms = 1000): number {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return agora;
}

export function useTema(): ['claro' | 'escuro', () => void] {
  const preferido = () => {
    try {
      const salvo = localStorage.getItem('tema');
      if (salvo === 'claro' || salvo === 'escuro') return salvo;
    } catch { /* sem armazenamento */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  };
  const [tema, setTema] = useState<'claro' | 'escuro'>(preferido);
  useEffect(() => {
    document.documentElement.dataset.theme = tema === 'escuro' ? 'dark' : 'light';
  }, [tema]);
  const alternar = () => {
    const novo = tema === 'escuro' ? 'claro' : 'escuro';
    try { localStorage.setItem('tema', novo); } catch { /* sem armazenamento */ }
    setTema(novo);
  };
  return [tema, alternar];
}

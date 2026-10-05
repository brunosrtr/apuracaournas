const inteiro = new Intl.NumberFormat('pt-BR');

export const fmtInt = (v: number) => inteiro.format(Math.round(v));

export const fmtPct = (v: number, casas = 2) =>
  `${(100 * (Number.isFinite(v) ? v : 0)).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const fmtCompacto = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : v >= 1e3 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
      : fmtInt(v);

export function fmtProb(p: number): string {
  if (p >= 0.999) return '>99,9%';
  if (p <= 0.001) return '<0,1%';
  return `${(100 * p).toLocaleString('pt-BR', { maximumFractionDigits: p > 0.99 || p < 0.01 ? 1 : 0 })}%`;
}

export function haQuanto(ms: number | null, agora: number): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((agora - ms) / 1000));
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s} s`;
  return `há ${Math.round(s / 60)} min`;
}

export const iniciais = (nome: string) =>
  nome.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'-])(\S)/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

/** pontos percentuais, com sinal opcional */
export const fmtPP = (v: number, casas = Math.abs(v) < 0.005 && v !== 0 ? 2 : 1, sinal = false) =>
  `${sinal && v > 0 ? '+' : ''}${(100 * v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} p.p.`;

export const primeiroNome = (nome: string) => titulo(nome).split(' ').slice(0, 2).join(' ');

const FUSO = 'America/Sao_Paulo';

/** data e hora de Brasília: "04/10/2026 às 18:42" */
export const fmtDataHora = (ms: number, segundos = false) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...(segundos ? { second: '2-digit' as const } : {}),
  }).format(ms).replace(', ', ' às ');

export const fmtHora = (ms: number) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ms);

/** horário informado pelo TSE ("04/10/2026 18:42:10") → "04/10/2026 às 18:42" */
export const fmtDataHoraTse = (s: string, segundos = false) => {
  const [data, hora = ''] = s.split(' ');
  return `${data} às ${segundos ? hora : hora.slice(0, 5)}`;
};

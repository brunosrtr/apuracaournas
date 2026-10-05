// Decide o "status" exibido no topo: aguardando, indefinido, tendência, projeção ou definição matemática.
import type { Chamada, EstadoCorrida } from './tipos.ts';

const CERTEZA = 0.995;
const TENDENCIA = 0.9;
const MIN_APURADO_PARA_PROJETAR = 0.1;

const pct = (v: number) => `${(100 * v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export function calcularChamada(e: EstadoCorrida): Chamada {
  const nome = (n: string) => e.candidatos.find((c) => c.numero === n)?.nome ?? n;
  const t = e.totais;

  if (t.secoesTotalizadas === 0) {
    return e.corrida.modo === 'simulacao'
      ? { status: 'aguardando', titulo: 'Simulação pronta', detalhe: 'Pressione "Iniciar" para reapresentar a noite de 2 de outubro de 2022.' }
      : { status: 'aguardando', titulo: 'Aguardando a divulgação', detalhe: 'O TSE divulga os primeiros resultados após o fechamento das urnas, às 17h (horário de Brasília).' };
  }
  if (e.matematico?.definido) {
    return { status: 'matematico', titulo: e.matematico.texto, detalhe: 'Definido pelos votos já apurados: nem todo o eleitorado restante mudaria o resultado.' };
  }
  const p = e.projecao;
  if (!p?.disponivel) return { status: 'indefinido', titulo: 'Calibrando o modelo', detalhe: p?.motivo ?? 'Aguardando mais seções totalizadas.' };

  const apurado = p.diagnostico?.fracaoEleitoradoApurado ?? 0;
  const podeProjetar = apurado >= MIN_APURADO_PARA_PROJETAR;
  const sufixo = `${p.simulacoes.toLocaleString('pt-BR')} cenários simulados · ${pct(apurado)} do eleitorado apurado`;
  const reais = p.candidatos.filter((c) => !c.agrupado);
  const lider = [...reais].sort((a, b) => b.probVitoria - a.probVitoria)[0];

  if (e.corrida.maioriaAbsoluta) {
    const par = p.paresSegundoTurno[0];
    if (lider && lider.probVitoria >= CERTEZA && podeProjetar) {
      return { status: 'projetado', titulo: `Projeção: ${nome(lider.numero)} vence no 1º turno`, detalhe: `Probabilidade ${pct(lider.probVitoria)} · ${sufixo}` };
    }
    if (par && p.probSegundoTurno >= CERTEZA && par.prob >= CERTEZA && podeProjetar) {
      return { status: 'projetado', titulo: `Projeção: 2º turno entre ${nome(par.a)} e ${nome(par.b)}`, detalhe: `Probabilidade ${pct(par.prob)} · ${sufixo}` };
    }
    if (lider && lider.probVitoria >= TENDENCIA) {
      return { status: 'provavel', titulo: `Tendência: ${nome(lider.numero)} vence no 1º turno`, detalhe: `Probabilidade ${pct(lider.probVitoria)} · ${sufixo}` };
    }
    if (p.probSegundoTurno >= TENDENCIA) {
      const texto = par && par.prob >= 0.5 ? `Tendência de 2º turno entre ${nome(par.a)} e ${nome(par.b)}` : 'Tendência de 2º turno';
      return { status: 'provavel', titulo: texto, detalhe: `Chance de 2º turno ${pct(p.probSegundoTurno)} · ${sufixo}` };
    }
    return { status: 'indefinido', titulo: 'Disputa em aberto', detalhe: `Chance de 2º turno ${pct(p.probSegundoTurno)} · ${sufixo}` };
  }

  // sem maioria absoluta (2º turno ou Senado): elegem-se os k mais votados
  const k = Math.max(1, e.corrida.vagas);
  const eleitos = [...reais].sort((a, b) => b.probVitoria - a.probVitoria).slice(0, k);
  const menor = Math.min(...eleitos.map((c) => c.probVitoria));
  const nomes = eleitos.map((c) => nome(c.numero)).join(' e ');
  const verbo = k > 1 ? 'eleitos' : 'eleito';
  if (eleitos.length && menor >= CERTEZA && podeProjetar) {
    return { status: 'projetado', titulo: `Projeção: ${nomes} ${verbo}`, detalhe: `Probabilidade mínima ${pct(menor)} · ${sufixo}` };
  }
  if (eleitos.length && menor >= TENDENCIA) {
    return { status: 'provavel', titulo: `Tendência: ${nomes} ${verbo}`, detalhe: `Probabilidade mínima ${pct(menor)} · ${sufixo}` };
  }
  return { status: 'indefinido', titulo: 'Disputa em aberto', detalhe: sufixo };
}

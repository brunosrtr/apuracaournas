import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EstadoCorrida, Modo, StatusServidor, UnidadeResumo } from '../shared/tipos.ts';
import { calcularChamada } from '../shared/chamada.ts';
import { api, useAgora, useConexao, useEventos, useTema } from './cliente.ts';
import { Cabecalho } from './componentes/Cabecalho.tsx';
import { ControlesSimulacao } from './componentes/ControlesSimulacao.tsx';
import { FaixaChamada } from './componentes/Chamada.tsx';
import { Progresso } from './componentes/Progresso.tsx';
import { Resumo } from './componentes/Resumo.tsx';
import { Candidatos } from './componentes/Candidatos.tsx';
import { Cenarios } from './componentes/Cenarios.tsx';
import { Distribuicao } from './componentes/Distribuicao.tsx';
import { Evolucao, EvolucaoProbabilidades } from './componentes/Evolucao.tsx';
import { Mapa } from './componentes/Mapa.tsx';
import { Comparacao } from './componentes/Comparacao.tsx';
import { Estados } from './componentes/Estados.tsx';
import { Regioes } from './componentes/Regioes.tsx';
import { Municipios } from './componentes/Municipios.tsx';
import { Modelo } from './componentes/Modelo.tsx';
import { Validacao } from './componentes/Validacao.tsx';
import { PainelEstado } from './componentes/PainelEstado.tsx';
import { Atualizacao } from './componentes/Atualizacao.tsx';
import { FrenteAFrente } from './componentes/FrenteAFrente.tsx';
import { Insights } from './componentes/Insights.tsx';

type Aba = 'insights' | 'estados' | 'regioes' | 'municipios' | 'modelo' | 'validacao';
const modoInicial = (): Modo => (location.hash.includes('simulacao') ? 'simulacao' : 'ao-vivo');

export function App() {
  const [tema, alternarTema] = useTema();
  const agora = useAgora(1000);
  const conectado = useConexao();
  const [status, setStatus] = useState<StatusServidor | null>(null);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [estado, setEstado] = useState<EstadoCorrida | null>(null);
  const [unidades, setUnidades] = useState<UnidadeResumo[] | null>(null);
  const [aba, setAba] = useState<Aba>('insights');
  const [ufPainel, setUfPainel] = useState<string | null>(null);
  const fecharPainel = useCallback(() => setUfPainel(null), []);
  const [erro, setErro] = useState<string | null>(null);

  const carregarStatus = useCallback(() => {
    api.status().then((s) => { setStatus(s); setErro(null); }).catch(() => setErro('Sem conexão com o servidor local.'));
  }, []);
  useEffect(() => {
    carregarStatus();
    const t = setInterval(carregarStatus, 5_000);
    return () => clearInterval(t);
  }, [carregarStatus]);

  // no servidor público a simulação não é oferecida: links antigos para ela caem no ao vivo
  const comSimulacao = status?.simulacao.controlavel ?? false;
  useEffect(() => {
    if (status && !comSimulacao && modo === 'simulacao') setModo('ao-vivo');
  }, [status, comSimulacao, modo]);

  const corridaId = modo === 'simulacao' ? status?.simulacao.corrida.id ?? null : status?.aoVivo.corrida?.id ?? null;

  useEffect(() => {
    const hash = modo === 'simulacao' ? '#/simulacao' : '#/ao-vivo';
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, [modo]);

  const versao = useRef(-1);
  const carregarEstado = useCallback((id: string) => {
    api.corrida(id).then((e) => {
      if (e.corrida.id !== id) return;
      versao.current = e.versao;
      setEstado(e);
    }).catch(() => {});
  }, []);

  const ultimaUnidades = useRef(0);
  const timerUnidades = useRef<number | null>(null);
  const carregarUnidades = useCallback((id: string, imediato = false) => {
    const intervalo = id.startsWith('sim-') ? 2500 : 8000;
    const espera = imediato ? 0 : Math.max(0, intervalo - (Date.now() - ultimaUnidades.current));
    if (timerUnidades.current) return;
    timerUnidades.current = window.setTimeout(() => {
      timerUnidades.current = null;
      ultimaUnidades.current = Date.now();
      api.unidades(id).then((u) => setUnidades(u)).catch(() => {});
    }, espera);
  }, []);

  useEffect(() => {
    setEstado(null);
    setUnidades(null);
    versao.current = -1;
    if (!corridaId) return;
    carregarEstado(corridaId);
    if (timerUnidades.current) { clearTimeout(timerUnidades.current); timerUnidades.current = null; }
    carregarUnidades(corridaId, true);
    const t = setInterval(() => carregarEstado(corridaId), 30_000);
    return () => clearInterval(t);
  }, [corridaId, carregarEstado, carregarUnidades]);

  useEventos((ev) => {
    if (!corridaId || ev.id !== corridaId || ev.versao === versao.current) return;
    carregarEstado(corridaId);
    carregarUnidades(corridaId);
    if (corridaId.startsWith('sim-')) carregarStatus();
  });

  const chamada = useMemo(() => (estado ? calcularChamada(estado) : null), [estado]);
  const simulacao = modo === 'simulacao';
  const segundoTurno = (estado?.corrida.turno ?? 1) === 2;

  const acaoSimulacao = (acao: string, params = '') => {
    api.simulacao(acao, params).then((s) => setStatus((st) => (st ? { ...st, simulacao: s } : st)));
  };

  useEffect(() => {
    if (!simulacao && aba === 'validacao') setAba('estados');
  }, [simulacao, aba]);

  const abas: [Aba, string][] = [
    ['insights', 'Insights'],
    ['estados', 'Estados'],
    ['regioes', 'Regiões'],
    ['municipios', 'Municípios'],
    ['modelo', 'Como funciona o modelo'],
    ...(simulacao ? [['validacao', `Validação (${status?.simulacao.corrida.turno ?? 2}º turno 2022)`] as [Aba, string]] : []),
  ];

  return (
    <div className="app">
      <Cabecalho
        modo={modo}
        aoMudarModo={setModo}
        comSimulacao={comSimulacao}
        estado={estado}
        conectado={conectado}
        agora={agora}
        tema={tema}
        alternarTema={alternarTema}
        extra={<Atualizacao estado={estado} status={status} conectado={conectado} agora={agora} />}
      />

      {erro && <div className="chamada indefinido"><div><h3>{erro}</h3><p>Verifique se o servidor (npm start) está rodando.</p></div></div>}
      {simulacao && status && <ControlesSimulacao sim={status.simulacao} aoAgir={acaoSimulacao} />}
      {!simulacao && status && !status.aoVivo.disponivel && (
        <div className="chamada indefinido"><div><h3>Conectando ao TSE…</h3><p>{status.aoVivo.erro ?? 'Lendo a configuração oficial da eleição.'}</p></div></div>
      )}

      {!estado ? (
        <div className="grade">
          <div className="cartao col-12 esqueleto" style={{ height: 120 }} />
          <div className="cartao col-7 esqueleto" style={{ height: 420 }} />
          <div className="cartao col-5 esqueleto" style={{ height: 420 }} />
        </div>
      ) : (
        <>
          {chamada && <FaixaChamada chamada={chamada} />}
          <div className="grade">
            <section className="cartao col-12">
              <Progresso estado={estado} agora={agora} />
            </section>

            {segundoTurno ? (
              <>
                <FrenteAFrente estado={estado} />
                <section className="cartao col-7">
                  <Mapa estado={estado} unidades={unidades} aoSelecionarUf={setUfPainel} />
                </section>
                <div className="col-5 pilha">
                  <section className="cartao">
                    <Cenarios estado={estado} />
                  </section>
                  <section className="cartao">
                    <h2>Distribuição dos cenários<span className="extra muted">fração final dos válidos</span></h2>
                    <Distribuicao estado={estado} />
                  </section>
                </div>
              </>
            ) : (
              <>
                <Resumo estado={estado} />
                <section className="cartao col-7">
                  <h2>Candidatos<span className="extra muted">{estado.projecao?.disponivel ? 'apurado · projeção com margem de erro (95%)' : 'apurado'}</span></h2>
                  <Candidatos estado={estado} />
                </section>
                <section className="cartao col-5">
                  <Mapa estado={estado} unidades={unidades} aoSelecionarUf={setUfPainel} />
                </section>
                <section className="cartao col-7">
                  <h2>Distribuição dos cenários simulados<span className="extra muted">fração final dos válidos</span></h2>
                  <Distribuicao estado={estado} />
                </section>
                <section className="cartao col-5">
                  <Cenarios estado={estado} />
                </section>
              </>
            )}

            <section className="cartao col-7">
              <h2>Evolução da apuração<span className="extra muted">eixo x: seções totalizadas</span></h2>
              <Evolucao estado={estado} />
            </section>
            <section className="cartao col-5">
              <h2>Evolução das probabilidades</h2>
              <EvolucaoProbabilidades estado={estado} />
            </section>

            <section className="cartao col-12">
              <Comparacao estado={estado} />
            </section>

            <section className="col-12">
              <div className="abas-sec" role="tablist">
                {abas.map(([id, rotulo]) => (
                  <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{rotulo}</button>
                ))}
              </div>
              {aba === 'insights' && <Insights estado={estado} />}
              {aba === 'estados' && <Estados estado={estado} aoSelecionarUf={setUfPainel} />}
              {aba === 'regioes' && <Regioes estado={estado} />}
              {aba === 'municipios' && <Municipios estado={estado} unidades={unidades} />}
              {aba === 'modelo' && <Modelo estado={estado} />}
              {aba === 'validacao' && simulacao && <Validacao estado={estado} />}
            </section>
          </div>
        </>
      )}

      {ufPainel && estado && <PainelEstado uf={ufPainel} presidente={estado} aoFechar={fecharPainel} />}

      <footer className="rodape">
        Dados: <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer">divulgação oficial do TSE</a> ·
        histórico: Portal de Dados Abertos do TSE · mapas: IBGE.<br />
        Projeções são estimativas estatísticas independentes e <strong>não</strong> substituem o resultado oficial da Justiça Eleitoral.
        {status?.aoVivo && <> · {status.aoVivo.requisicoes.toLocaleString('pt-BR')} consultas ao TSE nesta sessão</>}
      </footer>
    </div>
  );
}

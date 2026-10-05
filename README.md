# apuracaournas — apuração das Eleições 2026 com projeção estatística

Painel que acompanha **em tempo real** a apuração das Eleições Gerais de 2026 a partir dos arquivos públicos do TSE e
**projeta o resultado final** com margem de erro e probabilidades. As projeções usam os votos já apurados e o histórico de
2022 e 2018, município a município.

Olhar só o parcial engana porque a ordem da apuração não é aleatória: em 2022, Bolsonaro liderou o 1º turno até cerca de
70% das urnas apuradas, porque o Nordeste foi totalizado depois. O modelo corrige isso estimando, em cada município ainda
não apurado, quantos votos faltam e como eles devem se dividir.

> Projeto independente, sem vínculo com o TSE. As projeções são estimativas estatísticas e **não substituem o resultado
> oficial da Justiça Eleitoral**.

## O que o painel mostra

**Presidente (painel principal)**
- **Projeção de cada candidato:** fração final dos válidos com **margem de erro (IC 95%)**, intervalo de 80% e votos projetados.
- **Vantagem do líder** em pontos e em votos, com intervalo de confiança.
- **Probabilidades:** 2º turno, vitória no 1º turno, confronto mais provável e 1º lugar.
- **Quanto o líder precisa** dos votos válidos restantes para vencer no 1º turno, comparado com o que o modelo projeta.
- **Distribuição** dos 4.000 cenários simulados, com a linha de 50%.
- **Evolução** da apuração (parcial × projeção) e das probabilidades ao longo da noite.
- **Definição matemática:** o resultado não muda nem se todo o eleitorado restante votar no adversário.
- **Mapa** por estado e por município (os ainda sem votos aparecem hachurados com o líder projetado) e tabela de municípios.
- **Comparação com 2022** nos mesmos municípios: Lula × Lula e PL × PL.
- **Comparecimento, abstenção, brancos e nulos** projetados.

**Abas**
- **Insights:** a cada 5% de seções apuradas, uma análise automática do que mudou em relação a 2022, sempre nos mesmos
  municípios e na mesma proporção já apurada. Exemplo: "Rio Grande do Sul: PL com +12% de votos em relação a 2022". A
  análise cobre:
  - variação nacional, por região, por estado e nas cidades grandes;
  - viradas (estado em que o vencedor provável muda);
  - comparecimento e brancos e nulos;
  - candidatos novos;
  - distorção do parcial e estabilidade da projeção.

  O botão **Recalcular agora** gera uma análise na hora, e as análises anteriores ficam no histórico.
- **Estados** e **Regiões:** apurado, projeção com margem de erro, líder provável e variação em relação a 2022.
- **Partidos · Governador e Senado:**
  - governador: estados em 1º lugar, eleitos no 1º turno e presença no 2º turno;
  - Senado: cadeiras esperadas entre as 54 vagas, com intervalo;
  - gráficos de **esquerda, centro e direita** (mosaico dos 27 estados e semicírculo do Senado).
- **Municípios**, **Como funciona o modelo** (com diagnóstico ao vivo) e **Validação** (no modo simulação).

**Painel do estado:** ao clicar num estado no mapa, abre um painel com:
- Presidente naquele estado;
- **Governador**, com projeção, chance de 2º turno e confronto mais provável;
- **Senador**, com 2 vagas: chance de cada um ser eleito e a disputa pela 2ª vaga.

**Simulação 2022:** reapresenta a noite de 2 de outubro de 2022 usando 2018 e 2014 como histórico, para demonstrar o modelo
e medir a precisão contra o resultado real.

## Como rodar

Requisitos: **Node.js 23.6 ou superior**. O servidor roda TypeScript direto, sem etapa de compilação. Foi testado no Node 25.

```bash
npm install
npm start
```

Abra http://localhost:8787. Na primeira execução, a base histórica é baixada e preparada automaticamente (cerca de 15 MB do
Portal de Dados Abertos do TSE e do IBGE, em uns 10 segundos).

Para desenvolvimento, com recarga automática, use `npm run dev` e acesse http://localhost:5173.

| Comando | O que faz |
|---|---|
| `npm start` | Compila a interface e sobe o servidor (porta 8787) |
| `npm run dev` | Servidor com recarga automática e interface no Vite (porta 5173) |
| `npm run dados` | Baixa e prepara de novo a base histórica (2014, 2018 e 2022) |
| `npm run testar` | Backtest: apuração de 2022 com histórico de 2018 e 2014 |
| `npm run testar -- grade` | Busca de hiperparâmetros (calibração da margem de erro) |
| `npm run testar -- ordem` | Testes de estresse da ordem da apuração (Nordeste por último / primeiro) |
| `npm run testar -- crescimento` | A/B: crescimento do eleitorado como variável de preferência |
| `npm run tipos` | Checagem de tipos |

### Na noite da eleição

Para o servidor não depender de um terminal aberto e voltar sozinho se cair, rode-o com o supervisor:

```bash
mkdir -p data && nohup scripts/supervisor.sh >> data/servidor.log 2>&1 &
```

Para desligar, primeiro impeça o reinício automático e depois encerre o processo:

```bash
touch data/parar
```

```bash
pkill -f "node server/index.ts"
```

O estado da apuração é salvo em `data/cache/` a cada 20 segundos. Ao religar, o servidor restaura o histórico e busca no TSE
o que faltar.

### Configuração (variáveis de ambiente)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORTA` | `8787` | Porta do servidor |
| `INTERVALO_COLETA_MS` | `20000` | Intervalo entre consultas ao TSE (Presidente) |
| `INTERVALO_ESTADUAL_MS` | `40000` | Intervalo para Governador e Senado das 27 UFs |
| `CONCORRENCIA` / `CONCORRENCIA_ESTADUAL` | `8` / `5` | Requisições simultâneas ao TSE |
| `SIMULACOES` / `SIMULACOES_ESTADUAIS` | `4000` / `1500` | Cenários de Monte Carlo por projeção |
| `THREADS` | `4` | Threads do modelo de Presidente (Governador/Senado e simulação usam outras 2 cada) |

## Como funciona

```
 resultados.tse.jus.br ──► coletor incremental ──► estado da eleição ──► modelo (4 threads) ──► API + eventos (SSE) ──► painel
   (JSON / JWS)             só baixa o que mudou     por município         ajuste + Monte Carlo     atualização automática
                                                          ▲
 Portal de Dados Abertos ──► base histórica 2014/2018/2022 ┘  (variáveis por município, regiões do IBGE)
```

### Atualização automática

- O servidor consulta o TSE a cada 20 s (Presidente) e 40 s (Governador e Senado). Ele lê primeiro o andamento por estado e
  por município e só baixa o resultado de um município quando ele mudou.
- Quando algo muda, a projeção é recalculada e o navegador é avisado na hora (Server-Sent Events). A tela se atualiza sozinha
  e mostra, numa barra fixa, a **data e hora da última atualização do TSE**, quando a projeção foi recalculada e a contagem
  até a próxima consulta.
- **Proteções:**
  - o TSE publica cada arquivo também numa versão assinada (`.jws`); o coletor confere qual das duas está mais recente e
    usa a assinada se ela estiver à frente;
  - se o arquivo nacional ficar parado mais de 3 min com a apuração incompleta, o sistema pede uma cópia sem cache, para
    contornar uma CDN desatualizada;
  - se o próprio TSE ficar mais de 10 min sem publicar, a tela avisa.
- A eleição (1º ou 2º turno) é descoberta automaticamente na configuração oficial do TSE.

### O modelo de projeção

Implementado em `server/modelo/projecao.ts`:

1. **Quanto falta.** Para cada município: eleitorado de 2026 ainda não apurado × comparecimento esperado × fração de
   válidos. O eleitorado é o do cadastro oficial de 2026, que já reflete o crescimento de cada cidade desde 2022. O
   comparecimento histórico do município é corrigido pela variação já observada na região.
2. **Regressão com o histórico.** Para cada candidato, uma regressão bayesiana ponderada relaciona o voto nos municípios
   apurados a 15 variáveis:
   - votação de 2022 (com termos quadráticos) e 2º turno de 2022;
   - comparecimento e brancos e nulos de 2022;
   - votação e 2º turno de 2018;
   - porte do município e capital.

   **Priori de swing logístico:** quem já disputou (o mesmo candidato ou o mesmo partido) começa com a mesma geografia de
   antes, ajustada à força atual (Lula 2026 ≈ Lula 2022; PL 2026 ≈ Bolsonaro 2022).
3. **Efeitos regionais aninhados** (macrorregião → UF → região intermediária do IBGE), estimados por DerSimonian–Laird e
   encolhidos (empirical Bayes). Dois choques correlacionados entram na margem de erro:
   - um comum ao eleitorado ainda não apurado;
   - outro comum às regiões ainda sem nenhum voto, para o caso de uma região (ex.: o Nordeste) atrasar e votar diferente.
4. **Combinação com o parcial.** Em cada município parcialmente apurado, previsão e parcial são combinados pela precisão de
   cada um (atualização normal–normal), com s² = p(1−p)(1−f)(1/n + δ²).
5. **Monte Carlo em paralelo:** 4.000 cenários por atualização, divididos entre threads. Cada cenário sorteia
   coeficientes, efeitos regionais, ruído municipal e choques de comparecimento. Candidatos com menos de 1% são projetados em
   grupo e divididos na proporção apurada.

Governador e Senador usam o mesmo modelo, aplicado aos municípios de cada estado, sem a priori de swing. O Senado
considera as 2 vagas de 2026.

### Precisão (backtest: apuração de 2022 com histórico de 2018 e 2014)

| Seções apuradas | Parcial (Lula × Bolsonaro) | Projeção ± margem de erro (95%) | Chance de 2º turno |
|---|---|---|---|
| 4% | 39,2% × 52,4% | 50,5% ± 2,6 × 41,3% ± 2,7 | 37% |
| 24% | 41,2% × 50,3% | 48,9% ± 1,9 × 43,0% ± 1,9 | 87% |
| 45% | 45,4% × 46,4% | 48,5% ± 1,4 × 43,2% ± 1,4 | 99% |
| 64% | 47,9% × 44,1% | 48,4% ± 0,9 × 43,3% ± 0,9 | 99,9% |
| **Final real** | **48,4% × 43,2%** | | **houve 2º turno** |

- Erro médio nos 4 principais candidatos com menos de 30% apurado: **1,1 ponto**. Olhando só o parcial, o erro chega a 6
  pontos.
- **Margem de erro calibrada:** o intervalo de 95% cobriu o resultado real em 95% dos casos, e o de 80% em 85%.
- Estados com 64% das seções apuradas: MG 48,3% (real 48,3%), BA 69,7% (69,7%), PR 36,2% (36,0%), PE 65,4% (65,3%).

**Ordem da apuração** (`npm run testar -- ordem`). O modelo não sabe a ordem; só vê o que já foi apurado.

| Cenário | Parcial | Projeção | Real |
|---|---|---|---|
| Nordeste por último: 64% do país apurado, 0% do Nordeste | Lula 41,3% × Bolsonaro 49,9% | 49,2% ± 1,7 × 42,0% ± 1,6 | 48,4% × 43,2% |
| Nordeste primeiro: 28% do país apurado, 80% do Nordeste | Lula 64,0% × Bolsonaro 29,8% | 46,1% ± 3,0 × 45,7% ± 3,0 | 48,4% × 43,2% |

O resultado real ficou dentro da margem de 95% em 15 dos 16 pontos testados.

**Testado e descartado.** O crescimento do eleitorado como variável de preferência (`npm run testar -- crescimento`) ficou
neutro na média (erro de 1,20 → 1,22 ponto), por isso está desligado (`usarCrescimento` em `server/corrida.ts`). Ele
continua valendo no peso de cada município.

## Fontes de dados

| Fonte | Uso |
|---|---|
| `resultados.tse.jus.br/oficial` | Ao vivo: `<uf>[<município>]-c<cargo>-e<eleição>-u.json` (totais e candidatos), `<uf>-e<eleição>-ab.json` (andamento), fotos dos candidatos e versões assinadas `.jws` |
| Portal de Dados Abertos do TSE | Votação para presidente por município em 2014, 2018 e 2022, lida em partes direto do `.zip` (HTTP Range) |
| IBGE | Malhas municipais e regiões geográficas intermediárias |

A pasta `data/` (base histórica, malhas, estado salvo e fotos em cache) não é versionada: ela é recriada na primeira
execução.

## Estrutura

```
server/
  index.ts             servidor HTTP: API, eventos (SSE), fotos, persistência, arquivos estáticos
  config.ts            parâmetros e constantes
  corrida.ts           estado de cada eleição (apuração, projeção, histórico, resumos por UF/região)
  insights.ts          análises automáticas a cada 5% apurado
  partidos.ts          resumo por partido e bloco (Governador e Senado)
  tse/                 cliente HTTP (JSON/JWS, cache), leitura dos arquivos do TSE, coletor incremental
  modelo/              projeção (ajuste + Monte Carlo + consolidação), variáveis históricas, threads, backtest
  simulacao/           reapresentação da apuração de 2022
  dados/               preparação da base histórica (zip remoto via HTTP Range)
shared/                tipos e regras compartilhados (cores, ideologia dos partidos, "chamada" do resultado)
web/                   interface em React (Vite), sem bibliotecas de gráficos: SVG + d3-geo para os mapas
scripts/supervisor.sh  mantém o servidor no ar durante a apuração
```

## Limitações

- A projeção usa apenas votos apurados e eleições passadas, nunca pesquisas. Nos primeiros minutos a incerteza é grande, e
  a margem de erro mostra isso.
- Candidatos sem equivalente em 2022 ou 2018 dependem só do padrão dos municípios já apurados.
- Governador e Senador não têm backtest próprio: suas margens não foram calibradas como as de Presidente.
- A classificação ideológica dos partidos (`shared/ideologia.ts`) é uma simplificação, editável.
- Os arquivos de divulgação do TSE não têm documentação oficial nem garantia de formato. Se a estrutura mudar, o parser
  (`server/tse/parse.ts`) é o ponto a ajustar.

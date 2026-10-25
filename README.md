# apuracaournas — apuração das Eleições 2026 com projeção estatística

Painel que acompanha **em tempo real** a apuração para **Presidente** nas Eleições de 2026 a partir dos arquivos públicos do
TSE e **projeta o resultado final** com margem de erro e probabilidades, município a município. No 1º turno a projeção usa
o histórico de 2022 e 2018; no **2º turno**, usa o resultado do 1º turno de 2026 em cada município (e o 2º turno de 2022)
e aprende ao vivo para onde estão indo os votos dos candidatos eliminados.

Olhar só o parcial engana porque a ordem da apuração não é aleatória: em 2022, Bolsonaro liderou o 1º turno até cerca de
70% das urnas apuradas, porque o Nordeste foi totalizado depois. O modelo corrige isso estimando, em cada município ainda
não apurado, quantos votos faltam e como eles devem se dividir.

> Projeto independente, sem vínculo com o TSE. As projeções são estimativas estatísticas e **não substituem o resultado
> oficial da Justiça Eleitoral**.

## O que o painel mostra

**2º turno (painel principal)**
- **Frente a frente:** os dois candidatos com a projeção final ± margem de erro (IC 95%), o apurado, os votos, o resultado
  de cada um no 1º turno e a **chance de vitória**.
- **Barra da disputa:** apurado de cada lado, marcador da projeção, faixa da margem de erro e a linha de 50%.
- **Vantagem projetada** em pontos e em votos, **votos válidos ainda por apurar**, **quanto falta para virar** (fração
  dos restantes de que quem está atrás precisa, comparada com a que o modelo projeta) e **comparecimento projetado**.
- **Distribuição** dos 4.000 cenários simulados e **cenários** com probabilidades.
- **Evolução** da apuração (parcial × projeção) e das probabilidades ao longo da noite.
- **Definição matemática:** o resultado não muda nem se todo o eleitorado restante votar no adversário.
- **Mapa** por estado e por município (os ainda sem votos aparecem hachurados com o líder projetado) e tabela de municípios.
- **Comparação com o 1º turno** nos mesmos municípios e na mesma proporção já apurada.

No 1º turno, o painel principal mostra todos os candidatos, a chance de haver 2º turno, o confronto mais provável e quanto o
líder precisa para vencer direto.

**Abas**
- **Insights:** a cada 10% de seções apuradas, uma análise automática do que mudou em relação ao 1º turno (ou a 2022, no
  1º turno), sempre nos mesmos municípios e na mesma proporção já apurada. Exemplo: "Rio Grande do Sul: PL com +12% de
  votos em relação ao 1º turno". A análise cobre:
  - variação nacional, por região, por estado e nas cidades grandes;
  - viradas (estado em que o vencedor provável muda);
  - comparecimento e brancos e nulos;
  - candidatos novos;
  - distorção do parcial e estabilidade da projeção.

  A aba se atualiza sozinha quando sai uma análise nova, e as anteriores ficam no histórico.
- **Estados** e **Regiões:** apurado, projeção com margem de erro, líder provável e variação em relação à eleição anterior.
- **Municípios**, **Como funciona o modelo** (com diagnóstico ao vivo) e **Validação** (no modo simulação).

**Painel do estado:** ao clicar num estado no mapa, o mapa mostra os municípios dele e abre um painel com o eleitorado, o
andamento, o apurado e a projeção para Presidente naquele estado, a chance de cada candidato vencer ali e a comparação com o
1º turno.

**Simulação 2022** (só ao rodar localmente; o servidor público não a oferece): reapresenta a noite do 2º turno de 2022 (30/10) usando o 1º turno de 2022 como base, para demonstrar o
modelo e medir a precisão contra o resultado real. Com `TURNO_SIMULACAO=1`, reapresenta o 1º turno (2/10) com 2018 e 2014.

## Como rodar

Requisitos: **Node.js 23.6 ou superior**. O servidor roda TypeScript direto, sem etapa de compilação. Foi testado no Node 25.

```bash
npm install
npm start
```

Abra http://localhost:8787. Na primeira execução, a base histórica é baixada e preparada automaticamente (Portal de Dados
Abertos do TSE e IBGE, em poucos segundos).

Para desenvolvimento, com recarga automática, use `npm run dev` e acesse http://localhost:5173.

| Comando | O que faz |
|---|---|
| `npm start` | Compila a interface e sobe o servidor (porta 8787) |
| `npm run dev` | Servidor com recarga automática e interface no Vite (porta 5173) |
| `npm run dados` | Baixa e prepara de novo a base histórica (1º e 2º turnos de 2014, 2018, 2022 e 1º turno de 2026) |
| `npm run testar` | Backtest do 2º turno: 2º turno de 2022 com o 1º turno de 2022 como base |
| `npm run testar -- 1t` | Backtest do 1º turno: 2022 com histórico de 2018 e 2014 (combina com os modos abaixo) |
| `npm run testar -- ordem` | Testes de estresse da ordem da apuração (Nordeste por último / primeiro) |
| `npm run testar -- calibrar` | Calibração da escala da margem de erro do 2º turno |
| `npm run testar -- grade` | Busca de hiperparâmetros do 1º turno |
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

O estado da apuração é salvo em `data/cache/` a cada 15 segundos. Ao religar, o servidor restaura o histórico e busca no TSE
o que faltar.

### Produção: servidor no Coolify (Docker) e interface na Vercel

O servidor precisa ficar ligado o tempo todo (consulta o TSE, guarda o estado, roda o modelo e mantém os eventos
abertos), por isso vai num host Docker. A interface é estática e pode ir para a Vercel.

**Servidor (Coolify):**
1. Nova aplicação a partir deste repositório, com build pack **Dockerfile** e porta **8787**.
2. Volume persistente montado em **`/app/data`** (base histórica, fotos e estado da apuração).
3. Um domínio com HTTPS, por exemplo `https://api.seudominio.com`.
4. Variáveis opcionais: `CORS_ORIGEM=https://seu-projeto.vercel.app` (o padrão `*` libera qualquer origem) e
   `THREADS`. O `MODO_PUBLICO=1` já vem no Dockerfile: a simulação de 2022 sai da interface e a API não aceita comandos para ela.

Na primeira subida o servidor baixa e prepara a base histórica (cerca de 15 s) antes de abrir a porta. Em teste local
com o container limitado a 2 CPUs e 1,5 GB de RAM, 50 usuários simultâneos (eventos + estado + mapa a cada 3 s) tiveram
p95 de 33 ms, nenhum erro e 365 MB de memória.

**Interface (Vercel):** importe o repositório (o `vercel.json` já define o build) e crie a variável
`VITE_API_URL=https://api.seudominio.com`. Ela é lida no build, então mudar o endereço exige um novo deploy.

O próprio servidor também serve a interface completa no seu domínio. A Vercel é opcional.

### Configuração (variáveis de ambiente)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORTA` | `8787` | Porta do servidor |
| `INTERVALO_COLETA_MS` | `10000` | Intervalo entre consultas ao TSE |
| `CONCORRENCIA` | `8` | Requisições simultâneas ao TSE |
| `SIMULACOES` | `4000` | Cenários de Monte Carlo por projeção |
| `THREADS` | `4` | Threads do modelo ao vivo (a simulação usa outras 2) |
| `TURNO_SIMULACAO` | `2` | Turno de 2022 reapresentado no modo simulação |
| `MODO_PUBLICO` | — | `1` em produção: sem a simulação de 2022 na interface (o Dockerfile já define) |
| `CORS_ORIGEM` | `*` | Origens que podem chamar a API de outro domínio, separadas por vírgula |
| `VITE_API_URL` | — | (build da interface) endereço do servidor quando a interface está em outro domínio |

## Como funciona

```
 resultados.tse.jus.br ──► coletor incremental ──► estado da eleição ──► modelo (4 threads) ──► API + eventos (SSE) ──► painel
   (JSON / JWS)             só baixa o que mudou     por município         ajuste + Monte Carlo     atualização automática
                                                          ▲
 Portal de Dados Abertos ──► base histórica 2014–2026 ┘  (variáveis por município, regiões do IBGE)
```

### Atualização automática

- O servidor consulta o TSE a cada 10 s. Ele lê primeiro o andamento por estado e por município (sempre sem cache) e só
  baixa o resultado de um município quando ele mudou.
- Quando algo muda, a projeção é recalculada e o navegador é avisado na hora (Server-Sent Events). A tela se atualiza sozinha
  e mostra, numa barra fixa, a **data e hora da última atualização do TSE**, quando a projeção foi recalculada e a contagem
  até a próxima consulta.
  No celular, essa barra dá lugar a uma versão compacta: a porcentagem de seções totalizadas, a hora do TSE e os avisos
  de conexão.
- **Proteções:**
  - o TSE publica cada arquivo também numa versão assinada (`.jws`); o coletor confere qual das duas está mais recente e
    usa a assinada se ela estiver à frente;
  - se o arquivo de um município vier atrás do andamento (cópia velha na CDN), o coletor pede outra sem cache e nunca
    aceita um número menor de seções do que já tinha;
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
   apurados a variáveis históricas de cada município:
   - **2º turno:** votação dos 6 primeiros do 1º turno de 2026 (com termos quadráticos), comparecimento e brancos e nulos
     do 1º turno e votação do 2º turno de 2022. Os coeficientes dos candidatos eliminados funcionam como **taxas de
     transferência aprendidas ao vivo**: se os eleitores de Cury, Renan ou Caiado estiverem indo mais para um lado, o
     modelo enxerga isso nos municípios onde eles foram fortes;
   - **1º turno:** votação de 2022 (com termos quadráticos) e 2º turno de 2022, comparecimento e brancos e nulos de 2022,
     votação e 2º turno de 2018;
   - porte do município e capital.

   **Priori de swing logístico:** quem já disputou (o mesmo candidato ou o mesmo partido) começa com a mesma geografia de
   antes, ajustada à força atual (no 2º turno, Lula ≈ Lula do 1º turno; no 1º, PL 2026 ≈ Bolsonaro 2022).
3. **Efeitos regionais aninhados** (macrorregião → UF → região intermediária do IBGE), estimados por DerSimonian–Laird e
   encolhidos (empirical Bayes). Dois choques correlacionados entram na margem de erro:
   - um comum ao eleitorado ainda não apurado;
   - outro comum às regiões ainda sem nenhum voto, para o caso de uma região (ex.: o Nordeste) atrasar e votar diferente.
4. **Combinação com o parcial.** Em cada município parcialmente apurado, previsão e parcial são combinados pela precisão de
   cada um (atualização normal–normal), com s² = p(1−p)(1−f)(1/n + δ²).
5. **Monte Carlo em paralelo:** 4.000 cenários por atualização, divididos entre threads. Cada cenário sorteia
   coeficientes, efeitos regionais, ruído municipal e choques de comparecimento. Candidatos com menos de 1% são projetados em
   grupo e divididos na proporção apurada.

No 2º turno a base é muito mais próxima (o mesmo eleitorado votou três semanas antes), então os choques regionais da
margem de erro são reduzidos para 30% dos do 1º turno. Essa escala foi calibrada no backtest abaixo
(`npm run testar -- calibrar`).

### Precisão no 2º turno (backtest: 2º turno de 2022 com o 1º turno de 2022 como base)

| Seções apuradas | Parcial (Lula × Bolsonaro) | Projeção de Lula ± margem de erro (95%) |
|---|---|---|
| 0,7% | 39,0% × 61,0% | 50,0% ± 1,7 |
| 4% | 41,3% × 58,7% | 50,8% ± 1,0 |
| 24% | 43,4% × 56,6% | 50,9% ± 0,7 |
| 44% | 47,7% × 52,3% | 51,0% ± 0,6 |
| 64% | 50,4% × 49,6% | 50,9% ± 0,4 |
| **Final real** | **50,9% × 49,1%** | |

- Erro médio com menos de 30% apurado: **0,3 ponto**. Com 4% das seções, o parcial mostrava Bolsonaro com 17 pontos de
  vantagem; a projeção já apontava Lula com 50,8%.
- O intervalo de 95% cobriu o resultado real em todos os pontos.
- **Ordem da apuração:** com o Nordeste por último (64% do país apurado, parcial de Bolsonaro com 56,3%), a projeção foi
  50,9% ± 0,6 para Lula; com o Nordeste primeiro (parcial de Lula perto de 70%), ficou entre 50,5% e 51,6%, sempre
  cobrindo o real.

### Precisão no 1º turno (backtest: apuração de 2022 com histórico de 2018 e 2014)

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

**Testado e descartado.**
- O crescimento do eleitorado como variável de preferência (`npm run testar -- crescimento`) ficou neutro na média (erro de
  1,20 → 1,22 ponto), por isso está desligado (`usarCrescimento` em `server/corrida.ts`). Ele continua valendo no peso de
  cada município.
- Um painel de "para onde foram os votos do 1º turno" por regressão ecológica (Goodman, também com efeitos fixos por
  estado) não passou no teste com 2022: atribuía aos eleitores de Tebet uma ida a Lula bem abaixo da medida pelas
  pesquisas, e taxas impossíveis aos finalistas. A transferência continua sendo aprendida dentro do modelo, mas não é
  exibida como número.

## Fontes de dados

| Fonte | Uso |
|---|---|
| `resultados.tse.jus.br/oficial` | Ao vivo: `<uf>[<município>]-c<cargo>-e<eleição>-u.json` (totais e candidatos), `<uf>-e<eleição>-ab.json` (andamento), fotos dos candidatos e versões assinadas `.jws` |
| Portal de Dados Abertos do TSE | Votação para presidente por município (1º e 2º turnos de 2014, 2018 e 2022 e 1º turno de 2026), lida em partes direto do `.zip` (HTTP Range) |
| IBGE | Malhas municipais e regiões geográficas intermediárias |

A pasta `data/` (base histórica, malhas, estado salvo e fotos em cache) não é versionada: ela é recriada na primeira
execução.

## Estrutura

```
server/
  index.ts             servidor HTTP: API, eventos (SSE), fotos, persistência, arquivos estáticos
  config.ts            parâmetros e constantes
  corrida.ts           estado de cada eleição (apuração, projeção, histórico, resumos por UF/região)
  insights.ts          análises automáticas a cada 10% apurado
  tse/                 cliente HTTP (JSON/JWS, cache), leitura dos arquivos do TSE, coletor incremental
  modelo/              projeção (ajuste + Monte Carlo + consolidação), variáveis históricas, threads, backtest
  simulacao/           reapresentação da apuração de 2022 (1º ou 2º turno)
  dados/               preparação da base histórica (zip remoto via HTTP Range)
shared/                tipos e regras compartilhados (cores, "chamada" do resultado)
web/                   interface em React (Vite), sem bibliotecas de gráficos: SVG + d3-geo para os mapas
scripts/supervisor.sh  mantém o servidor no ar durante a apuração
```

## Limitações

- A projeção usa apenas votos apurados e eleições passadas, nunca pesquisas. Nos primeiros minutos a incerteza é grande, e
  a margem de erro mostra isso.
- Candidatos sem equivalente em 2022 ou 2018 dependem só do padrão dos municípios já apurados.
- A calibração do 2º turno vem de um único 2º turno (2022). Se 2026 tiver um padrão de transferência muito diferente entre
  regiões, a margem pode ficar estreita nos primeiros minutos.
- Os arquivos de divulgação do TSE não têm documentação oficial nem garantia de formato. Se a estrutura mudar, o parser
  (`server/tse/parse.ts`) é o ponto a ajustar.

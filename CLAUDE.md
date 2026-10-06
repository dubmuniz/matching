# Fioconecta · Matching de Oportunidades — regras permanentes

Especificação completa: `BRIEFING_Fioconecta_Matching.md`. Em caso de dúvida, o briefing prevalece.
Idioma do projeto: português do Brasil (código, comentários, mensagens de commit, textos da interface).

## Arquitetura (seção 3)
- Frontend: HTML, CSS e JS puros em `docs/` (GitHub Pages, branch `main`, pasta `/docs`). Sem framework, sem build, **sem segredos**. Ao alterar `styles.css`, `app.js`, `config.js` ou imagens, incremente o `?v=N` das referências em `index.html` (o Pages guarda cache por até 10 min). `docs/config.js` contém só a URL do web app e a site key pública do Turnstile.
- Backend: projeto Google Apps Script **standalone** em `apps-script/`. Acessa a planilha só por `SpreadsheetApp.openById(SPREADSHEET_ID)`.
- IA: `https://api.anthropic.com/v1/messages`, modelo `claude-sonnet-5` (configurável em `Config.gs`), `anthropic-version: 2023-06-01`, uma única chamada por demanda. **Não enviar `temperature`**: o Sonnet 5 rejeita parâmetros de amostragem (HTTP 400). A resposta pode trazer blocos `thinking`; ler só os blocos `text`. Raciocínio adaptativo com `output_config.effort` (padrão `low`, propriedade `ESFORCO_CLAUDE`), `max_tokens` 16000 (propriedade `MAX_TOKENS_CLAUDE`; inclui o raciocínio) e saída estruturada (`output_config.format` com `SCHEMA_RESPOSTA_MATCHING`), sem dispensar a validação em `validarRespostaMatching()`. Sem embeddings. Pré-seleção por termos só se houver mais de 40 candidatos.
- Frontend → backend: `POST` com `Content-Type: text/plain;charset=utf-8` e corpo JSON. Resposta via `ContentService` + `MimeType.JSON`.

## Script existente
- `referencia/codigo-apps-script-existente.gs` é **somente leitura**. Nunca modificar.
- Funções do projeto novo não podem ter nomes iguais aos do script existente.
- Colunas novas na planilha ficam sempre à direita das existentes (depois de `Website` e de `Link do resumo executivo`).

## Planilha e dados (seção 4.4)
- Localizar colunas **pelo nome do cabeçalho**, nunca pela posição. Tolerar a ausência das colunas novas (`ID`, `Ativo no matching`, `Status de integridade`, `Via de governança`) usando os valores padrão.
- Aba de editais: `Oportunidades` (configurável). A aba `Portfólio` **nunca** é lida.
- `Prazo` mistura datas nativas, `DD/MM/AAAA` em texto, textos livres e vazios. Classificação só em código (`classificarPrazo`, função pura, fuso `America/Sao_Paulo`).
- `Valores`: texto livre em várias moedas. Nunca converter nem calcular; exibir como está.
- Ignorar linhas sem `Nome do edital` e sem `Nome do parceiro`.
- Financiador `Vedado`: nunca vai para a IA nem aparece em card.
- Datas, valores e links vêm sempre da planilha, nunca da IA.

## Segurança e privacidade (seção 10)
- Segredos e configurações (`ANTHROPIC_API_KEY`, `SPREADSHEET_ID`, `ESCRITORIO_EMAIL`, `DOMINIOS_COPIA`, `TURNSTILE_SECRET`, `MIN_DIAS_PRAZO`, `SEGREDO_PASSE`, `DOMINIOS_LOGIN` etc.) ficam **só** em Propriedades do script. Nada disso vai para o repositório; `configurarPropriedades()` usa `COLE_AQUI`.
- Colunas INTERNAS nunca saem do servidor: `Ponto focal no time do Escritório`, `Pesquisador parceiro`, `Email de contato`, `Valor enviado`, `Valor captado`, `Link do resumo executivo`, `Contato/ Cargo`, `Endereço de contato`.
- Nome e e-mail do pesquisador nunca vão para a IA.
- Texto do usuário vai delimitado em `<demanda>`. A saída da IA é validada contra os IDs e organizações enviados, notas limitadas a 0–100 e textos cortados em 400 caracteres.
- Validação no navegador **e** no servidor (o servidor é a autoridade). Rejeitar campos desconhecidos. Corpo máximo de 20 KB.
- Anti-abuso: honeypot; Turnstile (desligável por propriedade durante o protótipo); limite de taxa com `LockService` (5 envios por e-mail a cada 24 h — decisão do Bruno de 06/10/2026, acima dos 3 do briefing; e-mails em `EMAILS_SEM_LIMITE` só têm o limite global; guardados em Propriedades do usuário com a chave = hash SHA-256 do e-mail, porque o `CacheService` só guarda por até 6 h; 30 globais por hora no `CacheService`).
- Texto do usuário gravado na planilha passa por `protegerCelula()` (evita injeção de fórmulas).
- Cópia por e-mail ao pesquisador só se o domínio estiver em `DOMINIOS_COPIA` (correspondência exata do domínio).
- Frontend: texto do servidor só com `textContent`, nunca `innerHTML`. Links só com `http(s)`, `target="_blank"` e `rel="noopener noreferrer"`.
- Todo texto do usuário ou da IA é escapado no e-mail HTML.
- Erros: mensagem genérica em português para o usuário; detalhes só em `console.error`. Nunca devolver stack trace.
- Falhas de e-mail ou de gravação não impedem a resposta ao usuário.

## Prompt
- Prompt em `apps-script/Prompt.gs` com `PROMPT_VERSAO`. Mudou o texto, incrementa a versão.
- Decisão do Bruno (05/10/2026, `matching-v2`), que prevalece sobre a seção 6.1 do briefing: `lacunas_da_demanda` aparece como **"Para fortalecer sua candidatura"** — até 4 ações práticas no imperativo, sem dizer que algo "falta" e sem pedir o que o formulário não pergunta; quando a dica depende de um campo do formulário, cita o campo pelo nome exato.
- `matching-v3` (06/10/2026): `carater_estrategico` {estrategico, justificativa} no schema. É avaliação interna: nunca vai para a página. `avaliarPrioridade()` (Registro.gs): prioritária se `valorEstimado` = "Acima de R$ 5 milhões" e/ou `estrategico === true` → assunto "PRIORITÁRIA", quadro de destaque e cópia para `EMAILS_PRIORIDADE` no e-mail ao Escritório, aviso de contato (sem motivos) na cópia ao pesquisador, coluna `Prioridade` em Demandas.

## Fase 2A: leitura de arquivo (`apps-script/Extracao.gs`)
- `doPost` com `acao: "extrair"`: PDF vai ao Claude como documento base64; DOCX/TXT chegam como texto (o DOCX é lido no navegador, sem biblioteca externa). Corpo até 15 MB só nessa ação; arquivo até 10 MB.
- Exige autorização própria (`consentimentoArquivo`) e e-mail válido; cota própria (8 por e-mail/24 h, 30/h). Nada do arquivo é gravado; nome e e-mail nunca são extraídos.
- A resposta só **pré-preenche campos vazios**; o pesquisador revisa. `PROMPT_EXTRACAO_VERSAO` segue a mesma regra de versão.
- Arquivos `.gs` não podem usar, no nível de topo, constantes de outros arquivos (a ordem de carga do Apps Script não é garantida): monte esses valores dentro de funções.

## Fase 2B: rascunho de proposta em XLSX (`apps-script/Proposta.gs`, `docs/proposta.js`, `docs/xlsx.js`)
- Botão nos cards de oportunidade. O navegador faz 2 requisições `acao: "proposta"` (parte 1: ficha + marco lógico; parte 2: orçamento + Gantt) e monta o XLSX localmente com `docs/xlsx.js` (gerador próprio, sem biblioteca externa). Nada é gravado no servidor.
- O edital é relido da planilha pelo ID (só ativos e não vedados); duração por `duracaoEmMeses()` (padrão de 24 meses, com aviso, quando o edital não informa). A demanda é validada de novo; nome e e-mail não vão para a IA (entram só no arquivo gerado no navegador).
- Orçamento: moeda do edital, por ano, rubricas do edital ou modelo padrão; valores são ESTIMATIVAS da IA, sempre marcados como rascunho; totais por fórmula. Texto entra como inline string (nunca fórmula).
- Cotas: 8 por e-mail/24 h e 20/h, para cada parte. `PROMPT_PROPOSTA_VERSAO` segue a regra de versão.

## Fase 3: login, lista de oportunidades e avaliação de um edital (`apps-script/Acesso.gs`, `apps-script/Catalogo.gs`)
- Login por código: `acao: "codigo"` envia 6 dígitos ao e-mail (10 min, 5 tentativas; guardado só como hash no `CacheService`); `acao: "entrar"` devolve o passe `email|validade|HMAC-SHA256` (30 dias; segredo `SEGREDO_PASSE`, criado sozinho). `LOGIN_ATIVO` (padrão ligado), `DOMINIOS_LOGIN` (domínio exato ou e-mail completo; padrão `fiocruz.br`), `EMAILS_BLOQUEADOS`.
- Com login, toda ação (menos `codigo` e `entrar`) exige o passe, e o e-mail que vale é o do passe (`aplicarEmailDaSessao_`). O passe sai dos dados antes da validação.
- Aba `Acessos` (Data/hora, E-mail, Evento, Detalhe): logins, recusas e cada uso. O código nunca é gravado. Retenção `RETENCAO_ACESSOS_MESES` (padrão 12), limpeza automática após login (no máximo a cada 6 h) e por `limparAcessosAntigos()`. Turnstile e limite de taxa vêm antes de qualquer gravação.
- Lista (`acao: "oportunidades"`): só candidatos (ativos e não vedados), só colunas públicas, 10 min em cache. Nada passa pela IA.
- Avaliação de um edital: matching com `idOportunidade`; só esse edital vai para a IA (sem financiadores), com `PROMPT_AVALIACAO_INDIVIDUAL` (`PROMPT_VERSAO_INDIVIDUAL`, mesma regra de versão); o card aparece qualquer que seja a nota. Cota própria (15 por e-mail/24 h, 30/h). Grava em Demandas (coluna `Edital avaliado`, criada à direita) e avisa o Escritório, sem cópia ao pesquisador.
- Página: telas por endereço (`#oportunidades`, `#avaliar`, `#avaliar/<ID>`), passe e última lista no `localStorage` (apagados em *Sair*). A resposta de `entrar` já traz a lista; `entrar` repetido com o mesmo código em até 3 min devolve o mesmo passe. Só `oportunidades` e `entrar` são repetidos às cegas após falha de comunicação. Matching, extração e proposta levam `idPedido` (UUID gerado pela página, só se o servidor anunciar `recursos.idPedido`): o servidor guarda a resposta por 10 min sob o hash de ação + e-mail do passe + idPedido (ou responde `pendente` enquanto processa), e a página repete o mesmo pedido por até 5 min sem nova chamada à IA. Implantar o Apps Script antes de publicar a página.
- Planilha: cada aba é lida de uma vez (`getDisplayValues` do intervalo todo), mais uma leitura por coluna de data ou de link.

## Testes e fluxo
- Funções puras (`Prazo.gs`, `Preselecao.gs`) rodam no Apps Script e no Node (`if (typeof module !== 'undefined') module.exports = {...}`). Testes: `node --test` (descobre `tests/*.test.js`). `tests/apps-script.test.js` carrega todos os `.gs` com serviços simulados e confere colisão de nomes com o script existente.
- Construção por etapas (seção 12), com revisão do Bruno ao fim de cada uma. Commit em português ao fim de cada etapa, direto na `main`.
- Ao fim de cada etapa, rodar `/security-review` e corrigir os achados relevantes.

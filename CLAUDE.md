# Fioconecta · Matching de Oportunidades — regras permanentes

Especificação completa: `BRIEFING_Fioconecta_Matching.md`. Em caso de dúvida, o briefing prevalece.
Idioma do projeto: português do Brasil (código, comentários, mensagens de commit, textos da interface).

## Arquitetura (seção 3)
- Frontend: HTML, CSS e JS puros em `docs/` (GitHub Pages, branch `main`, pasta `/docs`). Sem framework, sem build, **sem segredos**. `docs/config.js` contém só a URL do web app e a site key pública do Turnstile.
- Backend: projeto Google Apps Script **standalone** em `apps-script/`. Acessa a planilha só por `SpreadsheetApp.openById(SPREADSHEET_ID)`.
- IA: `https://api.anthropic.com/v1/messages`, modelo `claude-sonnet-5` (configurável em `Config.gs`), `anthropic-version: 2023-06-01`, temperatura 0.2, uma única chamada por demanda. Sem embeddings. Pré-seleção por termos só se houver mais de 40 candidatos.
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
- Segredos e configurações (`ANTHROPIC_API_KEY`, `SPREADSHEET_ID`, `ESCRITORIO_EMAIL`, `DOMINIOS_COPIA`, `TURNSTILE_SECRET`, `MIN_DIAS_PRAZO` etc.) ficam **só** em Propriedades do script. Nada disso vai para o repositório; `configurarPropriedades()` usa `COLE_AQUI`.
- Colunas INTERNAS nunca saem do servidor: `Ponto focal no time do Escritório`, `Pesquisador parceiro`, `Email de contato`, `Valor enviado`, `Valor captado`, `Link do resumo executivo`, `Contato/ Cargo`, `Endereço de contato`.
- Nome e e-mail do pesquisador nunca vão para a IA.
- Texto do usuário vai delimitado em `<demanda>`. A saída da IA é validada contra os IDs e organizações enviados, notas limitadas a 0–100 e textos cortados em 400 caracteres.
- Validação no navegador **e** no servidor (o servidor é a autoridade). Rejeitar campos desconhecidos. Corpo máximo de 20 KB.
- Anti-abuso: honeypot; Turnstile (desligável por propriedade durante o protótipo); limite de taxa com `CacheService` + `LockService` (3 envios por e-mail a cada 24 h, 30 globais por hora).
- Cópia por e-mail ao pesquisador só se o domínio estiver em `DOMINIOS_COPIA` (correspondência exata do domínio).
- Frontend: texto do servidor só com `textContent`, nunca `innerHTML`. Links só com `http(s)`, `target="_blank"` e `rel="noopener noreferrer"`.
- Todo texto do usuário ou da IA é escapado no e-mail HTML.
- Erros: mensagem genérica em português para o usuário; detalhes só em `console.error`. Nunca devolver stack trace.
- Falhas de e-mail ou de gravação não impedem a resposta ao usuário.

## Prompt
- Prompt em `apps-script/Prompt.gs` com `PROMPT_VERSAO`. Mudou o texto, incrementa a versão.

## Testes e fluxo
- Funções puras (`Prazo.gs`, `Preselecao.gs`) rodam no Apps Script e no Node (`if (typeof module !== 'undefined') module.exports = {...}`). Testes: `node --test tests/`.
- Construção por etapas (seção 12), com revisão do Bruno ao fim de cada uma. Commit em português ao fim de cada etapa, direto na `main`.
- Ao fim de cada etapa, rodar `/security-review` e corrigir os achados relevantes.

# Checklist de segurança e privacidade (seção 10 do briefing)

Revisão da etapa 6, feita em 02/10/2026, sobre o código da `main`.
Legenda: ✅ atendido · ⚠️ atendido com risco residual ou com ação pendente da equipe.

| # | Item | Situação | Onde / como |
|---|---|---|---|
| 1 | Segredos só em Propriedades do script | ✅ | `Config.gs`. `configurarPropriedades()` usa `COLE_AQUI` e ignora esse valor; `verificarPropriedades()` mostra só o tamanho da chave. Nenhum segredo no repositório. |
| 2 | Frontend sem segredos | ✅ | `docs/config.js` tem só `webAppUrl` e `turnstileSiteKey` (teste `frontend.test.js` garante). |
| 3 | Publicação: "Executar como: eu", "Qualquer pessoa"; `doGet` → `{ok:true}` | ✅ | `appsscript.json` (`USER_DEPLOYING`, `ANYONE_ANONYMOUS`), `Codigo.gs`. |
| 4 | CORS sem preflight; resposta via `ContentService` JSON | ✅ | `app.js` envia `text/plain`; `respostaJson_()`. |
| 5a | Honeypot | ✅ | campo `site`, fora da tela; `honeypotPreenchido()`. |
| 5b | Turnstile validado no servidor, desligável | ⚠️ | Implementado (`verificarTurnstile_`, falha fechada se ativo sem segredo). **Está desligado** no protótipo: ativar antes da divulgação (README, seção 9). |
| 5c | Limite de taxa (3/e-mail/24 h; 30/h global) | ✅ | `verificarLimiteDeTaxa_()` com `LockService`; e-mail guardado só como hash SHA-256. Registra antes da chamada à IA. |
| 5d | Corpo até 20 KB | ✅ | `processarEnvio_()` confere caracteres e bytes. |
| 6 | Validação de tudo no servidor; campos desconhecidos rejeitados | ✅ | `validarDemanda()` (tipos, tamanhos, listas fechadas). O navegador usa as mesmas regras (teste de paridade). |
| 7a | Resposta só com os campos dos cards | ✅ | `montarResultado()`; teste verifica ausência de colunas internas e de `linha`. |
| 7b | Colunas INTERNAS nunca saem do servidor | ✅ | `Planilha.gs` nem lê essas colunas; testes procuram valores internos na resposta, no prompt e na planilha simulada. |
| 7c | Nome e e-mail fora da IA | ✅ | `demandaParaIA()` (lista de campos permitidos); teste confere. |
| 8 | XSS: só `textContent`; links só http(s) | ✅ | `app.js` sem `innerHTML` (teste), `linkSeguro()` com `new URL`, `rel="noopener noreferrer"`. CSP em `<meta>` restringe scripts, conexões e frames. |
| 9 | Prompt injection | ✅ | Demanda dentro de `<demanda>` com `<`/`>` escapados; saída validada contra ids e nomes enviados; notas e textos limitados; prazos, valores e links vêm da planilha. |
| 10 | Erros: mensagem genérica, detalhes só no log | ✅ | Mensagens fixas em `MENSAGENS_ERRO`; `registrarErro_()` guarda detalhes (sem dados do formulário) para `verUltimosErros()`; usuário vê só o código `ref.`. |
| 11 | Consentimento | ✅ | Texto exato do briefing, obrigatório no navegador e no servidor. |
| 12 | Teto de gasto | ⚠️ | Documentado no README (seções 1 e 9). **Configurar na Console da Anthropic.** |
| — | Injeção de fórmulas na planilha | ✅ | `protegerCelula()` em toda a linha da aba Demandas. |
| — | E-mail HTML | ✅ | `escaparHtml()` em todo texto de usuário/IA; assunto sem quebras de linha; link da planilha só no e-mail do Escritório; cópia só para domínio exato de `DOMINIOS_COPIA`. |

## Riscos residuais (aceitos no protótipo)

1. **Abuso com o Turnstile desligado:** um robô pode fazer até 30 envios por hora, trocando o e-mail a cada envio.
   - **Custo:** no máximo ~US$ 4 por hora em chamadas à IA.
   - **E-mails:** até 60 por hora. Isso consome a cota diária do Gmail (~100) e pode atrasar os avisos legítimos ao Escritório.
   - **Mensagens com texto do atacante:** algumas cópias podem ir para endereços `@fiocruz.br` escolhidos por ele (até 3 por endereço por dia), com o título e o nome escritos por ele.
   - **Mitigação:** ativar o Turnstile e o limite de gasto antes da divulgação ampla.
2. **Conta pessoal:** hoje a planilha, o projeto e os e-mails estão em `bmuniz@gmail.com`. A migração para a conta institucional está descrita no README (seção 9).
3. **Dados do pesquisador na planilha:** a aba *Demandas* guarda nome e e-mail. O acesso à planilha deve ficar restrito à equipe do Escritório.

## Revisão de código (etapa 6)

- **Achado corrigido:** `registrarErro_()` podia ultrapassar o limite de 9 KB de uma propriedade, e aí os erros deixariam de ser guardados sem nenhum aviso. Agora o código descarta os erros mais antigos até a lista caber, com a conta feita em bytes. Há um teste para isso.
- **Nenhum achado alto ou médio no código.** Os itens ⚠️ dependem de configuração pela equipe, não de código.

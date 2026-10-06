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

## Fase 2A: leitura de arquivo (02/10/2026)

| Item | Situação | Onde / como |
|---|---|---|
| Autorização específica para enviar o arquivo à IA (inclusive dados pessoais) | ✅ | `consentimentoArquivo`, obrigatório no navegador e no servidor. |
| Nome e e-mail não extraídos; nada do arquivo gravado | ✅ | `normalizarCamposExtraidos()` só devolve campos do projeto; `processarExtracao_()` não grava nem envia e-mail. O e-mail do pesquisador não vai à IA (teste). |
| Prompt injection pelo arquivo | ✅ | Prompt manda tratar o documento como dado; texto de DOCX/TXT delimitado em `<documento>` com `<`/`>` trocados; saída validada (listas fechadas, tamanhos). Só pré-preenche: o pesquisador revisa. |
| Abuso / custo | ✅ | Cota própria (5 por e-mail/24 h, 30/h), honeypot e Turnstile; arquivo até 10 MB, corpo até 15 MB só nessa ação; PDF conferido pela assinatura `%PDF`. |
| XSS | ✅ | Sugestões entram nos campos por `.value` e as observações por `textContent`. |

## Fase 2B: rascunho de proposta em XLSX (02/10/2026)

| Item | Situação | Onde / como |
|---|---|---|
| Fatos do edital vindos da planilha | ✅ | O servidor relê o edital pelo ID entre os candidatos (ativos e não vedados); o navegador não envia dados do edital. |
| Demanda validada de novo no servidor | ✅ | `validarDemanda()`; campos desconhecidos rejeitados. |
| Nome e e-mail fora da IA | ✅ | `demandaParaIA()`; teste confere. Eles aparecem só no XLSX montado no próprio navegador do pesquisador. |
| Prompt injection | ✅ | Demanda, edital e outputs (vindos do navegador na parte 2) entre tags, com `<`/`>` escapados; saída normalizada (níveis, limites de tamanho e quantidade, meses dentro da duração, números ≥ 0). |
| Injeção de fórmulas no XLSX | ✅ | Todo texto é gravado como inline string (teste com texto iniciado por `=`); só os totais do orçamento são fórmulas, geradas pelo código. |
| Valores do orçamento | ⚠️ | São estimativas da IA. Sempre marcados como "rascunho estimado por IA" na página e na planilha; total limitado no prompt ao teto do edital, sem verificação automática (o campo Valores é texto livre). |
| Abuso / custo | ✅ | Cotas de 5 por e-mail/24 h e 20/h para cada parte; honeypot e Turnstile. Pior caso com Turnstile desligado: ~US$ 6/h. |
| Nada gravado | ✅ | `processarProposta_()` não grava na planilha nem envia e-mail. |

## Fase 3: login, lista de oportunidades e avaliação de um edital (05/10/2026)

| Item | Situação | Onde / como |
|---|---|---|
| Só pessoas autorizadas usam a plataforma | ✅ | Com `LOGIN_ATIVO` (padrão ligado), toda ação exige passe válido; `DOMINIOS_LOGIN` com correspondência exata (subdomínios e `fiocruz.br.outro.com` recusados). Testes cobrem cada ação sem passe. |
| Passe impossível de forjar ou estender | ✅ | HMAC-SHA256 sobre e-mail e validade, segredo de 64 caracteres aleatórios em `SEGREDO_PASSE`; comparação em tempo constante; validade acima de 31 dias recusada. Testes com e-mail trocado, validade estendida e passe vencido. |
| Revogação | ✅ | `EMAILS_BLOQUEADOS` e `DOMINIOS_LOGIN` são conferidos a cada envio; apagar `SEGREDO_PASSE` desconecta todos. |
| Força bruta do código | ✅ | 6 dígitos, 10 minutos, 5 tentativas por código e 5 códigos por e-mail/24 h (no máximo 25 palpites por dia em 1 milhão). Trava (`LockService`) na conferência. |
| Código não fica guardado | ✅ | Só o hash (SHA-256 com o e-mail) no `CacheService`; apagado ao usar. Teste confere que o código não aparece no cache. |
| E-mail comprovado | ✅ | Com login, o e-mail do passe substitui o digitado (matching, leitura de arquivo e proposta); cotas por e-mail passam a valer de verdade. |
| Registro de acessos (LGPD) | ✅ | Aba *Acessos* com e-mail, data e evento; sem conteúdo do projeto e sem o código. Aviso na tela de entrada; apagado após 12 meses (`RETENCAO_ACESSOS_MESES`). Texto passa por `protegerCelula()`. |
| Gravação na planilha por quem não tem acesso | ✅ | Turnstile e limite de taxa (30 pedidos de código por hora no total) vêm antes de registrar a recusa. Teste com 35 e-mails de fora: 30 linhas. |
| Lista de oportunidades | ✅ | Só candidatos (ativos e não vedados) e só colunas públicas (teste procura textos das colunas internas). Com o login desligado, a lista fica pública. |
| Avaliação de um edital | ✅ | ID conferido no servidor entre os candidatos; só esse edital vai para a IA; e-mail e nome continuam fora (teste). Cota própria. |
| XSS / endereço da página | ✅ | Tudo por `textContent`; ID do endereço (`#avaliar/<ID>`) só vira texto e vai ao servidor, que valida; endereço malformado não quebra a página. |
| Passe roubado | ⚠️ | O passe fica no `localStorage` do navegador e vale até 30 dias; *Sair* apaga só a cópia local. Mitigação: CSP sem scripts de terceiros (exceto Turnstile), nada de `innerHTML`, e bloqueio por `EMAILS_BLOQUEADOS`. |
| Cota diária de e-mails | ⚠️ | Cada código gasta 1 e-mail. Sem Turnstile, alguém pode pedir 30 códigos por hora (para e-mails `@fiocruz.br` diferentes) e esgotar a cota da conta Gmail (~100/dia), travando logins e avisos ao Escritório naquele dia. Mitigação: Turnstile, conta institucional (cota maior). |

### Ajustes de velocidade (05/10/2026)

| Item | Situação | Onde / como |
|---|---|---|
| "Entrar" repetido | ✅ | A resposta fica guardada por 3 min sob o hash do e-mail, com o hash do código: só o código certo a recebe, o passe é conferido de novo, e palpites errados contam (5 apagam a resposta), para não haver palpites ilimitados depois de um login (achado da revisão de segurança, corrigido; teste). |
| Lista guardada no navegador | ✅ | Só colunas públicas; usada apenas pela mesma pessoa conectada (ou com login desligado); apagada em *Sair* e quando o servidor recusa o passe. |
| Repetição automática | ✅ | Lista e "entrar" são repetidos uma vez. Matching, extração e proposta só são repetidos com o mesmo idPedido, e o servidor devolve o resultado guardado: sem nova chamada à IA, sem cota gasta e sem demanda duplicada (teste). |
| Resultado guardado por idPedido | ✅ | Chave = hash(ação + e-mail do passe + idPedido); idPedido é UUID aleatório gerado no navegador (16–64 caracteres, validado). Com login, outra pessoa não recebe o resultado (teste). Guardado só 10 min no `CacheService`; erro inesperado libera o pedido. |

## Demandas prioritárias e limites (06/10/2026)

| Item | Situação | Onde / como |
|---|---|---|
| Avaliação estratégica da IA fica interna | ✅ | `carater_estrategico` não entra em `montarResultado()`: vai só para a planilha e o e-mail ao Escritório (teste confere que a resposta à página não a contém). A cópia ao pesquisador diz apenas que o Escritório fará contato. |
| Texto da IA no e-mail | ✅ | Motivos escapados (`escaparHtml`) e cortados em 400 caracteres; só `estrategico === true` explícito conta. |
| `EMAILS_SEM_LIMITE` | ⚠️ | Só em Propriedades do script. Com o login ligado, o e-mail é o do passe; com o login desligado, qualquer pessoa que digitar um desses e-mails escapa do limite por e-mail (o global de 30/h continua). Use só durante os testes. |

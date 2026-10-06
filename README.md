# Fioconecta · Matching de Oportunidades

Ferramenta do Escritório de Captação de Recursos da Presidência da Fiocruz. O pesquisador entra com o e-mail institucional (código enviado por e-mail) e vê a lista completa de editais da base mantida pelo Escritório numa planilha Google. Em cada edital, pode avaliar a aderência do seu projeto. Também pode comparar o projeto com toda a base de uma vez e gerar um rascunho de proposta. O projeto é descrito num formulário, ou a IA sugere o preenchimento a partir do documento do projeto. Toda nota vem com justificativa.

> **A IA apoia, não decide.** Toda nota vem com justificativa. Prazos, valores e links vêm sempre da planilha, nunca da IA.

- **Página publicada:** https://dubmuniz.github.io/matching/
- **Modo de teste, sem enviar nada:** https://dubmuniz.github.io/matching/?mock=1 (também há `?mock=vazio`, `?mock=erro` e `?mock=login`, que mostra a tela de entrada; o código de teste é `123456`). No modo de teste, a leitura de arquivo e o rascunho de proposta usam exemplos fixos, e o XLSX de exemplo pode ser baixado.
- **Especificação completa:** [`BRIEFING_Fioconecta_Matching.md`](BRIEFING_Fioconecta_Matching.md)

```
Página (GitHub Pages, pasta docs/)  ──POST──▶  Apps Script (app da web)  ──▶  Claude (API da Anthropic)
  entrar · lista de oportunidades   ◀─JSON──    login por código, valida,      avalia a aderência
  · formulário · cards                          lê a planilha, grava "Demandas"
                                                e "Acessos", envia e-mail
```

**Telas:** entrar (e-mail institucional + código de 6 números, válido por 30 dias no navegador) → **Oportunidades** (lista completa, com busca e filtro de prazo; cada edital tem o botão *Avaliar meu projeto para este edital*) → **Avaliar meu projeto** (formulário; com um edital escolhido, a IA avalia só esse edital; sem edital, compara com toda a base).

---

## Índice

1. [O que você precisa](#1-o-que-você-precisa)
2. [Preparar a planilha](#2-preparar-a-planilha)
3. [Criar o projeto no Apps Script](#3-criar-o-projeto-no-apps-script)
4. [Cadastrar as propriedades (configurações secretas)](#4-cadastrar-as-propriedades-configurações-secretas)
5. [Testar pelo editor](#5-testar-pelo-editor)
6. [Implantar como app da web](#6-implantar-como-app-da-web)
7. [Publicar a página no GitHub Pages](#7-publicar-a-página-no-github-pages)
8. [Atualizar depois de mudar o código](#8-atualizar-depois-de-mudar-o-código)
9. [Antes da divulgação ampla](#9-antes-da-divulgação-ampla)
10. [Solução de problemas](#10-solução-de-problemas)
11. [Custos e limites](#11-custos-e-limites)
12. [Caminho B: clasp (opcional)](#12-caminho-b-clasp-opcional)
13. [Para quem desenvolve](#13-para-quem-desenvolve)

---

## 1. O que você precisa

- A **conta Google dona da planilha** *Acompanhamento projetos (Internacional)*. Hoje é `bmuniz@gmail.com`. Os e-mails do sistema saem dessa conta.
- Uma **chave da API da Anthropic** (começa com `sk-ant-`).
  - **Recomendação:** use uma chave só para o matching, separada da chave do script de preenchimento. Assim você acompanha o custo à parte e pode revogar uma sem afetar a outra. Crie em https://console.anthropic.com → *API Keys*.
  - **Importante:** configure um **limite de gasto mensal** na Console da Anthropic (*Settings → Limits*). Esse limite protege contra surpresas se alguém abusar do formulário.
- Acesso de administrador ao repositório `dubmuniz/matching` no GitHub.

## 2. Preparar a planilha

O sistema **só lê** as abas *Oportunidades* e *Organizações*, e só as colunas necessárias. A aba *Portfólio* nunca é aberta. As colunas são localizadas pelo **nome do cabeçalho**, então você pode reordená-las sem quebrar nada.

1. **Colunas novas, sempre à direita das existentes** (o script antigo regrava as colunas A–K):

   | Aba | Coluna nova | Valores aceitos | Se estiver vazia |
   |---|---|---|---|
   | Oportunidades | `ID` | `OPP-0001`, `OPP-0002`… | o sistema usa um ID temporário |
   | Oportunidades | `Ativo no matching` | `Sim` / `Não` | conta como `Sim` |
   | Organizações | `Status de integridade` | `Permitido` / `Análise reforçada` / `Vedado` / `Não avaliado` | `Não avaliado` |
   | Organizações | `Via de governança` | `Captação direta` / `Orientação institucional` / `A definir` | `A definir` |

   Financiadores marcados como **`Vedado`** nunca são enviados à IA e nunca aparecem nos resultados.

2. **Localidade:** em *Arquivo → Configurações*, a localidade deve ser **Brasil**. Em outra localidade, datas digitadas como `01/03/2026` podem ser lidas como 3 de janeiro.
3. **Nomes iguais nas duas abas:** o nome em *Oportunidades → Nome do parceiro* deve corresponder ao nome em *Organizações → Organização*. O sistema ignora acentos, maiúsculas e palavras como "Fundação", "Foundation" e "The". Quando não há correspondência, o edital herda "Não avaliado". O `diagnosticoBase()` lista esses casos.
4. A aba **Demandas** é criada automaticamente no primeiro envio.

## 3. Criar o projeto no Apps Script

O projeto do matching é **separado** da planilha (*standalone*). O script antigo, vinculado à planilha, não é alterado.

1. Acesse https://script.google.com com a conta dona da planilha. Clique em **Novo projeto** e renomeie para **Fioconecta Matching**.
2. **Manifesto:** em ⚙️ **Configurações do projeto**, marque **"Mostrar arquivo de manifesto 'appsscript.json' no editor"**. Volte ao editor (`< >`), abra `appsscript.json` e substitua o conteúdo pelo arquivo [`apps-script/appsscript.json`](apps-script/appsscript.json).
3. **Arquivos de código:** crie um arquivo para cada `.gs` da pasta [`apps-script/`](apps-script/), com **o mesmo nome**:
   - para criar, clique em **+** ao lado de "Arquivos" → **Script**, e digite o nome **sem** `.gs`;
   - renomeie o `Código.gs` que já vem no projeto para `Config`;
   - em cada arquivo, apague o conteúdo padrão e cole o conteúdo do arquivo de mesmo nome. No GitHub, use o botão **Copy raw file** para copiar o texto exato.

   | Arquivo | Para que serve |
   |---|---|
   | `Config` | configurações e leitura das propriedades |
   | `Planilha` | leitura das abas, junção com Organizações, `gerarIdsOportunidades()` |
   | `Prazo` | classificação dos prazos (aberto, curto, contínuo, ciclos…) |
   | `Preselecao` | pré-seleção por palavras quando há mais de 40 editais |
   | `Prompt` | instruções enviadas à IA (`PROMPT_VERSAO`) |
   | `Claude` | chamada à API e validação da resposta |
   | `Resultados` | montagem das seções e dos cards |
   | `Registro` | aba Demandas e e-mails |
   | `Seguranca` | validação do formulário e proteções contra abuso |
   | `Acesso` | login por código enviado ao e-mail, passe de 30 dias e aba Acessos |
   | `Catalogo` | lista completa de oportunidades da página inicial |
   | `Extracao` | leitura do arquivo enviado pelo pesquisador (pré-preenchimento) |
   | `Proposta` | rascunho de proposta (ficha, marco lógico, orçamento e Gantt) para um edital escolhido |
   | `Codigo` | `doGet` / `doPost` (o app da web) |
   | `Testes` | funções de teste para rodar pelo editor |

4. Salve com **Ctrl+S**. A ordem dos arquivos no editor não importa.

## 4. Cadastrar as propriedades (configurações secretas)

Em ⚙️ **Configurações do projeto → Propriedades do script → Adicionar propriedade do script**. Nada disso vai para o GitHub.

| Propriedade | Obrigatória | Exemplo / valor |
|---|---|---|
| `SPREADSHEET_ID` | sim | o trecho da URL da planilha entre `/d/` e `/edit` |
| `ANTHROPIC_API_KEY` | sim | `sk-ant-…` |
| `ESCRITORIO_EMAIL` | sim | quem recebe as demandas (hoje `bruno.muniz@fiocruz.br`) |
| `DOMINIOS_COPIA` | não (padrão: nenhum) | `fiocruz.br`: só esses domínios recebem cópia do resultado. Subdomínios **não** contam. |
| `TURNSTILE_ATIVO` | não (padrão: `nao`) | `sim` antes da divulgação ampla (seção 9) |
| `TURNSTILE_SECRET` | se o Turnstile estiver ativo | chave **secreta** do Cloudflare Turnstile |
| `MIN_DIAS_PRAZO` | não (padrão: 21) | prazos mais próximos que isso aparecem como "Prazo curto" |
| `MODELO_CLAUDE` | não (padrão: `claude-sonnet-5`) | modelo da IA |
| `ESFORCO_CLAUDE` | não (padrão: `low`) | `low` / `medium` / `high`: valores mais altos dão uma análise mais cuidadosa, porém mais lenta e cara |
| `MAX_TOKENS_CLAUDE` | não (padrão: 16000) | limite de resposta da IA |
| `LOGIN_ATIVO` | não (padrão: `sim`) | `nao` desliga o login: a página abre direto e aceita qualquer e-mail (como no protótipo) |
| `DOMINIOS_LOGIN` | não (padrão: `fiocruz.br`) | quem pode entrar, separado por vírgula. Domínio (correspondência exata, sem subdomínios) ou e-mail completo para liberar uma pessoa de fora, ex.: `fiocruz.br, bmuniz@gmail.com` |
| `EMAILS_BLOQUEADOS` | não | e-mails sem acesso, separados por vírgula. O bloqueio vale na hora, mesmo para quem já entrou |
| `RETENCAO_ACESSOS_MESES` | não (padrão: 12) | por quanto tempo a aba *Acessos* guarda os registros |
| `SEGREDO_PASSE` | **não cadastre** | criado sozinho no primeiro login. Apagar desconecta todo mundo (todos precisam entrar de novo) |

Você também pode preencher os valores na função `configurarPropriedades()`, no arquivo `Config`, e rodá-la uma vez. Mas é mais seguro cadastrar a chave da API direto na tela de propriedades. Se colar a chave no código, volte o valor para `COLE_AQUI` depois de rodar.

## 5. Testar pelo editor

No topo do editor, escolha a função e clique em **Executar**. O resultado aparece em **Registro de execução**. Na primeira vez, o Google pede autorização: clique em **Revisar permissões → Avançado → Acessar Fioconecta Matching (não seguro) → Permitir**. O aviso de "não seguro" é normal, porque o script é seu e não foi verificado pelo Google.

| Ordem | Função | Custo | O que confere |
|---|---|---|---|
| 1 | `verificarPropriedades` | grátis | quais propriedades estão preenchidas (não mostra a chave) |
| 2 | `diagnosticoBase` | grátis | localidade, colunas novas, editais por status de prazo, parceiros sem correspondência |
| 3 | `gerarIdsOportunidades` | grátis | preenche os IDs vazios da coluna `ID`; não altera IDs existentes |
| 4 | `testarMatching` | ~US$ 0,13 | matching completo com uma demanda de exemplo; mostra cards, tempo e custo |
| 5 | `testarValidacao` | grátis | entradas inválidas são recusadas (todas as linhas devem começar com ✓) |
| 6 | `testarEnvioCompleto` | ~US$ 0,13 | envio real: grava em *Demandas* e manda os e-mails para `ESCRITORIO_EMAIL` |
| 7 | `testarProposta` | ~US$ 0,15–0,30 | gera as duas partes do rascunho de proposta para o primeiro edital; mostra tempo e resumo |
| 8 | `testarLogin` | grátis | mostra a configuração do login, confere o passe, cria a aba *Acessos* e envia um código para `ESCRITORIO_EMAIL`. **Confira se o e-mail chegou** (e se não caiu no spam) antes de ligar o login para todos |

`testarValidacao` e `testarEnvioCompleto` pulam o login.

Funções de apoio:
- **`limparLimitesDeTaxa`:** zera os limites de envio durante os testes.
- **`verUltimosErros`:** mostra os últimos erros do app da web, com o código `ref.` que o usuário vê na página.
- **`limparAcessosAntigos`:** apaga da aba *Acessos* as linhas com mais de 12 meses. Também roda sozinha, no máximo a cada 6 horas, depois de um login.

## 6. Implantar como app da web

1. **Implantar → Nova implantação →** ⚙️ ao lado de "Selecionar tipo" → **App da Web**.
2. **Descrição:** `v1`. **Executar como:** **Eu**. **Quem pode acessar:** **Qualquer pessoa**. A opção "Qualquer pessoa com Conta do Google" **não** funciona com a página.
3. Clique em **Implantar**, autorize se o Google pedir e copie a **URL do app da Web**. Ela termina em `/exec`.
4. Para conferir, abra a URL no navegador: deve aparecer `{"ok":true}`.
5. Coloque a URL em [`docs/config.js`](docs/config.js), no campo `webAppUrl`. A URL não é secreta: as proteções ficam no servidor.

### Login e aba *Acessos*

- O pesquisador digita o e-mail, recebe um código de 6 números (vale 10 minutos; 5 tentativas) e fica conectado por 30 dias naquele navegador. O botão **Sair** desconecta.
- Com o login ligado, o e-mail usado em todo envio é o confirmado no acesso, nunca o digitado no formulário.
- A aba **Acessos** é criada sozinha, com uma linha por evento: *Código enviado*, *Login confirmado*, *Código incorreto*, *Código bloqueado*, *Acesso recusado* (e-mail sem acesso), *Lista de oportunidades* (no máximo uma vez a cada 6 horas por pessoa), *Matching*, *Avaliação de edital*, *Leitura de arquivo* e *Proposta*. O código nunca é gravado.
- Para tirar o acesso de alguém: coloque o e-mail em `EMAILS_BLOQUEADOS`. Para desconectar todo mundo: apague `SEGREDO_PASSE`.
- Cada código gasta 1 e-mail da cota diária do Apps Script (seção 11).
- Velocidade: a resposta do login já traz a lista de oportunidades, e a última lista fica guardada no navegador (aparece na hora na próxima visita, enquanto a atual chega). *Sair* apaga a sessão e a lista guardadas. Se o Google devolver um erro passageiro (como o 404 do código R2) ao carregar a lista ou ao entrar, a página repete o pedido uma vez sozinha.

## 7. Publicar a página no GitHub Pages

1. No repositório, abra **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**, depois **Branch: `main`** e a pasta **`/docs`**. Clique em **Save**.
3. Depois de 1 a 2 minutos, a página fica em https://dubmuniz.github.io/matching/.
4. Recomendado: em **Settings → General → Default branch**, deixe `main` como branch padrão.

Cada alteração enviada à pasta `docs/` da `main` é publicada sozinha em cerca de 1 minuto.

## 8. Atualizar depois de mudar o código

- **Apps Script:** cole o arquivo alterado no editor. Depois vá em **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**. **Sem esse passo, o site continua usando o código antigo.** A URL não muda.
- **Ordem:** quando a mudança envolve os dois lados (como o login e a lista de oportunidades), **atualize e implante o Apps Script primeiro** e só depois publique a página. Com a página nova e o Apps Script antigo, a lista mostra o código V2.
- **Página (`docs/`):** ao alterar `styles.css`, `app.js`, `config.js` ou imagens, aumente o número `?v=N` nas referências em `docs/index.html`. O GitHub Pages guarda arquivos em cache por até 10 minutos. Se a página parecer antiga, recarregue com **Ctrl+Shift+R**.

## 9. Antes da divulgação ampla

1. **Turnstile:** confirma que quem envia é uma pessoa, sem quebra-cabeças na maioria dos casos.
   1. Em https://dash.cloudflare.com, crie uma conta gratuita e abra **Turnstile → Add widget**. Hostname: `dubmuniz.github.io`. Modo: *Managed*.
   2. A **site key** (pública) vai em `docs/config.js` → `turnstileSiteKey`.
   3. A **secret key** vai nas Propriedades do script → `TURNSTILE_SECRET`. Depois mude `TURNSTILE_ATIVO` para `sim` e crie uma nova versão da implantação.
2. **Conta institucional:** para levar o projeto para a conta do Escritório, faça uma cópia do projeto (ou recrie seguindo este guia) na conta dona da planilha institucional. Cadastre as propriedades, implante e troque a `webAppUrl`. Nenhum código muda.
3. **Chave da API do Escritório:** troque `ANTHROPIC_API_KEY` e revogue a chave pessoal na Console da Anthropic.
4. **Limite de gasto** configurado na Console da Anthropic (seção 1).
5. **Login:** rode `testarLogin` e confira se o código chega na caixa `@fiocruz.br`. Se não chegar, deixe `LOGIN_ATIVO=nao` até resolver. Para liberar pessoas de fora da Fiocruz, acrescente o e-mail completo em `DOMINIOS_LOGIN`.

## 10. Solução de problemas

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| "A página ainda não foi configurada" | `webAppUrl` vazio em `docs/config.js` | seção 6, passo 5 |
| "Não foi possível falar com o serviço (código R1)" | sem internet, URL errada ou implantação desativada | confira a URL abrindo-a no navegador (deve mostrar `{"ok":true}`) |
| "…formato inesperado (código R2…)" | o Google devolveu uma página no lugar dos dados. Se acontece sempre, a implantação provavelmente não está como **"Qualquer pessoa"**. Se é de vez em quando (HTTP 404), é instabilidade do Google: a página repete o pedido sozinha. No matching, na leitura de arquivo e na proposta, ela pergunta pelo mesmo pedido e recebe o resultado guardado no servidor por 10 minutos, sem rodar a IA de novo nem duplicar a demanda | seção 6, passo 2, com uma nova versão |
| "…formato inesperado (código P1)" | resposta sem resultado, por exemplo quando o envio foi redirecionado ao `doGet` (várias contas Google logadas) | teste numa janela anônima e avise quem desenvolve |
| "Ocorreu um erro inesperado… (ref. XXXXXXXX)" | erro no servidor | rode `verUltimosErros()` e procure o mesmo código `ref.` |
| "Não conseguimos gerar as sugestões agora…" | a IA falhou, mas a demanda foi registrada e o Escritório foi avisado | `verUltimosErros()`; confira a chave da API e o saldo |
| "Você atingiu o limite de 3 envios…" | limite por e-mail em 24 h | em teste, rode `limparLimitesDeTaxa()` |
| "Não foi possível ler este arquivo…" (upload) | PDF com senha, digitalizado (só imagem) ou com mais de 100 páginas | salvar como PDF de texto, DOCX ou TXT; ou preencher à mão |
| "…(código A1)" / "(código A2)" no upload | o navegador não conseguiu abrir o arquivo (ex.: DOCX corrompido ou navegador antigo) | salvar como PDF e tentar de novo |
| "Não foi possível gerar esta parte da proposta…" | a IA falhou ou demorou demais | tente de novo; se repetir, `verUltimosErros()` |
| "Este edital não está mais disponível…" | o edital foi desativado, marcado como vedado ou saiu da planilha | refaça o matching |
| "(código V1)" ao gerar a proposta | o Apps Script publicado ainda não tem a fase 2B | cole `Proposta`, `Seguranca`, `Codigo` e `Testes` atualizados e crie uma **nova versão** da implantação (seção 8) |
| "(código V2)" na lista de oportunidades | o Apps Script publicado ainda não tem o login e a lista | cole `Acesso`, `Catalogo` e os demais arquivos atualizados e crie uma **nova versão** da implantação (seção 8) |
| O código de acesso não chega | e-mail na caixa de spam, filtro do servidor de e-mail ou cota diária esgotada | procure no spam; rode `testarLogin`; enquanto isso, `LOGIN_ATIVO=nao` libera a página |
| "Este e-mail não tem acesso à plataforma" | e-mail fora de `DOMINIOS_LOGIN` (subdomínios como `@ioc.fiocruz.br` também ficam de fora) ou em `EMAILS_BLOQUEADOS` | acrescente o domínio ou o e-mail completo em `DOMINIOS_LOGIN` |
| "Sua sessão expirou" | passe com mais de 30 dias, `SEGREDO_PASSE` apagado ou e-mail bloqueado | entrar de novo |
| Edital novo não aparece na lista | a lista fica 10 minutos em cache | aguarde 10 minutos e recarregue |
| "(código X1)" ao gerar a proposta | o navegador não conseguiu montar a planilha | atualize o navegador e tente de novo |
| Página antiga ou sem estilo | cache | Ctrl+Shift+R; confira se o `?v=N` foi aumentado |
| Edital com integridade "Não avaliado" que deveria ter status | nome do parceiro diferente nas duas abas | `diagnosticoBase()` lista os casos; iguale a grafia |
| Registro do editor cortado | o Apps Script limita cada mensagem a ~8 KB | as funções de teste já imprimem em blocos; role o registro até o fim |

## 11. Custos e limites

| Item | Valor |
|---|---|
| Custo por demanda (28 editais, 43 financiadores) | ~US$ 0,13 (medido em teste real) |
| Tempo de resposta | 30–60 s |
| Envios por e-mail (matching com toda a base) | 3 a cada 24 h |
| Envios no total | 30 por hora |
| Avaliação de um edital escolhido | ~US$ 0,02–0,04 (só um edital vai para a IA); 10 por e-mail a cada 24 h, 30 por hora; só o Escritório recebe e-mail |
| Códigos de acesso | 5 por e-mail a cada 24 h, 30 por hora; cada código gasta 1 e-mail |
| Lista de oportunidades | sem custo de IA; 200 acessos por e-mail a cada 24 h |
| Tamanho do envio | até 20 KB (formulário); arquivo para leitura: até 10 MB |
| Leitura de arquivo (pré-preenchimento) | ~US$ 0,05–0,20 por arquivo; 5 por e-mail a cada 24 h, 30 por hora |
| Rascunho de proposta (XLSX) | ~US$ 0,15–0,30 por proposta (2 chamadas de 30–60 s); 5 por e-mail a cada 24 h, 20 por hora |
| E-mails por dia (conta Gmail gratuita) | ~100 destinatários (cada demanda usa 1 ou 2; cada código de acesso, 1). Com o login, vale migrar para a conta institucional (seção 9), que tem cota maior |

## 12. Caminho B: clasp (opcional)

Para quem prefere a linha de comando no lugar de copiar e colar:

```bash
npm i -g @google/clasp
clasp login
clasp clone <scriptId> --rootDir apps-script   # scriptId: Configurações do projeto → ID do script
clasp push                                     # envia os arquivos de apps-script/
clasp deploy -i <deploymentId> -d "descrição"  # nova versão da implantação existente
```

O arquivo `.clasp.json` contém o ID do script e está no `.gitignore`.

## 13. Para quem desenvolve

- **Regras permanentes do projeto:** [`CLAUDE.md`](CLAUDE.md).
- **Testes automáticos:** rode `node --test` na raiz (Node 18 ou mais recente). Eles cobrem a classificação de prazos, a leitura da planilha, o prompt, a validação, o `doPost` completo com serviços simulados e a página.
- **Script antigo, vinculado à planilha:** [`referencia/codigo-apps-script-existente.gs`](referencia/codigo-apps-script-existente.gs) é **somente leitura**. Sugestões de melhoria estão em [`referencia/ANALISE_SCRIPT_EXISTENTE.md`](referencia/ANALISE_SCRIPT_EXISTENTE.md).
- **Segurança:** [`referencia/CHECKLIST_SEGURANCA.md`](referencia/CHECKLIST_SEGURANCA.md).
- **Mudar o texto do prompt:** altere `apps-script/Prompt.gs` e **aumente `PROMPT_VERSAO`**. Cada demanda registra a versão usada.

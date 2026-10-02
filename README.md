# Fioconecta · Matching de Oportunidades

Ferramenta do Escritório de Captação de Recursos da Presidência da Fiocruz. O pesquisador descreve o projeto num formulário web (ou envia o documento do projeto para a IA sugerir o preenchimento), e o sistema compara a demanda com a base de editais e financiadores mantida pelo Escritório numa planilha Google. Depois mostra as oportunidades mais aderentes, cada uma com a justificativa da nota.

> **A IA apoia, não decide.** Toda nota vem com justificativa. Prazos, valores e links vêm sempre da planilha, nunca da IA.

- **Página publicada:** https://dubmuniz.github.io/matching/
- **Modo de teste, sem enviar nada:** https://dubmuniz.github.io/matching/?mock=1 (também há `?mock=vazio` e `?mock=erro`)
- **Especificação completa:** [`BRIEFING_Fioconecta_Matching.md`](BRIEFING_Fioconecta_Matching.md)

```
Página (GitHub Pages, pasta docs/)  ──POST──▶  Apps Script (app da web)  ──▶  Claude (API da Anthropic)
        formulário + cards          ◀─JSON──    valida, lê a planilha,         avalia a aderência
                                                grava "Demandas", envia e-mail
```

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
   | `Extracao` | leitura do arquivo enviado pelo pesquisador (pré-preenchimento) |
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

Funções de apoio:
- **`limparLimitesDeTaxa`:** zera os limites de envio durante os testes.
- **`verUltimosErros`:** mostra os últimos erros do app da web, com o código `ref.` que o usuário vê na página.

## 6. Implantar como app da web

1. **Implantar → Nova implantação →** ⚙️ ao lado de "Selecionar tipo" → **App da Web**.
2. **Descrição:** `v1`. **Executar como:** **Eu**. **Quem pode acessar:** **Qualquer pessoa**. A opção "Qualquer pessoa com Conta do Google" **não** funciona com a página.
3. Clique em **Implantar**, autorize se o Google pedir e copie a **URL do app da Web**. Ela termina em `/exec`.
4. Para conferir, abra a URL no navegador: deve aparecer `{"ok":true}`.
5. Coloque a URL em [`docs/config.js`](docs/config.js), no campo `webAppUrl`. A URL não é secreta: as proteções ficam no servidor.

## 7. Publicar a página no GitHub Pages

1. No repositório, abra **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**, depois **Branch: `main`** e a pasta **`/docs`**. Clique em **Save**.
3. Depois de 1 a 2 minutos, a página fica em https://dubmuniz.github.io/matching/.
4. Recomendado: em **Settings → General → Default branch**, deixe `main` como branch padrão.

Cada alteração enviada à pasta `docs/` da `main` é publicada sozinha em cerca de 1 minuto.

## 8. Atualizar depois de mudar o código

- **Apps Script:** cole o arquivo alterado no editor. Depois vá em **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**. **Sem esse passo, o site continua usando o código antigo.** A URL não muda.
- **Página (`docs/`):** ao alterar `styles.css`, `app.js`, `config.js` ou imagens, aumente o número `?v=N` nas referências em `docs/index.html`. O GitHub Pages guarda arquivos em cache por até 10 minutos. Se a página parecer antiga, recarregue com **Ctrl+Shift+R**.

## 9. Antes da divulgação ampla

1. **Turnstile:** confirma que quem envia é uma pessoa, sem quebra-cabeças na maioria dos casos.
   1. Em https://dash.cloudflare.com, crie uma conta gratuita e abra **Turnstile → Add widget**. Hostname: `dubmuniz.github.io`. Modo: *Managed*.
   2. A **site key** (pública) vai em `docs/config.js` → `turnstileSiteKey`.
   3. A **secret key** vai nas Propriedades do script → `TURNSTILE_SECRET`. Depois mude `TURNSTILE_ATIVO` para `sim` e crie uma nova versão da implantação.
2. **Conta institucional:** para levar o projeto para a conta do Escritório, faça uma cópia do projeto (ou recrie seguindo este guia) na conta dona da planilha institucional. Cadastre as propriedades, implante e troque a `webAppUrl`. Nenhum código muda.
3. **Chave da API do Escritório:** troque `ANTHROPIC_API_KEY` e revogue a chave pessoal na Console da Anthropic.
4. **Limite de gasto** configurado na Console da Anthropic (seção 1).

## 10. Solução de problemas

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| "A página ainda não foi configurada" | `webAppUrl` vazio em `docs/config.js` | seção 6, passo 5 |
| "Não foi possível falar com o serviço (código R1)" | sem internet, URL errada ou implantação desativada | confira a URL abrindo-a no navegador (deve mostrar `{"ok":true}`) |
| "…formato inesperado (código R2…)" | o Google devolveu uma página no lugar dos dados, geralmente porque a implantação não está como **"Qualquer pessoa"** | seção 6, passo 2, com uma nova versão |
| "…formato inesperado (código P1)" | resposta sem resultado, por exemplo quando o envio foi redirecionado ao `doGet` (várias contas Google logadas) | teste numa janela anônima e avise quem desenvolve |
| "Ocorreu um erro inesperado… (ref. XXXXXXXX)" | erro no servidor | rode `verUltimosErros()` e procure o mesmo código `ref.` |
| "Não conseguimos gerar as sugestões agora…" | a IA falhou, mas a demanda foi registrada e o Escritório foi avisado | `verUltimosErros()`; confira a chave da API e o saldo |
| "Você atingiu o limite de 3 envios…" | limite por e-mail em 24 h | em teste, rode `limparLimitesDeTaxa()` |
| "Não foi possível ler este arquivo…" (upload) | PDF com senha, digitalizado (só imagem) ou com mais de 100 páginas | salvar como PDF de texto, DOCX ou TXT; ou preencher à mão |
| "…(código A1)" / "(código A2)" no upload | o navegador não conseguiu abrir o arquivo (ex.: DOCX corrompido ou navegador antigo) | salvar como PDF e tentar de novo |
| Página antiga ou sem estilo | cache | Ctrl+Shift+R; confira se o `?v=N` foi aumentado |
| Edital com integridade "Não avaliado" que deveria ter status | nome do parceiro diferente nas duas abas | `diagnosticoBase()` lista os casos; iguale a grafia |
| Registro do editor cortado | o Apps Script limita cada mensagem a ~8 KB | as funções de teste já imprimem em blocos; role o registro até o fim |

## 11. Custos e limites

| Item | Valor |
|---|---|
| Custo por demanda (28 editais, 43 financiadores) | ~US$ 0,13 (medido em teste real) |
| Tempo de resposta | 30–60 s |
| Envios por e-mail | 3 a cada 24 h |
| Envios no total | 30 por hora |
| Tamanho do envio | até 20 KB (formulário); arquivo para leitura: até 10 MB |
| Leitura de arquivo (pré-preenchimento) | ~US$ 0,05–0,20 por arquivo; 5 por e-mail a cada 24 h, 30 por hora |
| E-mails por dia (conta Gmail gratuita) | ~100 destinatários (cada demanda usa 1 ou 2) |

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

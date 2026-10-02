# Fase 2: especificação

> **Situação (02/10/2026):** A (upload) e B (XLSX) implementadas, conforme abaixo.

Duas funções novas, pedidas pelo Bruno em 02/10/2026. Esta fase fica fora do escopo do MVP: a seção 14 do briefing previa "elaboração assistida de propostas" como fase futura.

## A. Área de upload: a IA pré-preenche o formulário

- **Formatos:** PDF (enviado ao Claude como documento), DOCX (texto extraído no navegador) e TXT. Até 10 MB e ~50 páginas.
- **Fluxo:**
  1. O pesquisador arrasta o arquivo para a área de upload.
  2. O Apps Script (ação `extrair`) pede ao Claude os campos do formulário, em JSON validado contra as listas fechadas.
  3. A página **pré-preenche** o formulário, e o pesquisador revisa antes de enviar.
- **Privacidade:** o arquivo inteiro vai para a IA externa e pode conter dados pessoais. O consentimento e o aviso da área de upload precisam dizer isso. O nome e o e-mail extraídos **não** são preenchidos automaticamente.
- **Limites:** cota própria, de 5 extrações por e-mail a cada 24 h e 30 por hora no total, e corpo maior só para essa ação.
- **Custo estimado:** US$ 0,05–0,20 por arquivo.

## B. Rascunho de proposta em XLSX, a partir de um edital escolhido

- **Onde aparece:** botão "Gerar rascunho de proposta" nos cards de **oportunidade** (seções *Abertas* e *Para monitorar*).
- **Idioma:** campo novo e único no formulário, "Idioma da proposta" (PT/EN/ES/FR). Todo o XLSX sai nesse idioma.
- **Dados de entrada:**
  - a demanda que já está no navegador;
  - o ID do edital, que o servidor relê na planilha (nome, financiador, tema, resumo, valores, duração, prazo);
  - colunas internas nunca são lidas.
- **Geração:**
  - o Claude devolve JSON estruturado, provavelmente em 2 chamadas por causa do tempo de resposta;
  - o **navegador** monta o XLSX com a biblioteca ExcelJS, carregada do CDN jsdelivr (a CSP será ajustada);
  - nada fica guardado no Drive.
- **Custo estimado:** US$ 0,15–0,30 por proposta.

### Aba 1: Ficha de identificação

Proposta de campos, já que o Escritório ainda não tem modelo próprio:
- **Do formulário:** título, unidade, coordenação (nome e e-mail, sem passar pela IA), resumo, problema, objetivos, áreas temáticas, abrangência, maturidade, parceiros e idiomas.
- **Do edital (planilha):** financiador, edital, link, prazo, valores e duração.
- **Gerados pela IA:** objetivo geral, objetivos específicos, público beneficiário e justificativa de aderência ao edital.

### Aba 2: Marco lógico

Inspirada na aba "Marco Lógico" do modelo *Global EbA Fund / Rota Viva Javaé*, **sem** a tabela "Dimensão / Escolha proposta / Aplicação".

| Nível / código | Lógica de intervenção / resultado | Indicador SMART | Linha de base | Meta ao final (N meses) | Fonte / meio de verificação | Frequência | Responsável | Marco de verificação | Pressupostos / riscos críticos |
|---|---|---|---|---|---|---|---|---|---|

- **Níveis:** IMPACTO (1 linha), OUTCOME (OC.1…OC.n), OUTPUT 1…n (com indicadores n.1, n.2…).
- **N meses** = duração do edital.
- Quando o edital pede indicadores próprios (como os *Core Indicators* do EbA Fund), a IA os usa se estiverem no resumo do edital.

### Aba 3: Orçamento

- **Moeda:** a do edital, detectada no campo "Valores". Se não houver moeda clara, BRL, com aviso.
- **Rubricas:** as indicadas pelo edital, quando o resumo as menciona. Senão, o **modelo padrão**: Pessoal · Equipamentos e material permanente · Material de consumo · Viagens e diárias · Serviços de terceiros · Custos indiretos.
- **Colunas:** rubrica, descrição, unidade, quantidade, custo unitário, Ano 1…Ano N e total. Os totais são **fórmulas** (`SUM`).
- **Limite:** o total respeita o teto do edital e a faixa de valor da demanda.
- **Aviso no topo:** "Rascunho estimado por IA: revise todos os valores".

### Aba 4: Gantt

Inspirada na aba "Atividades e Cronograma" do mesmo modelo.

| Output | Código | Atividade | Período | Entregável verificável | Indicador | Responsável | M1 | M2 | … | MN |
|---|---|---|---|---|---|---|---|---|---|---|

- **Barras** = células coloridas no período de execução; **◆** = marco de verificação.
- **Duração** tirada do edital. Quando o edital não informa, usa 24 meses e **avisa o pesquisador** dessa limitação, na página e numa nota na própria aba.

## Ordem de construção proposta

1. **A (upload):** é menor e já melhora a qualidade do matching.
2. **B (XLSX):** primeiro o backend (prompt + validação + testes); depois o frontend (botão + ExcelJS + download).
3. **Revisão de segurança** e atualização do README.

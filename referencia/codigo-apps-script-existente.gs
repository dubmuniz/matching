/***********************
Fiocruz Captação — Editais (mantido) + Organizações (novo) + Portfólio (novo)
Modelo: claude-sonnet-4-5-20250929

Aba Editais: autopreenchimento via link do edital + link do resumo executivo.
Aba Organizações: cria linha a partir de Editais (deriva domínio do link do edital) e preenche perfil a partir do Website.
Aba Portfólio: preenche a partir do link em "Informações online".

IMPORTANTE (DOCX -> Google Doc):
Apps Script → Services → Add a service → Drive API → Add

CABEÇALHO EXATO (Organizações):
Organização	Sinergia	Prioridades programáticas	Acesso por	Tipo de projeto apoiado	Região de Financiamento	Porte de financiamento	Contato/ Cargo	Endereço de contato	País de origem	Website

CABEÇALHO EXATO (Portfólio):
Nome do projeto	Breve descrição	Informações online	Pesquisador responsável	Email	Telefone	Unidade Fiocruz	Abrangência geográfica	Parceiros	Financiadores	Valor captado
***********************/

/***********************
CONFIG
***********************/
const CONFIG = {
  SHEET_NAME: '',               // se vazio, usa aba ativa para Editais
  HEADER_ROW: 1,

  ORG_SHEET_NAME: 'Organizações',
  ORG_HEADER_ROW: 1,

  PORTFOLIO_SHEET_NAME: 'Portfólio',
  PORTFOLIO_HEADER_ROW: 1,

  CLAUDE_MODEL: 'claude-sonnet-4-5-20250929',
  CLAUDE_URL: 'https://api.anthropic.com/v1/messages',

  OVERWRITE_EXISTING: false,
  MAX_CHARS_PER_SOURCE: 22000,
  REQUEST_TIMEOUT_MS: 60000,

  TEMP_FOLDER_NAME: 'TEMP_CAPTACAO_CONVERSOES',
  DELETE_TEMP_FILES: true,

  RETRY_MAX_ATTEMPTS: 5,
  RETRY_BASE_SLEEP_MS: 1200,

  FX_CACHE_HOURS: 12,

  // Organizações
  AUTO_CREATE_ORG_FROM_EDITAIS: true,
  AUTO_FILL_ORG_ON_CREATE: false,
  ORG_DEDUP_BY_DOMAIN: true
};

/***********************
HEADERS (Editais)
***********************/
const HEADERS = {
  parceiro: 'Nome do parceiro',
  edital: 'Nome do edital',
  tema: 'Tema central',
  resumoChamada: 'Resumo da chamada',
  prazo: 'Prazo',
  valores: 'Valores',
  duracao: 'Tempo de duração',
  sinergia: 'Projeto FIOCRUZ com sinergia',
  pontoFocal: 'Ponto focal no time do Escritório',
  pesquisador: 'Pesquisador parceiro',
  email: 'Email do pesquisador',
  linkEdital: 'Link do edital',
  linkResumo: 'Link do resumo executivo'
};

/***********************
HEADERS (Organizações) — EXATO
***********************/
const ORG_HEADERS = {
  organizacao: 'Organização',
  sinergia: 'Sinergia',
  prioridades: 'Prioridades programáticas',
  acessoPor: 'Acesso por',
  tipoProjeto: 'Tipo de projeto apoiado',
  regiao: 'Região de Financiamento',
  porte: 'Porte de financiamento',
  contatoCargo: 'Contato/ Cargo',
  enderecoContato: 'Endereço de contato',
  paisOrigem: 'País de origem',
  website: 'Website'
};

/***********************
HEADERS (Portfólio) — EXATO
***********************/
const PORT_HEADERS = {
  nomeProjeto: 'Nome do projeto',
  breveDesc: 'Breve descrição',
  infoOnline: 'Informações online',
  pesquisador: 'Pesquisador responsável',
  email: 'Email',
  telefone: 'Telefone',
  unidade: 'Unidade Fiocruz',
  abrangencia: 'Abrangência geográfica',
  parceiros: 'Parceiros',
  financiadores: 'Financiadores',
  valorCaptado: 'Valor captado'
};

/***********************
Contexto objetivo para sinergia (Organizações)
***********************/
const FIOCRUZ_CONTEXT_PT = [
  'Fiocruz é uma instituição científica e tecnológica em saúde, com atuação em pesquisa, desenvolvimento tecnológico, inovação, ensino e cooperação, com papel no fortalecimento do SUS.',
  'A sinergia costuma ser mais alta quando o financiador apoia saúde pública, vigilância, doenças infecciosas, inovação em saúde, políticas e sistemas de saúde, formação, e agendas correlatas como saúde e clima.',
  'Avalie compatibilidade por temas financiados, elegibilidade, geografia, modalidade e exigências.'
].join('\n');

/***********************
MENUS
***********************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Captação')
    .addItem('Configurar API Key (usuário)', 'setClaudeApiKeyUserPrompt_')
    .addItem('Configurar API Key (projeto)', 'setClaudeApiKeyProjectPrompt_')
    .addSeparator()
    .addItem('Diagnosticar linha selecionada (Editais)', 'diagnoseSelectedRow_')
    .addSeparator()
    .addItem('Preencher linha selecionada (Editais)', 'fillSelectedRow_')
    .addItem('Preencher linhas com links (Editais, aba inteira)', 'fillAllRowsWithLinks_')
    .addSeparator()
    .addItem('Sincronizar Organizações a partir dos Editais', 'syncOrganizationsFromEditais_')
    .addToUi();

  SpreadsheetApp.getUi()
    .createMenu('Organizações')
    .addItem('Criar/garantir aba Organizações (cabeçalho)', 'ensureOrganizationsSheet_')
    .addSeparator()
    .addItem('Preencher linha selecionada (Organizações)', 'fillSelectedOrganizationRow_')
    .addItem('Preencher linhas com Website (Organizações, aba inteira)', 'fillAllOrganizationsWithWebsites_')
    .addToUi();

  SpreadsheetApp.getUi()
    .createMenu('Portfólio')
    .addItem('Criar/garantir aba Portfólio (cabeçalho)', 'ensurePortfolioSheet_')
    .addSeparator()
    .addItem('Preencher linha selecionada (Portfólio)', 'fillSelectedPortfolioRow_')
    .addItem('Preencher linhas com link (Portfólio, aba inteira)', 'fillAllPortfolioWithLinks_')
    .addToUi();
}

/***********************
CHAVES
***********************/
function setClaudeApiKeyUserPrompt_() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Claude API Key (usuário)', 'Cole sua API Key (salva só para você).', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getUserProperties().setProperty('CLAUDE_API_KEY', resp.getResponseText().trim());
  ui.alert('API Key do usuário salva.');
}

function setClaudeApiKeyProjectPrompt_() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Claude API Key (projeto)', 'Cole a API Key do escritório (salva no projeto).', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', resp.getResponseText().trim());
  ui.alert('API Key do projeto salva.');
}

function getClaudeApiKey_() {
  const userKey = (PropertiesService.getUserProperties().getProperty('CLAUDE_API_KEY') || '').trim();
  if (userKey) return userKey;
  return (PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || '').trim();
}

/***********************
EDITAIS — EXECUÇÃO (mantido)
***********************/
function fillSelectedRow_() {
  const sheet = getEditaisSheet_();
  const row = sheet.getActiveRange().getRow();
  if (row <= CONFIG.HEADER_ROW) return;
  fillRow_(sheet, row);
}

function fillAllRowsWithLinks_() {
  const sheet = getEditaisSheet_();
  const map = getEditaisHeaderMap_(sheet, CONFIG.HEADER_ROW);
  const lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.HEADER_ROW) return;

  for (let r = CONFIG.HEADER_ROW + 1; r <= lastRow; r++) {
    const linkEdital = getUrlFromCell_(sheet, r, map[HEADERS.linkEdital]);
    const linkResumo = getUrlFromCell_(sheet, r, map[HEADERS.linkResumo]);
    if (!linkEdital && !linkResumo) continue;
    fillRow_(sheet, r);
    Utilities.sleep(250);
  }
}

function fillRow_(sheet, row) {
  const map = getEditaisHeaderMap_(sheet, CONFIG.HEADER_ROW);

  const linkEdital = getUrlFromCell_(sheet, row, map[HEADERS.linkEdital]);
  const linkResumo = getUrlFromCell_(sheet, row, map[HEADERS.linkResumo]);
  if (!linkEdital && !linkResumo) return;

  const textoEdital = linkEdital ? fetchAndExtractTextFromUrl_(linkEdital) : '';
  const textoResumo = linkResumo ? fetchAndExtractTextFromDriveLink_(linkResumo) : '';

  const prazoHint = findDeadlineCandidateStrict_(textoEdital, textoResumo);
  const duracaoHint = findDuracaoCandidate_(textoEdital, textoResumo);
  const sinergiaLinha = findFiocruzSynergyFromLabel_(textoResumo);
  const sinergiaHint = sinergiaLinha || findFiocruzSynergyCandidate_(textoResumo);
  const valoresOrigHint = findValoresCandidate_(textoEdital, textoResumo);
  const valoresBrlHint = convertValoresToBRL_(valoresOrigHint);

  const payload = callClaudeExtract_(
    textoEdital,
    textoResumo,
    linkEdital,
    linkResumo,
    prazoHint,
    duracaoHint,
    valoresOrigHint,
    valoresBrlHint,
    sinergiaHint
  );

  if (!payload.prazo && prazoHint) payload.prazo = prazoHint;
  if (!payload.tempo_duracao && duracaoHint) payload.tempo_duracao = duracaoHint;
  if (!payload.projeto_fiocruz_com_sinergia && sinergiaHint) payload.projeto_fiocruz_com_sinergia = sinergiaHint;

  if (!payload.valores) {
    payload.valores = valoresBrlHint || '';
  } else {
    payload.valores = normalizeValoresToBRLWithOriginal_(payload.valores, valoresOrigHint);
  }

  const fieldsToWrite = [
    { header: HEADERS.parceiro, value: payload.nome_parceiro || '' },
    { header: HEADERS.edital, value: payload.nome_edital || '' },
    { header: HEADERS.tema, value: payload.tema_central || '' },
    { header: HEADERS.resumoChamada, value: payload.resumo_chamada || '' },
    { header: HEADERS.prazo, value: payload.prazo || '' },
    { header: HEADERS.valores, value: payload.valores || '' },
    { header: HEADERS.duracao, value: payload.tempo_duracao || '' },
    { header: HEADERS.sinergia, value: payload.projeto_fiocruz_com_sinergia || '' },
    { header: HEADERS.pesquisador, value: payload.pesquisador_parceiro || '' },
    { header: HEADERS.email, value: payload.email_pesquisador || '' }
  ];

  fieldsToWrite.forEach(f => {
    const col = map[f.header];
    if (!col) return;
    const cell = sheet.getRange(row, col);
    const current = String(cell.getValue() || '').trim();
    if (!CONFIG.OVERWRITE_EXISTING && current) return;
    const v = String(f.value || '').trim();
    if (v) cell.setValue(v);
  });

  // NOVO: sincroniza/cria Organização a partir do link do edital
  if (CONFIG.AUTO_CREATE_ORG_FROM_EDITAIS && linkEdital) {
    try {
      ensureOrganizationsSheet_();
      const orgWebsite = deriveWebsiteFromAnyUrl_(linkEdital);
      if (orgWebsite) {
        const orgSheet = getOrganizationsSheet_();
        const orgMap = getOrgHeaderMap_(orgSheet);

        const hintName = String(payload.nome_parceiro || '').trim();
        const createdRow = ensureOrganizationRow_(orgSheet, orgMap, orgWebsite, hintName);

        if (createdRow && CONFIG.AUTO_FILL_ORG_ON_CREATE) {
          fillOrganizationRow_(orgSheet, createdRow);
        }
      }
    } catch (e) {}
  }
}

/***********************
DIAGNÓSTICO (Editais)
***********************/
function diagnoseSelectedRow_() {
  const sheet = getEditaisSheet_();
  const map = getEditaisHeaderMap_(sheet, CONFIG.HEADER_ROW);
  const row = sheet.getActiveRange().getRow();
  if (row <= CONFIG.HEADER_ROW) {
    SpreadsheetApp.getUi().alert('Selecione uma linha de dados (abaixo do cabeçalho).');
    return;
  }

  const linkEdital = getUrlFromCell_(sheet, row, map[HEADERS.linkEdital]);
  const linkResumo = getUrlFromCell_(sheet, row, map[HEADERS.linkResumo]);

  const textoEdital = linkEdital ? fetchAndExtractTextFromUrl_(linkEdital) : '';
  const textoResumo = linkResumo ? fetchAndExtractTextFromDriveLink_(linkResumo) : '';

  const prazoHint = findDeadlineCandidateStrict_(textoEdital, textoResumo);
  const duracaoHint = findDuracaoCandidate_(textoEdital, textoResumo);
  const sinergiaLinha = findFiocruzSynergyFromLabel_(textoResumo);
  const valoresOrigHint = findValoresCandidate_(textoEdital, textoResumo);
  const valoresBrlHint = convertValoresToBRL_(valoresOrigHint);
  const orgWebsite = linkEdital ? deriveWebsiteFromAnyUrl_(linkEdital) : '';

  let msg = `Diagnóstico da linha ${row}\n\n`;
  msg += `Link do edital (detectado): ${linkEdital || '[vazio]'}\n`;
  msg += `Link do resumo (detectado): ${linkResumo || '[vazio]'}\n`;
  msg += `Website organização (derivado): ${orgWebsite || '[vazio]'}\n\n`;
  msg += `Tamanho texto edital: ${textoEdital ? textoEdital.length : 0}\n`;
  msg += `Tamanho texto resumo: ${textoResumo ? textoResumo.length : 0}\n\n`;
  msg += `Prazo hint: ${prazoHint || '[vazio]'}\n`;
  msg += `Duração hint: ${duracaoHint || '[vazio]'}\n`;
  msg += `Valores orig hint: ${valoresOrigHint || '[vazio]'}\n`;
  msg += `Valores BRL hint: ${valoresBrlHint || '[vazio]'}\n`;
  msg += `Sinergia (label): ${(sinergiaLinha || '').slice(0, 180) || '[vazio]'}\n`;

  SpreadsheetApp.getUi().alert(msg);
}

/***********************
ORGANIZAÇÕES — ABA + CABEÇALHO EXATO
***********************/
function ensureOrganizationsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.ORG_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.ORG_SHEET_NAME);

  const headers = [
    ORG_HEADERS.organizacao,
    ORG_HEADERS.sinergia,
    ORG_HEADERS.prioridades,
    ORG_HEADERS.acessoPor,
    ORG_HEADERS.tipoProjeto,
    ORG_HEADERS.regiao,
    ORG_HEADERS.porte,
    ORG_HEADERS.contatoCargo,
    ORG_HEADERS.enderecoContato,
    ORG_HEADERS.paisOrigem,
    ORG_HEADERS.website
  ];

  sh.getRange(CONFIG.ORG_HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  try { sh.setFrozenRows(CONFIG.ORG_HEADER_ROW); } catch (e) {}
}

function fillSelectedOrganizationRow_() {
  ensureOrganizationsSheet_();
  const sh = getOrganizationsSheet_();
  const row = sh.getActiveRange().getRow();
  if (row <= CONFIG.ORG_HEADER_ROW) return;
  fillOrganizationRow_(sh, row);
}

function fillAllOrganizationsWithWebsites_() {
  ensureOrganizationsSheet_();
  const sh = getOrganizationsSheet_();
  const map = getOrgHeaderMap_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow <= CONFIG.ORG_HEADER_ROW) return;

  for (let r = CONFIG.ORG_HEADER_ROW + 1; r <= lastRow; r++) {
    const website = getUrlFromCell_(sh, r, map[ORG_HEADERS.website]) ||
      String(sh.getRange(r, map[ORG_HEADERS.website]).getDisplayValue() || '').trim();
    if (!website) continue;
    fillOrganizationRow_(sh, r);
    Utilities.sleep(250);
  }
}

function fillOrganizationRow_(orgSheet, row) {
  const map = getOrgHeaderMap_(orgSheet);
  const websiteCol = map[ORG_HEADERS.website];

  const website = getUrlFromCell_(orgSheet, row, websiteCol) ||
    String(orgSheet.getRange(row, websiteCol).getDisplayValue() || '').trim();
  if (!website) return;

  const orgText = fetchAndExtractTextFromUrl_(website);
  const payload = callClaudeOrgProfileExtract_(website, orgText);

  const fields = [
    { header: ORG_HEADERS.organizacao, value: payload.organizacao || '' },
    { header: ORG_HEADERS.sinergia, value: payload.sinergia || '' },
    { header: ORG_HEADERS.prioridades, value: payload.prioridades_programaticas || '' },
    { header: ORG_HEADERS.acessoPor, value: payload.acesso_por || '' },
    { header: ORG_HEADERS.tipoProjeto, value: payload.tipo_de_projeto_apoiado || '' },
    { header: ORG_HEADERS.regiao, value: payload.regiao_de_financiamento || '' },
    { header: ORG_HEADERS.porte, value: payload.porte_de_financiamento || '' },
    { header: ORG_HEADERS.contatoCargo, value: payload.contato_cargo || '' },
    { header: ORG_HEADERS.enderecoContato, value: payload.endereco_de_contato || '' },
    { header: ORG_HEADERS.paisOrigem, value: payload.pais_de_origem || '' }
  ];

  fields.forEach(f => {
    const col = map[f.header];
    if (!col) return;
    const cell = orgSheet.getRange(row, col);
    const current = String(cell.getValue() || '').trim();
    if (!CONFIG.OVERWRITE_EXISTING && current) return;
    const v = String(f.value || '').trim();
    if (v) cell.setValue(v);
  });

  if (!String(orgSheet.getRange(row, websiteCol).getDisplayValue() || '').trim()) {
    orgSheet.getRange(row, websiteCol).setValue(website);
  }
}

/***********************
SYNC: varre Editais e cria Organizações faltantes
***********************/
function syncOrganizationsFromEditais_() {
  ensureOrganizationsSheet_();

  const editais = getEditaisSheet_();
  const eMap = getEditaisHeaderMap_(editais, CONFIG.HEADER_ROW);

  const linkEditalCol = eMap[HEADERS.linkEdital];
  const parceiroCol = eMap[HEADERS.parceiro] || 0;

  if (!linkEditalCol) throw new Error('Cabeçalho não encontrado (Editais): "' + HEADERS.linkEdital + '"');

  const orgSheet = getOrganizationsSheet_();
  const orgMap = getOrgHeaderMap_(orgSheet);

  const lastRow = editais.getLastRow();
  if (lastRow <= CONFIG.HEADER_ROW) return;

  for (let r = CONFIG.HEADER_ROW + 1; r <= lastRow; r++) {
    const linkEdital = getUrlFromCell_(editais, r, linkEditalCol);
    if (!linkEdital) continue;

    const website = deriveWebsiteFromAnyUrl_(linkEdital);
    if (!website) continue;

    const hintName = parceiroCol ? String(editais.getRange(r, parceiroCol).getDisplayValue() || '').trim() : '';
    const createdRow = ensureOrganizationRow_(orgSheet, orgMap, website, hintName);

    if (createdRow && CONFIG.AUTO_FILL_ORG_ON_CREATE) {
      fillOrganizationRow_(orgSheet, createdRow);
      Utilities.sleep(250);
    }
  }
}

/***********************
Cria linha em Organizações se não existir
Retorna: número da linha criada, ou 0 se já existia
***********************/
function ensureOrganizationRow_(orgSheet, orgMap, website, nameHint) {
  const websiteCol = orgMap[ORG_HEADERS.website];
  const nameCol = orgMap[ORG_HEADERS.organizacao];

  const w = String(website || '').trim();
  if (!w) return 0;

  const wDomain = CONFIG.ORG_DEDUP_BY_DOMAIN ? safeGetDomain_(w) : '';

  const lastRow = orgSheet.getLastRow();
  if (lastRow > CONFIG.ORG_HEADER_ROW) {
    const vals = orgSheet.getRange(CONFIG.ORG_HEADER_ROW + 1, websiteCol, lastRow - CONFIG.ORG_HEADER_ROW, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      const existing = String(vals[i][0] || '').trim();
      if (!existing) continue;

      if (existing === w) return 0;

      if (CONFIG.ORG_DEDUP_BY_DOMAIN) {
        const d = safeGetDomain_(existing);
        if (wDomain && d && wDomain === d) return 0;
      }
    }
  }

  const newRow = lastRow + 1;
  orgSheet.insertRowAfter(lastRow || CONFIG.ORG_HEADER_ROW);

  orgSheet.getRange(newRow, websiteCol).setValue(w);

  const hint = String(nameHint || '').trim();
  if (hint) {
    const currentName = String(orgSheet.getRange(newRow, nameCol).getValue() || '').trim();
    if (!currentName) orgSheet.getRange(newRow, nameCol).setValue(hint);
  }

  return newRow;
}

/***********************
WEBSITE derivado de qualquer URL (domínio)
***********************/
function deriveWebsiteFromAnyUrl_(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  const m = u.match(/^(https?:\/\/)([^\/?#]+)(?:[\/?#]|$)/i);
  if (!m) return '';
  const scheme = m[1].toLowerCase();
  let host = String(m[2] || '').trim().toLowerCase();
  host = host.replace(/^www\./i, '');
  return scheme + host;
}

function safeGetDomain_(url) {
  const u = String(url || '').trim();
  const m = u.match(/^https?:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  if (!m) return '';
  return String(m[1] || '').replace(/^www\./i, '').toLowerCase();
}

/***********************
PORTFÓLIO — ABA + CABEÇALHO EXATO
***********************/
function ensurePortfolioSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.PORTFOLIO_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.PORTFOLIO_SHEET_NAME);

  const headers = [
    PORT_HEADERS.nomeProjeto,
    PORT_HEADERS.breveDesc,
    PORT_HEADERS.infoOnline,
    PORT_HEADERS.pesquisador,
    PORT_HEADERS.email,
    PORT_HEADERS.telefone,
    PORT_HEADERS.unidade,
    PORT_HEADERS.abrangencia,
    PORT_HEADERS.parceiros,
    PORT_HEADERS.financiadores,
    PORT_HEADERS.valorCaptado
  ];

  sh.getRange(CONFIG.PORTFOLIO_HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  try { sh.setFrozenRows(CONFIG.PORTFOLIO_HEADER_ROW); } catch (e) {}
}

function fillSelectedPortfolioRow_() {
  ensurePortfolioSheet_();
  const sh = getPortfolioSheet_();
  const row = sh.getActiveRange().getRow();
  if (row <= CONFIG.PORTFOLIO_HEADER_ROW) return;
  fillPortfolioRow_(sh, row);
}

function fillAllPortfolioWithLinks_() {
  ensurePortfolioSheet_();
  const sh = getPortfolioSheet_();
  const map = getPortfolioHeaderMap_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow <= CONFIG.PORTFOLIO_HEADER_ROW) return;

  for (let r = CONFIG.PORTFOLIO_HEADER_ROW + 1; r <= lastRow; r++) {
    const link = getUrlFromCell_(sh, r, map[PORT_HEADERS.infoOnline]) ||
      String(sh.getRange(r, map[PORT_HEADERS.infoOnline]).getDisplayValue() || '').trim();
    if (!link) continue;

    fillPortfolioRow_(sh, r);
    Utilities.sleep(250);
  }
}

function fillPortfolioRow_(sheet, row) {
  const map = getPortfolioHeaderMap_(sheet);
  const linkCol = map[PORT_HEADERS.infoOnline];

  const link = getUrlFromCell_(sheet, row, linkCol) ||
    String(sheet.getRange(row, linkCol).getDisplayValue() || '').trim();
  if (!link) return;

  const text = fetchAndExtractTextFromUrl_(link);
  const payload = callClaudePortfolioExtract_(link, text);

  const fields = [
    { header: PORT_HEADERS.nomeProjeto, value: payload.nome_do_projeto || '' },
    { header: PORT_HEADERS.breveDesc, value: payload.breve_descricao || '' },
    { header: PORT_HEADERS.pesquisador, value: payload.pesquisador_responsavel || '' },
    { header: PORT_HEADERS.email, value: payload.email || '' },
    { header: PORT_HEADERS.telefone, value: payload.telefone || '' },
    { header: PORT_HEADERS.unidade, value: payload.unidade_fiocruz || '' },
    { header: PORT_HEADERS.abrangencia, value: payload.abrangencia_geografica || '' },
    { header: PORT_HEADERS.parceiros, value: payload.parceiros || '' },
    { header: PORT_HEADERS.financiadores, value: payload.financiadores || '' },
    { header: PORT_HEADERS.valorCaptado, value: payload.valor_captado || '' }
  ];

  fields.forEach(f => {
    const col = map[f.header];
    if (!col) return;

    const cell = sheet.getRange(row, col);
    const current = String(cell.getValue() || '').trim();
    if (!CONFIG.OVERWRITE_EXISTING && current) return;

    const v = String(f.value || '').trim();
    if (v) cell.setValue(v);
  });

  if (!String(sheet.getRange(row, linkCol).getDisplayValue() || '').trim()) {
    sheet.getRange(row, linkCol).setValue(link);
  }
}

/***********************
URL em célula (RichText + texto)
***********************/
function getUrlFromCell_(sheet, row, col) {
  if (!col) return '';
  const range = sheet.getRange(row, col);

  const rt = range.getRichTextValue();
  if (rt) {
    const url = rt.getLinkUrl();
    if (url) return String(url).trim();

    const runs = rt.getRuns();
    if (runs && runs.length) {
      for (const r of runs) {
        const u = r.getLinkUrl();
        if (u) return String(u).trim();
      }
    }
  }

  const v = String(range.getDisplayValue() || '').trim();
  if (/^https?:\/\//i.test(v)) return v;

  return '';
}

/***********************
URL -> texto (HTML/Text; PDF -> aviso)
***********************/
function fetchAndExtractTextFromUrl_(url) {
  try {
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      timeout: CONFIG.REQUEST_TIMEOUT_MS
    });

    const contentType = (res.getHeaders()['Content-Type'] || '').toLowerCase();
    const body = res.getContentText('UTF-8');

    if (contentType.includes('text/html') || looksLikeHtml_(body)) {
      return truncate_(htmlToText_(body), CONFIG.MAX_CHARS_PER_SOURCE);
    }
    if (contentType.includes('text/plain')) {
      return truncate_(body, CONFIG.MAX_CHARS_PER_SOURCE);
    }
    if (contentType.includes('application/pdf') || String(url).toLowerCase().includes('.pdf')) {
      return truncate_(
        `Conteúdo PDF detectado. Para extração estável, prefira link HTML ou inclua texto no resumo executivo. URL: ${url}`,
        3000
      );
    }

    return truncate_(htmlToText_(body), CONFIG.MAX_CHARS_PER_SOURCE);
  } catch (e) {
    return `Erro ao buscar URL: ${url}. Erro: ${String(e)}`;
  }
}

function looksLikeHtml_(s) {
  const sample = String(s || '').slice(0, 800).toLowerCase();
  return sample.includes('<html') || sample.includes('<body') || sample.includes('<head') || sample.includes('<div');
}

function htmlToText_(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function truncate_(s, max) {
  const str = String(s || '');
  if (str.length <= max) return str;
  return str.slice(0, max) + '\n[TRUNCADO]';
}

/***********************
Drive -> texto (Google Doc / DOCX convert / PDF aviso)
Requer Drive API avançada (para conversão por Drive.Files.copy).
***********************/
function fetchAndExtractTextFromDriveLink_(driveLink) {
  try {
    const fileId = extractDriveFileId_(driveLink);
    if (!fileId) return `Não consegui extrair o fileId do link do Drive: ${driveLink}`;

    const file = DriveApp.getFileById(fileId);
    const mime = file.getMimeType();

    if (mime === MimeType.GOOGLE_DOCS) {
      const doc = DocumentApp.openById(fileId);
      return truncate_(doc.getBody().getText(), CONFIG.MAX_CHARS_PER_SOURCE);
    }

    const isDocx =
      mime === MimeType.MICROSOFT_WORD ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (isDocx) {
      const convertedId = convertToGoogleDocTemp_(fileId);
      try {
        const doc = DocumentApp.openById(convertedId);
        return truncate_(doc.getBody().getText(), CONFIG.MAX_CHARS_PER_SOURCE);
      } finally {
        if (CONFIG.DELETE_TEMP_FILES) safeTrashFile_(convertedId);
      }
    }

    if (mime === MimeType.PDF) {
      return truncate_(
        `Resumo executivo em PDF no Drive. Para extração estável, use Google Doc ou DOCX. FileId: ${fileId}`,
        3000
      );
    }

    if (mime === MimeType.PLAIN_TEXT || mime === MimeType.CSV) {
      const blob = file.getBlob();
      const text = blob.getDataAsString('UTF-8');
      return truncate_(text, CONFIG.MAX_CHARS_PER_SOURCE);
    }

    return `Tipo de arquivo do resumo não suportado para extração segura (mime=${mime}). Converta para Google Doc. FileId: ${fileId}`;
  } catch (e) {
    return `Erro ao ler arquivo do Drive: ${driveLink}. Erro: ${String(e)}`;
  }
}

function extractDriveFileId_(url) {
  const s = String(url || '').trim();
  if (!s) return '';

  let m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m && m[1]) return m[1];

  m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m && m[1]) return m[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;

  return '';
}

function convertToGoogleDocTemp_(sourceFileId) {
  const folderId = getOrCreateTempFolderId_();
  const resource = {
    title: 'TEMP_CONVERT_' + sourceFileId + '_' + new Date().getTime(),
    mimeType: 'application/vnd.google-apps.document',
    parents: [{ id: folderId }]
  };
  const copied = Drive.Files.copy(resource, sourceFileId, { convert: true });
  return copied.id;
}

function getOrCreateTempFolderId_() {
  const props = PropertiesService.getScriptProperties();
  const cached = (props.getProperty('TEMP_FOLDER_ID') || '').trim();
  if (cached) return cached;

  const it = DriveApp.getFoldersByName(CONFIG.TEMP_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.TEMP_FOLDER_NAME);
  props.setProperty('TEMP_FOLDER_ID', folder.getId());
  return folder.getId();
}

function safeTrashFile_(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
}

/***********************
PRAZO (DD/MM/AAAA) — estrito
***********************/
function findDeadlineCandidateStrict_(textoEdital, textoResumo) {
  const lines = (String(textoEdital || '') + '\n' + String(textoResumo || '')).split(/\r?\n/);
  const kw = /(deadline|closing date|submission deadline|apply by|applications close|due date|proposal due|final date|prazo|data limite|encerramento|submiss[aã]o|inscri[cç][aã]o|até)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!kw.test(line)) continue;

    const window = [line, lines[i + 1] || '', lines[i + 2] || ''].join(' ');
    const ddmmyyyy = extractDateDDMMYYYY_(window);
    if (ddmmyyyy) return ddmmyyyy;

    const fromEn = extractDateFromEnglishMonthToDDMMYYYY_(window);
    if (fromEn) return fromEn;
  }
  return '';
}

function extractDateDDMMYYYY_(s) {
  const x = String(s || '');

  let m = x.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (m) return `${pad2_(m[1])}/${pad2_(m[2])}/${m[3]}`;

  m = x.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (m) return `${pad2_(m[3])}/${pad2_(m[2])}/${m[1]}`;

  return '';
}

function extractDateFromEnglishMonthToDDMMYYYY_(s) {
  const x = String(s || '');

  let m = x.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,)?\s+(\d{4})\b/i);
  if (m) return `${pad2_(m[2])}/${pad2_(monthNameToNumber_(m[1]))}/${m[3]}`;

  m = x.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i);
  if (m) return `${pad2_(m[1])}/${pad2_(monthNameToNumber_(m[2]))}/${m[3]}`;

  return '';
}

function monthNameToNumber_(monName) {
  const map = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  return map[String(monName || '').slice(0, 3).toLowerCase()] || '';
}

function pad2_(x) {
  const n = String(x);
  return n.length === 1 ? '0' + n : n;
}

/***********************
TEMPO DE DURAÇÃO — min/max
***********************/
function findDuracaoCandidate_(textoEdital, textoResumo) {
  const t = (String(textoEdital || '') + '\n' + String(textoResumo || '')).replace(/\s+/g, ' ').trim();
  if (!t) return '';

  const patterns = [
    /\bbetween\s+(\d{1,3})\s+and\s+(\d{1,3})\s+(months?|years?)\b/i,
    /\b(\d{1,3})\s*(?:to|\-|a)\s*(\d{1,3})\s*(months?|years?|meses?|anos?)\b/i,
    /\bmin(?:imum|\.?)\s*(\d{1,3})\s*(months?|years?|meses?|anos?)\b[\s\S]{0,120}\bmax(?:imum|\.?)\s*(\d{1,3})\s*(months?|years?|meses?|anos?)\b/i
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (!m) continue;

    if (String(p).includes('between')) {
      const a = Number(m[1]), b = Number(m[2]), u = String(m[3]).toLowerCase();
      const monthsA = unitToMonths_(a, u);
      const monthsB = unitToMonths_(b, u);
      if (monthsA && monthsB) return `${monthsA} a ${monthsB} meses`;
    }

    if (String(p).includes('min')) {
      const minN = Number(m[1]);
      const minU = String(m[2]).toLowerCase();
      const maxN = Number(m[3]);
      const maxU = String(m[4]).toLowerCase();
      const minM = unitToMonths_(minN, minU);
      const maxM = unitToMonths_(maxN, maxU);
      if (minM && maxM) return `mín ${minM} meses; máx ${maxM} meses`;
    } else {
      const a = Number(m[1]), b = Number(m[2]), u = String(m[3]).toLowerCase();
      const monthsA = unitToMonths_(a, u);
      const monthsB = unitToMonths_(b, u);
      if (monthsA && monthsB) return `${monthsA} a ${monthsB} meses`;
    }
  }

  const maxOnly = t.match(/\b(?:up to|até|no more than|maximum|max\.?)\s*(\d{1,3})\s*(months?|years?|meses?|anos?)\b/i);
  if (maxOnly) {
    const n = Number(maxOnly[1]);
    const u = String(maxOnly[2]).toLowerCase();
    const m = unitToMonths_(n, u);
    if (m) return `até ${m} meses`;
  }

  return '';
}

function unitToMonths_(n, unit) {
  if (!n || n <= 0) return 0;
  const u = String(unit || '').toLowerCase();
  if (u.startsWith('year') || u.startsWith('ano')) return n * 12;
  if (u.startsWith('month') || u.startsWith('mes') || u.startsWith('mês')) return n;
  return 0;
}

/***********************
PROJETO FIOCRUZ COM SINERGIA — label + fallback
***********************/
function findFiocruzSynergyFromLabel_(resumoText) {
  const lines = String(resumoText || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = String(raw || '').trim();
    const m = line.match(/^\s*Projeto\s+FIOCRUZ\s+com\s+sinergia\s*:\s*(.+)\s*$/i);
    if (m && m[1]) return m[1].trim();
  }
  const t = String(resumoText || '').replace(/\s+/g, ' ');
  const m2 = t.match(/Projeto\s+FIOCRUZ\s+com\s+sinergia\s*:\s*([^.\n]{3,250})/i);
  if (m2 && m2[1]) return m2[1].trim();
  return '';
}

function findFiocruzSynergyCandidate_(resumoText) {
  const t = String(resumoText || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';

  const patterns = [
    /(Fiocruz|FIOCRUZ)[^.]{0,240}\b(execut|realiz|coordena|conduz|desenvolv|implant|operacion|capacita|expande|estrutur|fortalece|cria)\b[^.]{0,300}\./i
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[0]) {
      const s = m[0].trim();
      return s.length > 340 ? s.slice(0, 340).trim() : s;
    }
  }
  return t.slice(0, 220).trim();
}

/***********************
VALORES — heurística + conversão
***********************/
function findValoresCandidate_(textoEdital, textoResumo) {
  const lines = (String(textoEdital || '') + '\n' + String(textoResumo || '')).split(/\r?\n/);
  const kw = /(budget|funding|grant|award|amount|up to|maximum|minim|range|total|valor|valores|orçamento|financiamento|montante|aporte|até|máximo|mínimo|faixa)/i;

  const currency = /(R\$|US\$|USD|EUR|€|£)\s?[\d.,]+/i;
  const brl = /\bR\$\s?[\d.\s]+(?:,\d{2})?\b/i;
  const numMoney = /\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (!kw.test(line)) continue;

    const window = [line, lines[i + 1] || ''].join(' ');
    if (currency.test(window) || brl.test(window) || numMoney.test(window)) {
      const snippet = window.replace(/\s+/g, ' ').trim();
      return snippet.length > 220 ? snippet.slice(0, 220).trim() : snippet;
    }
  }

  const full = lines.join(' ');
  const m = full.match(/.{0,60}(R\$|US\$|USD|EUR|€|£)\s?[\d.,]+.{0,80}/i);
  if (m && m[0]) {
    const s = m[0].replace(/\s+/g, ' ').trim();
    return s.length > 220 ? s.slice(0, 220).trim() : s;
  }
  return '';
}

function convertValoresToBRL_(valoresOrigHint) {
  const orig = String(valoresOrigHint || '').trim();
  if (!orig) return '';

  if (/R\$\s?[\d.\s]+(,\d{2})?/i.test(orig)) {
    const main = normalizeBrlString_(orig);
    const clean = orig.replace(/\s+/g, ' ').trim();
    return `${main} (${clean})`;
  }

  const parsed = parseCurrencyAmounts_(orig);
  if (!parsed || !parsed.currency || parsed.amounts.length === 0) return '';

  const rate = getFxRateToBRL_(parsed.currency);
  if (!rate) return '';

  const brlAmounts = parsed.amounts.map(a => Math.round(a * rate));
  const brlText = brlAmounts.length === 1
    ? `R$ ${formatIntPtBR_(brlAmounts[0])}`
    : `R$ ${formatIntPtBR_(Math.min.apply(null, brlAmounts))} a R$ ${formatIntPtBR_(Math.max.apply(null, brlAmounts))}`;

  const origClean = orig.replace(/\s+/g, ' ').trim();
  return `${brlText} (${origClean})`;
}

function normalizeValoresToBRLWithOriginal_(valoresOut, valoresOrigHint) {
  const out = String(valoresOut || '').trim();
  if (!out) return '';
  if (/\(.+\)/.test(out) && /R\$\s?\d/.test(out)) return out;

  const fromHint = convertValoresToBRL_(valoresOrigHint);
  if (fromHint) return fromHint;

  return out;
}

function parseCurrencyAmounts_(text) {
  const t = String(text || '');

  let currency = '';
  if (/US\$/.test(t) || /\bUSD\b/i.test(t)) currency = 'USD';
  else if (/\bEUR\b/i.test(t) || /€/.test(t)) currency = 'EUR';
  else if (/\bGBP\b/i.test(t) || /£/.test(t)) currency = 'GBP';
  else if (/\bBRL\b/i.test(t) || /R\$/.test(t)) currency = 'BRL';

  const nums = [];
  const re = /(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{1,9}(?:[.,]\d{2})?)/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const n = parseLocaleNumber_(m[1]);
    if (n && n > 0) nums.push(n);
    if (nums.length >= 4) break;
  }

  if (!currency || nums.length === 0) return null;

  const max = Math.max.apply(null, nums);
  const amounts = nums.filter(x => x >= max * 0.05);

  return { currency, amounts };
}

function parseLocaleNumber_(s) {
  const x = String(s || '').trim();
  if (!x) return 0;

  const hasDot = x.indexOf('.') >= 0;
  const hasComma = x.indexOf(',') >= 0;

  let normalized = x;

  if (hasDot && hasComma) {
    if (x.lastIndexOf(',') > x.lastIndexOf('.')) normalized = x.replace(/\./g, '').replace(',', '.');
    else normalized = x.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    if (x.match(/,\d{2}$/)) normalized = x.replace(',', '.');
    else normalized = x.replace(/,/g, '');
  } else if (hasDot && !hasComma) {
    if (x.match(/\.\d{2}$/)) normalized = x;
    else normalized = x.replace(/\./g, '');
  }

  const n = Number(normalized);
  return isFinite(n) ? n : 0;
}

function normalizeBrlString_(s) {
  const m = String(s || '').match(/R\$\s*([\d.\s]+(?:,\d{2})?)/i);
  if (!m) return String(s || '').trim();
  const n = parseLocaleNumber_(m[1]);
  if (!n) return String(s || '').trim();
  return `R$ ${formatIntPtBR_(Math.round(n))}`;
}

function formatIntPtBR_(n) {
  const s = String(Math.round(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/***********************
FX (moeda -> BRL)
***********************/
function getFxRateToBRL_(currency) {
  const c = String(currency || '').toUpperCase().trim();
  if (!c || c === 'BRL') return 1;

  const cache = CacheService.getScriptCache();
  const key = `FX_${c}_BRL`;
  const cached = cache.get(key);
  if (cached) return Number(cached) || 0;

  try {
    const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(c)}&symbols=BRL`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, timeout: 20000 });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) return 0;

    const data = JSON.parse(res.getContentText('UTF-8'));
    const rate = (((data || {}).rates || {}).BRL) || 0;
    if (!rate) return 0;

    cache.put(key, String(rate), CONFIG.FX_CACHE_HOURS * 3600);
    return Number(rate) || 0;
  } catch (e) {
    return 0;
  }
}

/***********************
CLAUDE — Editais
***********************/
function callClaudeExtract_(textoEdital, textoResumo, linkEdital, linkResumo, prazoHint, duracaoHint, valoresOrigHint, valoresBrlHint, sinergiaHint) {
  const apiKey = getClaudeApiKey_();
  if (!apiKey) throw new Error('Claude API Key não configurada. Use o menu Captação.');

  const system = buildSystemPrompt_();
  const user = buildUserPrompt_(textoEdital, textoResumo, linkEdital, linkResumo, prazoHint, duracaoHint, valoresOrigHint, valoresBrlHint, sinergiaHint);

  const raw = callAnthropicWithRetry_(apiKey, system, user);
  const json = extractJson_(raw);
  normalizePayload_(json);
  return json;
}

function buildSystemPrompt_() {
  return [
    'Extraia informações factuais a partir de texto de edital e/ou resumo executivo.',
    'Retorne APENAS JSON válido, sem markdown, sem texto fora do JSON.',
    'Se um campo não estiver explicitamente no texto, retorne string vazia.',
    'Não invente prazos, nomes, emails, nem valores.',
    'Prazo: retorne obrigatoriamente no formato DD/MM/AAAA quando houver data explícita.',
    'Tempo de duração: retorne mínimo e máximo quando houver, em meses (ex.: "6 a 24 meses", "mín 12 meses; máx 36 meses", "até 24 meses").',
    'Valores: retorne em reais (R$) e inclua o valor original do edital entre parênteses.',
    'Projeto FIOCRUZ com sinergia: use prioritariamente a linha do resumo executivo "Projeto FIOCRUZ com sinergia: ...".',
    '',
    'JSON esperado:',
    '{"nome_parceiro":"","nome_edital":"","tema_central":"","resumo_chamada":"","prazo":"","valores":"","tempo_duracao":"","projeto_fiocruz_com_sinergia":"","pesquisador_parceiro":"","email_pesquisador":""}'
  ].join('\n');
}

function buildUserPrompt_(textoEdital, textoResumo, linkEdital, linkResumo, prazoHint, duracaoHint, valoresOrigHint, valoresBrlHint, sinergiaHint) {
  return [
    'HINT_PRAZO_DDMMYYYY:',
    prazoHint || '[NENHUM]',
    '',
    'HINT_DURACAO:',
    duracaoHint || '[NENHUM]',
    '',
    'HINT_VALORES_ORIGINAL:',
    valoresOrigHint || '[NENHUM]',
    '',
    'HINT_VALORES_EM_BRL (se existir):',
    valoresBrlHint || '[NENHUM]',
    '',
    'HINT_SINERGIA_FIOCRUZ:',
    sinergiaHint || '[NENHUM]',
    '',
    'TEXTO_EDITAL:',
    textoEdital || '[VAZIO]',
    '',
    'TEXTO_RESUMO_EXECUTIVO:',
    textoResumo || '[VAZIO]',
    '',
    'LINK_EDITAL:',
    linkEdital || '[VAZIO]',
    '',
    'LINK_RESUMO_EXECUTIVO:',
    linkResumo || '[VAZIO]'
  ].join('\n');
}

function callAnthropicWithRetry_(apiKey, system, user) {
  const body = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: 1900,
    temperature: 0.2,
    system: system,
    messages: [{ role: 'user', content: user }]
  };

  let lastErr = '';
  for (let attempt = 1; attempt <= CONFIG.RETRY_MAX_ATTEMPTS; attempt++) {
    const res = UrlFetchApp.fetch(CONFIG.CLAUDE_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      timeout: CONFIG.REQUEST_TIMEOUT_MS
    });

    const code = res.getResponseCode();
    const txt = res.getContentText('UTF-8');

    if (code >= 200 && code < 300) {
      const parsed = JSON.parse(txt);
      const out = (((parsed || {}).content || [])[0] || {}).text;
      if (!out) throw new Error('Resposta vazia do Claude. HTTP=' + code + ' Trecho=' + txt.slice(0, 800));
      return out;
    }

    const isRetryable =
      code === 529 || code === 503 || code === 502 ||
      /overloaded/i.test(txt) || /tempor/i.test(txt);

    lastErr = 'HTTP=' + code + ' Trecho=' + txt.slice(0, 800);

    if (!isRetryable || attempt === CONFIG.RETRY_MAX_ATTEMPTS) {
      throw new Error('Falha na API do Claude. ' + lastErr);
    }

    const sleepMs = CONFIG.RETRY_BASE_SLEEP_MS * Math.pow(2, attempt - 1);
    Utilities.sleep(sleepMs);
  }

  throw new Error('Falha na API do Claude. ' + lastErr);
}

function extractJson_(raw) {
  const s = String(raw || '').trim();
  if (s.startsWith('{') && s.endsWith('}')) return JSON.parse(s);
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Não encontrei JSON na resposta do Claude. Trecho: ' + s.slice(0, 800));
  return JSON.parse(m[0]);
}

function normalizePayload_(obj) {
  const keys = [
    'nome_parceiro',
    'nome_edital',
    'tema_central',
    'resumo_chamada',
    'prazo',
    'valores',
    'tempo_duracao',
    'projeto_fiocruz_com_sinergia',
    'pesquisador_parceiro',
    'email_pesquisador'
  ];

  keys.forEach(k => {
    if (!(k in obj)) obj[k] = '';
    if (obj[k] === null || obj[k] === undefined) obj[k] = '';
    obj[k] = String(obj[k]).trim();
  });

  obj.prazo = normalizeDateToDDMMYYYY_(obj.prazo);
  obj.email_pesquisador = normalizeEmail_(obj.email_pesquisador);
}

/***********************
CLAUDE — Organizações
***********************/
function callClaudeOrgProfileExtract_(website, orgText) {
  const apiKey = getClaudeApiKey_();
  if (!apiKey) throw new Error('Claude API Key não configurada. Use o menu Captação.');

  const system = [
    'Extraia um perfil factual de uma organização financiadora a partir do texto do site.',
    'Retorne APENAS JSON válido, sem markdown, sem texto fora do JSON.',
    'Use apenas o que estiver no texto fornecido.',
    'Se um campo não estiver explícito, retorne string vazia.',
    'Não invente países, contatos, modalidades ou valores.',
    '',
    'Contexto para Sinergia com a Fiocruz (use como critério, mas não invente fatos):',
    FIOCRUZ_CONTEXT_PT,
    '',
    'JSON esperado:',
    '{"organizacao":"","sinergia":"","prioridades_programaticas":"","acesso_por":"","tipo_de_projeto_apoiado":"","regiao_de_financiamento":"","porte_de_financiamento":"","contato_cargo":"","endereco_de_contato":"","pais_de_origem":"","website":""}'
  ].join('\n');

  const user = [
    'WEBSITE:',
    website || '[VAZIO]',
    '',
    'TEXTO_SITE:',
    orgText || '[VAZIO]'
  ].join('\n');

  const raw = callAnthropicWithRetry_(apiKey, system, user);
  const json = extractJson_(raw);

  const keys = [
    'organizacao',
    'sinergia',
    'prioridades_programaticas',
    'acesso_por',
    'tipo_de_projeto_apoiado',
    'regiao_de_financiamento',
    'porte_de_financiamento',
    'contato_cargo',
    'endereco_de_contato',
    'pais_de_origem',
    'website'
  ];

  keys.forEach(k => {
    if (!(k in json)) json[k] = '';
    if (json[k] === null || json[k] === undefined) json[k] = '';
    json[k] = String(json[k]).trim();
  });

  if (!json.website) json.website = String(website || '').trim();

  return json;
}

/***********************
CLAUDE — Portfólio
***********************/
function callClaudePortfolioExtract_(sourceUrl, sourceText) {
  const apiKey = getClaudeApiKey_();
  if (!apiKey) throw new Error('Claude API Key não configurada. Use o menu Captação.');

  const system = [
    'Extraia informações factuais de um projeto Fiocruz a partir do texto de uma página online.',
    'Retorne APENAS JSON válido, sem markdown, sem texto fora do JSON.',
    'Use apenas o que estiver no texto fornecido.',
    'Se um campo não estiver explícito, retorne string vazia.',
    'Não invente nomes, emails, telefones, unidade, valores, parceiros ou financiadores.',
    '',
    'JSON esperado:',
    '{"nome_do_projeto":"","breve_descricao":"","pesquisador_responsavel":"","email":"","telefone":"","unidade_fiocruz":"","abrangencia_geografica":"","parceiros":"","financiadores":"","valor_captado":""}'
  ].join('\n');

  const user = [
    'SOURCE_URL:',
    sourceUrl || '[VAZIO]',
    '',
    'TEXTO_FONTE:',
    truncate_(sourceText || '[VAZIO]', CONFIG.MAX_CHARS_PER_SOURCE)
  ].join('\n');

  const raw = callAnthropicWithRetry_(apiKey, system, user);
  const json = extractJson_(raw);

  const keys = [
    'nome_do_projeto',
    'breve_descricao',
    'pesquisador_responsavel',
    'email',
    'telefone',
    'unidade_fiocruz',
    'abrangencia_geografica',
    'parceiros',
    'financiadores',
    'valor_captado'
  ];

  keys.forEach(k => {
    if (!(k in json)) json[k] = '';
    if (json[k] === null || json[k] === undefined) json[k] = '';
    json[k] = String(json[k]).trim();
  });

  json.email = normalizeEmail_(json.email);
  json.telefone = normalizeTelefone_(json.telefone);

  return json;
}

function normalizeTelefone_(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/(\+\d{1,3}\s?)?(\(?\d{2,3}\)?\s?)?\d{4,5}[-\s]?\d{4}/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

/***********************
Normalizações auxiliares
***********************/
function normalizeDateToDDMMYYYY_(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;

  const dd = extractDateDDMMYYYY_(t);
  if (dd) return dd;

  const en = extractDateFromEnglishMonthToDDMMYYYY_(t);
  if (en) return en;

  return '';
}

function normalizeEmail_(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

/***********************
SHEET UTILS
***********************/
function getEditaisSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getActiveSheet();
}

function getOrganizationsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.ORG_SHEET_NAME);
  if (!sh) throw new Error('Aba "' + CONFIG.ORG_SHEET_NAME + '" não encontrada. Execute Organizações → Criar/garantir aba.');
  return sh;
}

function getPortfolioSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.PORTFOLIO_SHEET_NAME);
  if (!sh) throw new Error('Aba "' + CONFIG.PORTFOLIO_SHEET_NAME + '" não encontrada. Execute Portfólio → Criar/garantir aba.');
  return sh;
}

function getEditaisHeaderMap_(sheet, headerRow) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, idx) => {
    const key = String(h || '').trim();
    if (key) map[key] = idx + 1;
  });

  const required = [HEADERS.linkEdital, HEADERS.linkResumo];
  required.forEach(r => {
    if (!map[r]) throw new Error('Cabeçalho não encontrado: "' + r + '". Verifique a linha de cabeçalho.');
  });

  return map;
}

function getOrgHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(CONFIG.ORG_HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, idx) => {
    const key = String(h || '').trim();
    if (key) map[key] = idx + 1;
  });

  const required = [ORG_HEADERS.website, ORG_HEADERS.organizacao];
  required.forEach(r => {
    if (!map[r]) throw new Error('Cabeçalho não encontrado (Organizações): "' + r + '".');
  });

  return map;
}

function getPortfolioHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(CONFIG.PORTFOLIO_HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, idx) => {
    const key = String(h || '').trim();
    if (key) map[key] = idx + 1;
  });

  const required = [PORT_HEADERS.infoOnline, PORT_HEADERS.nomeProjeto];
  required.forEach(r => {
    if (!map[r]) throw new Error('Cabeçalho não encontrado (Portfólio): "' + r + '".');
  });

  return map;
}

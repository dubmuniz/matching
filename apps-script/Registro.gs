/**
 * Registro.gs — gravação na aba Demandas e e-mails (seção 9).
 *
 * - A aba Demandas é criada se não existir. As colunas são localizadas pelo nome.
 * - Texto do usuário gravado na planilha é protegido contra fórmulas (=, +, -, @).
 * - Todo texto do usuário ou da IA é escapado no HTML dos e-mails.
 * - Cópia ao pesquisador só para domínios em DOMINIOS_COPIA, e sem link da planilha.
 * - Falhas aqui NÃO impedem a resposta ao usuário: o chamador (Codigo.gs) captura e registra.
 *
 * As funções puras usam globais de outros arquivos (PROMPT_VERSAO, top3Texto...), por isso são
 * testadas carregando todos os .gs juntos (tests/apps-script.test.js e tests/registro.test.js).
 */

var CABECALHO_DEMANDAS = [
  'Data/hora', 'ID demanda', 'Nome', 'E-mail', 'Unidade', 'Título', 'Resumo', 'Problema', 'Objetivos',
  'Áreas', 'Abrangência', 'Maturidade', 'Valor estimado', 'Horizonte', 'Parceiros', 'Idiomas',
  'Resultado (JSON)', 'Top 3 (texto)', 'Versão do prompt', 'Status triagem',
  'Edital avaliado'   // coluna nova (à direita): preenchida só na avaliação de um edital escolhido
];
var STATUS_TRIAGEM_INICIAL = 'Nova';
var LIMITE_CELULA_ = 49000; // o Sheets aceita até 50.000 caracteres por célula

var AVISO_IA_ =
  'Sugestões geradas com apoio de IA a partir da base curada pelo Escritório de Captação. ' +
  'Não constituem decisão institucional. O Escritório entrará em contato.';

/* =====================================================================
 * Funções puras
 * ===================================================================== */

/** Evita que texto do usuário vire fórmula na planilha e limita o tamanho. */
function protegerCelula(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  var s = v.length > LIMITE_CELULA_ ? v.slice(0, LIMITE_CELULA_) + '…' : v;
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function escaparHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nomeDaUnidade(demanda) {
  return demanda.unidade === 'Outra' ? ('Outra: ' + demanda.unidadeOutra) : demanda.unidade;
}

/** 'DEM-aaaammdd-xxxx'. `aleatorio` deve ter ao menos 4 caracteres [A-Za-z0-9]. */
function gerarIdDemanda(dataAAAAMMDD, aleatorio) {
  var sufixo = String(aleatorio || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
  return 'DEM-' + dataAAAAMMDD + '-' + sufixo;
}

/**
 * Valores da linha, na ordem de CABECALHO_DEMANDAS.
 * @param {Object|null} resultado  saída de montarResultado(), ou null se a IA falhou
 * @param {{ versaoPrompt?: string, editalAvaliado?: string }} opcoes
 */
function montarLinhaDemanda(dataHora, idDemanda, demanda, resultado, erroIA, opcoes) {
  opcoes = opcoes || {};
  var valores = {
    'Data/hora': dataHora,
    'ID demanda': idDemanda,
    'Nome': demanda.nome,
    'E-mail': demanda.email,
    'Unidade': nomeDaUnidade(demanda),
    'Título': demanda.titulo,
    'Resumo': demanda.resumo,
    'Problema': demanda.problema,
    'Objetivos': demanda.objetivos,
    'Áreas': (demanda.areas || []).join('; '),
    'Abrangência': demanda.abrangencia,
    'Maturidade': demanda.maturidade,
    'Valor estimado': demanda.valorEstimado,
    'Horizonte': demanda.horizonte,
    'Parceiros': demanda.parceiros,
    'Idiomas': (demanda.idiomas || []).join('; '),
    'Resultado (JSON)': resultado ? JSON.stringify(resultado) : ('ERRO NA IA: ' + (erroIA || 'desconhecido')),
    'Top 3 (texto)': resultado ? top3Texto(resultado) : '—',
    'Versão do prompt': opcoes.versaoPrompt || PROMPT_VERSAO,
    'Status triagem': STATUS_TRIAGEM_INICIAL,
    'Edital avaliado': opcoes.editalAvaliado || ''
  };
  return CABECALHO_DEMANDAS.map(function (c) { return protegerCelula(valores[c]); });
}

function htmlCard_(c) {
  var linhas = [];
  linhas.push('<p style="margin:12px 0 4px"><strong>[' + c.nota + ' · ' + escaparHtml(c.selo) + '] ' +
    escaparHtml(tituloDoCard(c)) + '</strong>' + (c.id ? ' <span style="color:#555">(' + escaparHtml(c.id) + ')</span>' : '') + '</p>');
  var detalhes = [];
  if (c.tipo === 'oportunidade') {
    detalhes.push(escaparHtml(c.prazo_texto));
    if (c.valores) detalhes.push('Valores: ' + escaparHtml(c.valores));
    if (c.duracao) detalhes.push('Duração: ' + escaparHtml(c.duracao));
  } else if (c.pais) {
    detalhes.push('País: ' + escaparHtml(c.pais));
  }
  detalhes.push('Integridade: ' + escaparHtml(c.integridade) + (c.integridade_aviso ? ' (sujeito à triagem do Escritório)' : ''));
  if (c.via_governanca) detalhes.push('Via: ' + escaparHtml(c.via_governanca));
  linhas.push('<p style="margin:0 0 4px;color:#333">' + detalhes.join(' · ') + '</p>');
  linhas.push('<p style="margin:0 0 4px"><em>Por que combina:</em> ' + escaparHtml(c.por_que_combina) + '</p>');
  if (c.tipo === 'oportunidade') {
    if (c.lacunas_e_riscos) linhas.push('<p style="margin:0 0 4px"><em>Lacunas e riscos:</em> ' + escaparHtml(c.lacunas_e_riscos) + '</p>');
    if (c.requisitos_criticos && c.requisitos_criticos.length) {
      linhas.push('<p style="margin:0 0 4px"><em>Requisitos críticos:</em> ' + c.requisitos_criticos.map(escaparHtml).join('; ') + '</p>');
    }
    if (c.proximo_passo) linhas.push('<p style="margin:0 0 4px"><em>Próximo passo:</em> ' + escaparHtml(c.proximo_passo) + '</p>');
  } else if (c.como_abordar) {
    linhas.push('<p style="margin:0 0 4px"><em>Como abordar:</em> ' + escaparHtml(c.como_abordar) + '</p>');
  }
  var link = c.link_edital || c.website;
  if (link) linhas.push('<p style="margin:0 0 4px"><a href="' + escaparHtml(link) + '">' + (c.link_edital ? 'Ver edital' : 'Website') + '</a></p>');
  return linhas.join('\n');
}

function textoCard_(c) {
  var partes = ['[' + c.nota + ' · ' + c.selo + '] ' + tituloDoCard(c) + (c.id ? ' (' + c.id + ')' : '')];
  if (c.tipo === 'oportunidade') partes.push('   ' + c.prazo_texto);
  partes.push('   Por que combina: ' + c.por_que_combina);
  var link = c.link_edital || c.website;
  if (link) partes.push('   ' + link);
  return partes.join('\n');
}

function htmlResultado_(resultado, erroIA) {
  if (!resultado) {
    return '<p><strong>A análise por IA falhou</strong> e não gerou sugestões. A demanda precisa de análise manual.</p>';
  }
  var partes = [];
  if (resultado.resumo_demanda) partes.push('<p><strong>Resumo (IA):</strong> ' + escaparHtml(resultado.resumo_demanda) + '</p>');
  if (resultado.lacunas_da_demanda.length) {
    partes.push('<p><strong>Para fortalecer sua candidatura:</strong></p><ul>' +
      resultado.lacunas_da_demanda.map(function (l) { return '<li>' + escaparHtml(l) + '</li>'; }).join('') + '</ul>');
  }
  var top = melhoresCards(resultado, 5);
  if (top.length) {
    partes.push('<h3 style="margin:16px 0 0">Melhores correspondências</h3>');
    top.forEach(function (c) { partes.push(htmlCard_(c)); });
  } else {
    partes.push('<p>' + escaparHtml(MENSAGEM_SEM_RESULTADOS) + '</p>');
  }
  return partes.join('\n');
}

function linhaTabela_(rotulo, valor) {
  return '<tr><td style="padding:2px 8px 2px 0;vertical-align:top;color:#555;white-space:nowrap">' + escaparHtml(rotulo) +
    '</td><td style="padding:2px 0;white-space:pre-wrap">' + escaparHtml(valor) + '</td></tr>';
}

/**
 * E-mail ao Escritório: dados completos da demanda, 5 melhores cards e link para a planilha.
 * @param {{ editalAvaliado?: string }} opcoes  avaliação de um edital escolhido pelo pesquisador
 */
function montarEmailEscritorio(demanda, idDemanda, resultado, urlPlanilha, erroIA, opcoes) {
  var avaliado = (opcoes && opcoes.editalAvaliado) || '';
  var assunto = ((avaliado ? '[Fioconecta] Avaliação de edital: ' : '[Fioconecta] Nova demanda: ') +
    demanda.titulo + ' — ' + nomeDaUnidade(demanda))
    .replace(/[\r\n]+/g, ' ').slice(0, 250);
  var html = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#222;max-width:720px">',
    '<h2 style="margin:0 0 8px">' + (avaliado ? 'Avaliação de edital ' : 'Nova demanda ') + escaparHtml(idDemanda) + '</h2>',
    '<table style="border-collapse:collapse">',
    avaliado ? linhaTabela_('Edital avaliado', avaliado) : '',
    linhaTabela_('Nome', demanda.nome),
    linhaTabela_('E-mail', demanda.email),
    linhaTabela_('Unidade', nomeDaUnidade(demanda)),
    linhaTabela_('Título', demanda.titulo),
    linhaTabela_('Resumo', demanda.resumo),
    linhaTabela_('Problema', demanda.problema),
    linhaTabela_('Objetivos', demanda.objetivos),
    linhaTabela_('Áreas', (demanda.areas || []).join('; ')),
    linhaTabela_('Abrangência', demanda.abrangencia),
    linhaTabela_('Maturidade', demanda.maturidade),
    linhaTabela_('Valor estimado', demanda.valorEstimado),
    linhaTabela_('Horizonte', demanda.horizonte),
    linhaTabela_('Parceiros', demanda.parceiros || '—'),
    linhaTabela_('Idiomas', (demanda.idiomas || []).join('; ')),
    '</table>',
    '<hr style="margin:16px 0">',
    htmlResultado_(resultado, erroIA),
    '<hr style="margin:16px 0">',
    urlPlanilha ? '<p><a href="' + escaparHtml(urlPlanilha) + '">Abrir a planilha (aba Demandas)</a></p>' : '',
    '<p style="color:#666;font-size:12px">Prompt ' + escaparHtml(PROMPT_VERSAO) + '. ' + escaparHtml(AVISO_IA_) + '</p>',
    '</div>'
  ].join('\n');

  var texto = [
    (avaliado ? 'Avaliação de edital ' : 'Nova demanda ') + idDemanda,
    avaliado ? 'Edital avaliado: ' + avaliado : '',
    'Nome: ' + demanda.nome,
    'E-mail: ' + demanda.email,
    'Unidade: ' + nomeDaUnidade(demanda),
    'Título: ' + demanda.titulo,
    '',
    resultado ? melhoresCards(resultado, 5).map(textoCard_).join('\n\n') || MENSAGEM_SEM_RESULTADOS
      : 'A análise por IA falhou. A demanda precisa de análise manual.',
    '',
    urlPlanilha ? 'Planilha: ' + urlPlanilha : ''
  ].join('\n');

  return { assunto: assunto, html: html, texto: texto };
}

/** Cópia ao pesquisador: sem link da planilha e sem dados internos. */
function montarEmailPesquisador(demanda, idDemanda, resultado) {
  var assunto = ('[Fioconecta] Recebemos sua demanda: ' + demanda.titulo).replace(/[\r\n]+/g, ' ').slice(0, 250);
  var html = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#222;max-width:720px">',
    '<p>Olá, ' + escaparHtml(demanda.nome) + '.</p>',
    '<p>O Escritório de Captação recebeu sua demanda <strong>' + escaparHtml(demanda.titulo) + '</strong> ' +
      '(protocolo ' + escaparHtml(idDemanda) + ') e entrará em contato.</p>',
    resultado ? htmlResultado_(resultado) : '<p>As sugestões automáticas não puderam ser geradas agora; o Escritório fará uma análise manual.</p>',
    '<p style="color:#666;font-size:12px">' + escaparHtml(AVISO_IA_) + '</p>',
    '</div>'
  ].join('\n');
  var texto = [
    'Olá, ' + demanda.nome + '.',
    'O Escritório de Captação recebeu sua demanda "' + demanda.titulo + '" (protocolo ' + idDemanda + ') e entrará em contato.',
    '',
    resultado ? (melhoresCards(resultado, 5).map(textoCard_).join('\n\n') || MENSAGEM_SEM_RESULTADOS) : '',
    '',
    AVISO_IA_
  ].join('\n');
  return { assunto: assunto, html: html, texto: texto };
}

/* =====================================================================
 * Funções com Apps Script
 * ===================================================================== */

/** Abre a aba Demandas; cria (com cabeçalho) se não existir. */
function obterAbaDemandas_(ss) {
  var sh = ss.getSheetByName(CONFIG_MATCHING.ABA_DEMANDAS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_MATCHING.ABA_DEMANDAS);
    sh.getRange(1, 1, 1, CABECALHO_DEMANDAS.length).setValues([CABECALHO_DEMANDAS]);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CABECALHO_DEMANDAS.length).setValues([CABECALHO_DEMANDAS]);
  }
  return sh;
}

/**
 * Grava uma linha na aba Demandas. Respeita a ordem atual das colunas (localizadas pelo nome).
 * Colunas novas do cabeçalho padrão (ex.: 'Edital avaliado') que ainda não existam na aba
 * são criadas à direita das existentes.
 */
function registrarDemanda_(ss, linhaPadrao) {
  var sh = obterAbaDemandas_(ss);
  var ultimaCol = Math.max(sh.getLastColumn(), 1);
  var indice = mapearCabecalhos(sh.getRange(1, 1, 1, ultimaCol).getDisplayValues()[0]);
  CABECALHO_DEMANDAS.forEach(function (nome) {
    if (indice[normalizarCabecalho(nome)]) return;
    ultimaCol++;
    sh.getRange(1, ultimaCol).setValue(nome);
    indice[normalizarCabecalho(nome)] = ultimaCol;
  });
  var linha = new Array(ultimaCol);
  for (var i = 0; i < ultimaCol; i++) linha[i] = '';
  CABECALHO_DEMANDAS.forEach(function (nome, i) {
    var col = indice[normalizarCabecalho(nome)];
    if (col) linha[col - 1] = linhaPadrao[i];
  });
  sh.appendRow(linha);
}

/**
 * @param {{ editalAvaliado?: string }} opcoes  na avaliação de um edital escolhido não há cópia ao
 *   pesquisador (ele vê o resultado na tela e pode avaliar vários editais por dia)
 */
function enviarEmails_(cfg, demanda, idDemanda, resultado, erroIA, opcoes) {
  opcoes = opcoes || {};
  if (cfg.escritorioEmail) {
    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(cfg.spreadsheetId) + '/edit';
    var e1 = montarEmailEscritorio(demanda, idDemanda, resultado, url, erroIA, opcoes);
    MailApp.sendEmail({
      to: cfg.escritorioEmail,
      subject: e1.assunto,
      body: e1.texto,
      htmlBody: e1.html,
      name: 'Fioconecta Matching',
      replyTo: demanda.email
    });
  } else {
    console.error('ESCRITORIO_EMAIL não configurado: e-mail ao Escritório não enviado.');
  }

  if (!opcoes.editalAvaliado && dominioPermitidoParaCopia(demanda.email, cfg.dominiosCopia)) {
    var e2 = montarEmailPesquisador(demanda, idDemanda, resultado);
    MailApp.sendEmail({
      to: demanda.email,
      subject: e2.assunto,
      body: e2.texto,
      htmlBody: e2.html,
      name: 'Fioconecta Matching'
    });
  }
}

/**
 * Planilha.gs — leitura das abas Oportunidades e Organizações, junção e filtros.
 *
 * Regras:
 * - colunas localizadas pelo NOME do cabeçalho (linha 1), nunca pela posição;
 * - só as colunas listadas abaixo são lidas; colunas INTERNAS nunca são lidas;
 * - a aba Portfólio nunca é lida;
 * - colunas novas ausentes usam valores padrão.
 *
 * As funções puras (sem Apps Script) ficam no fim do arquivo e são exportadas
 * para os testes Node em tests/planilha.test.js.
 */

// Colunas lidas em Oportunidades (campo → cabeçalho exato).
var COLUNAS_OPORTUNIDADES = {
  financiador: 'Nome do parceiro',
  edital: 'Nome do edital',
  tema: 'Tema central',
  resumo: 'Resumo da chamada',
  prazo: 'Prazo',
  valores: 'Valores',
  duracao: 'Tempo de duração',
  sinergia: 'Projeto FIOCRUZ com sinergia',
  linkEdital: 'Link do edital',
  id: 'ID',                              // coluna nova (opcional)
  ativo: 'Ativo no matching'             // coluna nova (opcional)
};
var OBRIGATORIAS_OPORTUNIDADES = ['financiador', 'edital'];
var NOVAS_OPORTUNIDADES = ['id', 'ativo'];

// Colunas lidas em Organizações (campo → cabeçalho exato).
var COLUNAS_ORGANIZACOES = {
  organizacao: 'Organização',
  sinergia: 'Sinergia',
  prioridades: 'Prioridades programáticas',
  acesso: 'Acesso por',
  tipoApoio: 'Tipo de projeto apoiado',
  regiao: 'Região de Financiamento',
  porte: 'Porte de financiamento',
  pais: 'País de origem',
  website: 'Website',
  integridade: 'Status de integridade',  // coluna nova (opcional)
  via: 'Via de governança'               // coluna nova (opcional)
};
var OBRIGATORIAS_ORGANIZACOES = ['organizacao'];
var NOVAS_ORGANIZACOES = ['integridade', 'via'];

var VALORES_INTEGRIDADE = ['Permitido', 'Análise reforçada', 'Vedado', 'Não avaliado'];
var VALORES_VIA = ['Captação direta', 'Orientação institucional', 'A definir'];
var INTEGRIDADE_PADRAO = 'Não avaliado';
var VIA_PADRAO = 'A definir';

/* =====================================================================
 * Funções com Apps Script
 * ===================================================================== */

function abrirPlanilhaMatching_(cfg) {
  return SpreadsheetApp.openById(cfg.spreadsheetId);
}

function obterAbaMatching_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada na planilha.');
  return sh;
}

/**
 * Lê só as colunas pedidas de uma aba.
 * @param {Object} colunas  campo → cabeçalho
 * @param {Object} opcoes   { datas: [campos], links: [campos] }
 * @return {{ linhas: Object[], ausentes: string[] }}
 *   Cada linha: { linha: nº da linha na planilha, <campo>: valor }.
 *   Campos em `datas` trazem a data como 'dd/MM/yyyy' (fuso da planilha) quando a célula é data nativa.
 *   Campos em `links` trazem a URL do hiperlink (RichText) ou o texto da célula.
 */
function lerColunasPorCabecalho_(sheet, colunas, opcoes) {
  opcoes = opcoes || {};
  var linhaCab = CONFIG_MATCHING.LINHA_CABECALHO;
  var ultimaCol = sheet.getLastColumn();
  var ultimaLinha = sheet.getLastRow();
  var cabecalhos = ultimaCol > 0 ? sheet.getRange(linhaCab, 1, 1, ultimaCol).getDisplayValues()[0] : [];
  var indice = mapearCabecalhos(cabecalhos);

  var ausentes = [];
  var posicoes = {};
  Object.keys(colunas).forEach(function (campo) {
    var col = indice[normalizarCabecalho(colunas[campo])];
    if (col) posicoes[campo] = col;
    else ausentes.push(campo);
  });

  var n = ultimaLinha - linhaCab;
  var linhas = [];
  if (n <= 0) return { linhas: linhas, ausentes: ausentes };

  var fuso = sheet.getParent().getSpreadsheetTimeZone();
  var datas = opcoes.datas || [];
  var links = opcoes.links || [];
  var colunasLidas = {};

  Object.keys(posicoes).forEach(function (campo) {
    var range = sheet.getRange(linhaCab + 1, posicoes[campo], n, 1);
    var exibidos = range.getDisplayValues();
    var saida = new Array(n);

    if (datas.indexOf(campo) >= 0) {
      var valores = range.getValues();
      for (var i = 0; i < n; i++) {
        var v = valores[i][0];
        saida[i] = (v instanceof Date) ? Utilities.formatDate(v, fuso, 'dd/MM/yyyy') : String(exibidos[i][0] || '');
      }
    } else if (links.indexOf(campo) >= 0) {
      var ricos = range.getRichTextValues();
      for (var j = 0; j < n; j++) {
        saida[j] = urlDoTextoRico_(ricos[j][0]) || String(exibidos[j][0] || '');
      }
    } else {
      for (var k = 0; k < n; k++) saida[k] = String(exibidos[k][0] || '');
    }
    colunasLidas[campo] = saida;
  });

  for (var r = 0; r < n; r++) {
    var obj = { linha: linhaCab + 1 + r };
    Object.keys(colunas).forEach(function (campo) {
      obj[campo] = colunasLidas[campo] ? String(colunasLidas[campo][r]).trim() : '';
    });
    linhas.push(obj);
  }
  return { linhas: linhas, ausentes: ausentes };
}

/** URL de um RichTextValue: link da célula inteira ou do primeiro trecho com link. */
function urlDoTextoRico_(rt) {
  if (!rt) return '';
  var url = rt.getLinkUrl();
  if (url) return String(url).trim();
  var trechos = rt.getRuns() || [];
  for (var i = 0; i < trechos.length; i++) {
    var u = trechos[i].getLinkUrl();
    if (u) return String(u).trim();
  }
  return '';
}

/**
 * Carrega a base completa para o matching.
 * @return {{
 *   oportunidades: Object[],   // todas as válidas, já juntadas e com prazo classificado
 *   candidatos: Object[],      // ativas e não vedadas
 *   organizacoes: Object[],    // todas com nome
 *   organizacoesParaIA: Object[], // sem as vedadas
 *   diagnostico: Object
 * }}
 */
function carregarBaseMatching_(cfg, hoje) {
  var ss = abrirPlanilhaMatching_(cfg);

  var lidoOpp = lerColunasPorCabecalho_(
    obterAbaMatching_(ss, CONFIG_MATCHING.ABA_OPORTUNIDADES),
    COLUNAS_OPORTUNIDADES,
    { datas: ['prazo'], links: ['linkEdital'] }
  );
  var lidoOrg = lerColunasPorCabecalho_(
    obterAbaMatching_(ss, CONFIG_MATCHING.ABA_ORGANIZACOES),
    COLUNAS_ORGANIZACOES,
    { links: ['website'] }
  );

  verificarObrigatorias_(lidoOpp.ausentes, OBRIGATORIAS_OPORTUNIDADES, COLUNAS_OPORTUNIDADES, CONFIG_MATCHING.ABA_OPORTUNIDADES);
  verificarObrigatorias_(lidoOrg.ausentes, OBRIGATORIAS_ORGANIZACOES, COLUNAS_ORGANIZACOES, CONFIG_MATCHING.ABA_ORGANIZACOES);

  var prepOpp = prepararOportunidades(lidoOpp.linhas);
  var prepOrg = prepararOrganizacoes(lidoOrg.linhas);
  var juncao = juntarOportunidadesOrganizacoes(prepOpp.oportunidades, prepOrg.organizacoes);

  juncao.oportunidades.forEach(function (o) {
    o.prazo = classificarPrazo(o.prazoBruto, hoje, cfg.minDiasPrazo);
  });

  var filtro = filtrarCandidatos(juncao.oportunidades);

  return {
    oportunidades: juncao.oportunidades,
    candidatos: filtro.candidatos,
    organizacoes: prepOrg.organizacoes,
    organizacoesParaIA: prepOrg.organizacoes.filter(function (g) { return g.integridade !== 'Vedado'; }),
    diagnostico: {
      localidade: ss.getSpreadsheetLocale(),
      fuso: ss.getSpreadsheetTimeZone(),
      colunasAusentesOportunidades: lidoOpp.ausentes.map(function (c) { return COLUNAS_OPORTUNIDADES[c]; }),
      colunasAusentesOrganizacoes: lidoOrg.ausentes.map(function (c) { return COLUNAS_ORGANIZACOES[c]; }),
      linhasIgnoradas: prepOpp.ignoradas,
      linhasIncompletas: prepOpp.incompletas,
      idsTemporarios: prepOpp.idsTemporarios,
      idsDuplicados: prepOpp.idsDuplicados,
      valoresAtivoDesconhecidos: prepOpp.valoresAtivoDesconhecidos,
      linksInvalidos: prepOpp.linksInvalidos,
      organizacoesDuplicadas: prepOrg.duplicadas,
      valoresIntegridadeDesconhecidos: prepOrg.integridadeDesconhecidos,
      valoresViaDesconhecidos: prepOrg.viaDesconhecidos,
      semFinanciador: juncao.semCorrespondencia,
      inativas: filtro.inativas,
      vedadas: filtro.vedadas
    }
  };
}

function verificarObrigatorias_(ausentes, obrigatorias, colunas, aba) {
  var faltando = obrigatorias.filter(function (c) { return ausentes.indexOf(c) >= 0; });
  if (faltando.length) {
    throw new Error('Aba "' + aba + '": cabeçalho obrigatório não encontrado: ' +
      faltando.map(function (c) { return '"' + colunas[c] + '"'; }).join(', '));
  }
}

/**
 * Preenche os IDs vazios da aba Oportunidades (OPP-0001, OPP-0002...).
 * Rode manualmente pelo editor. Nunca é chamada pelo doPost.
 * Só preenche linhas que tenham Nome do edital ou Nome do parceiro; não altera IDs existentes.
 */
function gerarIdsOportunidades() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra execução está em andamento. Tente de novo em instantes.');
  try {
    var cfg = obterConfigMatching_();
    var sheet = obterAbaMatching_(abrirPlanilhaMatching_(cfg), CONFIG_MATCHING.ABA_OPORTUNIDADES);
    var linhaCab = CONFIG_MATCHING.LINHA_CABECALHO;
    var ultimaCol = sheet.getLastColumn();
    var indice = mapearCabecalhos(sheet.getRange(linhaCab, 1, 1, ultimaCol).getDisplayValues()[0]);

    var colId = indice[normalizarCabecalho(COLUNAS_OPORTUNIDADES.id)];
    var colEdital = indice[normalizarCabecalho(COLUNAS_OPORTUNIDADES.edital)];
    var colParceiro = indice[normalizarCabecalho(COLUNAS_OPORTUNIDADES.financiador)];
    if (!colId) throw new Error('Coluna "ID" não encontrada em ' + CONFIG_MATCHING.ABA_OPORTUNIDADES + '. Crie-a à direita de "Link do resumo executivo".');
    if (!colEdital || !colParceiro) throw new Error('Colunas "Nome do edital" e "Nome do parceiro" são obrigatórias.');

    var n = sheet.getLastRow() - linhaCab;
    if (n <= 0) { console.log('Nenhuma linha de dados.'); return; }

    var rangeId = sheet.getRange(linhaCab + 1, colId, n, 1);
    var ids = rangeId.getDisplayValues().map(function (l) { return l[0]; });
    var editais = sheet.getRange(linhaCab + 1, colEdital, n, 1).getDisplayValues().map(function (l) { return l[0]; });
    var parceiros = sheet.getRange(linhaCab + 1, colParceiro, n, 1).getDisplayValues().map(function (l) { return l[0]; });

    var resultado = preencherIdsVazios(ids, editais, parceiros);
    if (!resultado.novos.length) {
      console.log('Nenhum ID vazio a preencher.');
      return;
    }
    // Grava só as células que estavam vazias.
    resultado.novos.forEach(function (novo) {
      sheet.getRange(linhaCab + 1 + novo.indice, colId).setValue(novo.id);
    });
    console.log('IDs gerados: ' + resultado.novos.length + ' (' +
      resultado.novos[0].id + ' a ' + resultado.novos[resultado.novos.length - 1].id + ')');
  } finally {
    trava.releaseLock();
  }
}

/* =====================================================================
 * Funções puras (testáveis no Node)
 * ===================================================================== */

function removerAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normaliza um cabeçalho para comparação: minúsculas, sem acentos, espaços simples. */
function normalizarCabecalho(s) {
  return removerAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** cabeçalhos (array) → { cabecalhoNormalizado: nº da coluna (1-based) }. Em caso de repetição, vale a primeira. */
function mapearCabecalhos(cabecalhos) {
  var mapa = {};
  (cabecalhos || []).forEach(function (h, i) {
    var k = normalizarCabecalho(h);
    if (k && !mapa[k]) mapa[k] = i + 1;
  });
  return mapa;
}

var PALAVRAS_IGNORADAS_ORGANIZACAO_ = { the: true, fundacao: true, foundation: true, fondation: true, fonden: true };

/** Normaliza nomes para a junção Oportunidades ↔ Organizações (seção 4.2). */
function normalizarNomeOrganizacao(nome) {
  return removerAcentos(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(function (p) { return p && !PALAVRAS_IGNORADAS_ORGANIZACAO_[p]; })
    .join(' ');
}

function normalizarDeLista_(valor, lista, padrao) {
  var v = normalizarCabecalho(valor);
  if (!v) return { valor: padrao, desconhecido: false };
  for (var i = 0; i < lista.length; i++) {
    if (normalizarCabecalho(lista[i]) === v) return { valor: lista[i], desconhecido: false };
  }
  return { valor: padrao, desconhecido: true };
}

function normalizarIntegridade(valor) {
  return normalizarDeLista_(valor, VALORES_INTEGRIDADE, INTEGRIDADE_PADRAO);
}

function normalizarVia(valor) {
  return normalizarDeLista_(valor, VALORES_VIA, VIA_PADRAO);
}

/** 'Ativo no matching': vazio conta como Sim; só 'Não' (e variações) desativa. */
function normalizarAtivo(valor) {
  var v = normalizarCabecalho(valor);
  if (!v || v === 'sim' || v === 's' || v === 'yes' || v === 'true') return { ativo: true, desconhecido: false };
  if (v === 'nao' || v === 'n' || v === 'no' || v === 'false') return { ativo: false, desconhecido: false };
  return { ativo: true, desconhecido: true };
}

/** Retorna a URL se for http(s) válida; senão ''. Domínios sem protocolo ganham https://. */
function linkSeguro(url) {
  var u = String(url || '').trim();
  if (!u || u.length > 2000 || /[\s<>"'`\\]/.test(u)) return '';
  if (/^https?:\/\/[^\/?#\s]+\.[^\/?#\s]+/i.test(u)) return u;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(u)) return 'https://' + u;
  return '';
}

/**
 * Limpa as linhas lidas de Oportunidades.
 * - ignora linhas sem Nome do edital E sem Nome do parceiro;
 * - ID vazio vira ID temporário 'LINHA-<n>' (estável dentro de uma execução);
 * - 'Ativo no matching' vazio conta como Sim.
 */
function prepararOportunidades(linhas) {
  var saida = [], ignoradas = [], incompletas = [], idsTemporarios = [];
  var valoresAtivoDesconhecidos = [], linksInvalidos = [];
  var vistos = {}, duplicados = {};

  (linhas || []).forEach(function (l) {
    var edital = String(l.edital || '').trim();
    var financiador = String(l.financiador || '').trim();
    if (!edital && !financiador) { ignoradas.push(l.linha); return; }
    if (!edital || !financiador) incompletas.push(l.linha);

    var id = String(l.id || '').trim();
    if (!id) { id = 'LINHA-' + l.linha; idsTemporarios.push(l.linha); }
    if (vistos[id]) duplicados[id] = true;
    vistos[id] = true;

    var ativo = normalizarAtivo(l.ativo);
    if (ativo.desconhecido) valoresAtivoDesconhecidos.push({ linha: l.linha, valor: l.ativo });

    var link = linkSeguro(l.linkEdital);
    if (l.linkEdital && !link) linksInvalidos.push(l.linha);

    saida.push({
      linha: l.linha,
      id: id,
      financiador: financiador,
      edital: edital,
      tema: String(l.tema || '').trim(),
      resumo: String(l.resumo || '').trim(),
      prazoBruto: String(l.prazo || '').trim(),
      valores: String(l.valores || '').trim(),
      duracao: String(l.duracao || '').trim(),
      sinergia: String(l.sinergia || '').trim(),
      linkEdital: link,
      ativo: ativo.ativo
    });
  });

  return {
    oportunidades: saida,
    ignoradas: ignoradas,
    incompletas: incompletas,
    idsTemporarios: idsTemporarios,
    idsDuplicados: Object.keys(duplicados),
    valoresAtivoDesconhecidos: valoresAtivoDesconhecidos,
    linksInvalidos: linksInvalidos
  };
}

/** Limpa as linhas lidas de Organizações. Linhas sem nome são descartadas. */
function prepararOrganizacoes(linhas) {
  var saida = [], duplicadas = [], integridadeDesconhecidos = [], viaDesconhecidos = [];
  var vistos = {};

  (linhas || []).forEach(function (l) {
    var nome = String(l.organizacao || '').trim();
    if (!nome) return;
    var chave = normalizarNomeOrganizacao(nome);
    if (vistos[chave]) duplicadas.push(nome);
    vistos[chave] = true;

    var integ = normalizarIntegridade(l.integridade);
    if (integ.desconhecido) integridadeDesconhecidos.push({ linha: l.linha, valor: l.integridade });
    var via = normalizarVia(l.via);
    if (via.desconhecido) viaDesconhecidos.push({ linha: l.linha, valor: l.via });

    saida.push({
      linha: l.linha,
      organizacao: nome,
      chave: chave,
      sinergia: String(l.sinergia || '').trim(),
      prioridades: String(l.prioridades || '').trim(),
      acesso: String(l.acesso || '').trim(),
      tipoApoio: String(l.tipoApoio || '').trim(),
      regiao: String(l.regiao || '').trim(),
      porte: String(l.porte || '').trim(),
      pais: String(l.pais || '').trim(),
      website: linkSeguro(l.website),
      integridade: integ.valor,
      via: via.valor
    });
  });

  return {
    organizacoes: saida,
    duplicadas: duplicadas,
    integridadeDesconhecidos: integridadeDesconhecidos,
    viaDesconhecidos: viaDesconhecidos
  };
}

/**
 * Junta cada oportunidade à organização de mesmo nome normalizado.
 * Sem correspondência: integridade 'Não avaliado' e via 'A definir'.
 * Organização com nome normalizado repetido: vale a primeira linha.
 */
function juntarOportunidadesOrganizacoes(oportunidades, organizacoes) {
  var porChave = {};
  (organizacoes || []).forEach(function (g) {
    var k = g.chave || normalizarNomeOrganizacao(g.organizacao);
    if (k && !porChave[k]) porChave[k] = g;
  });

  var semCorrespondencia = [];
  var juntadas = (oportunidades || []).map(function (o) {
    var org = porChave[normalizarNomeOrganizacao(o.financiador)] || null;
    if (!org) semCorrespondencia.push({ linha: o.linha, id: o.id, financiador: o.financiador });
    var copia = {};
    Object.keys(o).forEach(function (k) { copia[k] = o[k]; });
    copia.organizacao = org ? org.organizacao : '';
    copia.integridade = org ? org.integridade : INTEGRIDADE_PADRAO;
    copia.via = org ? org.via : VIA_PADRAO;
    return copia;
  });

  return { oportunidades: juntadas, semCorrespondencia: semCorrespondencia };
}

/** Remove oportunidades inativas e as de financiador Vedado. */
function filtrarCandidatos(oportunidades) {
  var candidatos = [], inativas = [], vedadas = [];
  (oportunidades || []).forEach(function (o) {
    if (o.integridade === 'Vedado') { vedadas.push(o.id); return; }
    if (!o.ativo) { inativas.push(o.id); return; }
    candidatos.push(o);
  });
  return { candidatos: candidatos, inativas: inativas, vedadas: vedadas };
}

/**
 * Calcula os IDs a gerar. Não altera IDs existentes.
 * @return {{ novos: {indice:number, id:string}[] }}  indice = posição no array (0-based)
 */
function preencherIdsVazios(ids, editais, parceiros) {
  var maior = 0;
  (ids || []).forEach(function (id) {
    var m = String(id || '').trim().match(/^OPP-(\d+)$/i);
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  });
  var novos = [];
  (ids || []).forEach(function (id, i) {
    if (String(id || '').trim()) return;
    if (!String(editais[i] || '').trim() && !String(parceiros[i] || '').trim()) return;
    maior++;
    novos.push({ indice: i, id: 'OPP-' + ('000' + maior).slice(-Math.max(4, String(maior).length)) });
  });
  return { novos: novos };
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizarCabecalho: normalizarCabecalho,
    mapearCabecalhos: mapearCabecalhos,
    normalizarNomeOrganizacao: normalizarNomeOrganizacao,
    normalizarIntegridade: normalizarIntegridade,
    normalizarVia: normalizarVia,
    normalizarAtivo: normalizarAtivo,
    linkSeguro: linkSeguro,
    prepararOportunidades: prepararOportunidades,
    prepararOrganizacoes: prepararOrganizacoes,
    juntarOportunidadesOrganizacoes: juntarOportunidadesOrganizacoes,
    filtrarCandidatos: filtrarCandidatos,
    preencherIdsVazios: preencherIdsVazios
  };
}

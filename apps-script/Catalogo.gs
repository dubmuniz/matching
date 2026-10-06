/**
 * Catalogo.gs — lista completa de oportunidades para a página inicial (acao "oportunidades").
 *
 * - Só oportunidades ativas e de financiador não vedado (os mesmos candidatos do matching).
 * - Só colunas públicas: nada de colunas INTERNAS (elas nem são lidas, ver Planilha.gs).
 * - Fatos (prazo, valores, duração, links) vêm da planilha; nada passa pela IA.
 * - A lista fica 10 minutos no CacheService para não reler a planilha a cada acesso.
 *
 * Funções puras (cardCatalogo, ordenarCatalogo, montarCatalogo) são testadas no Node.
 */

var VALIDADE_CACHE_CATALOGO_S = 600;
var MAX_CACHE_CATALOGO_ = 95000; // o CacheService guarda até 100 KB por chave
var MAX_RESUMO_CATALOGO_ = 700;

var ORDEM_STATUS_CATALOGO_ = { prazo_curto: 0, aberto: 1, ciclos: 2, continuo: 3, a_confirmar: 4, encerrado: 5 };

/* =====================================================================
 * Funções puras
 * ===================================================================== */

function textoCatalogo_(v, max) {
  var t = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Card da lista: só campos públicos. */
function cardCatalogo(o) {
  var prazo = o.prazo || { status: 'a_confirmar', texto: 'Prazo a confirmar', data: null };
  return {
    id: o.id,
    financiador: o.financiador,
    edital: o.edital,
    tema: textoCatalogo_(o.tema, 300),
    resumo: textoCatalogo_(o.resumo, MAX_RESUMO_CATALOGO_),
    prazo_status: prazo.status,
    prazo_texto: prazo.texto,
    prazo_data: prazo.data || '',
    valores: o.valores,
    duracao: o.duracao,
    integridade: o.integridade,
    integridade_aviso: o.integridade === 'Análise reforçada' || o.integridade === 'Não avaliado',
    via_governanca: o.via,
    link_edital: o.linkEdital || ''
  };
}

function dataOrdenavel_(ddmmaaaa) {
  var m = String(ddmmaaaa || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Number(m[3] + m[2] + m[1]) : 0;
}

/**
 * Prazo curto e abertos primeiro (prazo mais próximo antes), depois ciclos, contínuos,
 * a confirmar e, por fim, encerrados (o mais recente antes). Empate: financiador e edital.
 */
function ordenarCatalogo(lista) {
  return lista.slice().sort(function (a, b) {
    var sa = ORDEM_STATUS_CATALOGO_[a.prazo_status], sb = ORDEM_STATUS_CATALOGO_[b.prazo_status];
    if (sa === undefined) sa = 4;
    if (sb === undefined) sb = 4;
    if (sa !== sb) return sa - sb;
    var da = dataOrdenavel_(a.prazo_data), db = dataOrdenavel_(b.prazo_data);
    if (da !== db) return a.prazo_status === 'encerrado' ? db - da : da - db;
    return String(a.financiador).localeCompare(String(b.financiador), 'pt') ||
      String(a.edital).localeCompare(String(b.edital), 'pt');
  });
}

/** Candidatos do matching → lista ordenada. Defesa extra: vedados e inativos nunca entram. */
function montarCatalogo(candidatos) {
  return ordenarCatalogo((candidatos || [])
    .filter(function (o) { return o.ativo !== false && o.integridade !== 'Vedado'; })
    .map(cardCatalogo));
}

/* =====================================================================
 * Funções com Apps Script
 * ===================================================================== */

function processarListaOportunidades_(dados, cfg, sessao) {
  if (Object.keys(dados).some(function (k) { return k !== 'acao'; })) return falha_('formato');
  var limite = verificarLimiteDeTaxa_(sessao.email, 'lista');
  if (!limite.permitido) {
    console.warn('Lista bloqueada pelo limite de taxa: ' + limite.motivo);
    return falha_(limite.motivo === 'ocupado' ? 'ocupado' : 'limiteLista');
  }

  var lista = listaDeOportunidades_(cfg);
  registrarAcessoALista_(cfg, sessao.email);
  return { ok: true, login: cfg.loginAtivo, email: sessao.email, oportunidades: lista, recursos: recursosDoServidor_() };
}

/** O que este servidor aceita além do básico (a página só usa o que estiver anunciado aqui). */
function recursosDoServidor_() {
  return { idPedido: true };
}

/** Lista pronta, do cache (10 minutos) ou montada a partir da planilha. Também usada no login. */
function listaDeOportunidades_(cfg) {
  var hoje = hojeSaoPaulo_();
  var cache = CacheService.getScriptCache();
  var chave = 'CATALOGO_' + hoje;
  var guardada = cache.get(chave);
  if (guardada) {
    try { return JSON.parse(guardada); } catch (e) { /* monta de novo */ }
  }
  var lista = montarCatalogo(carregarBaseMatching_(cfg, hoje).candidatos);
  var json = JSON.stringify(lista);
  if (tamanhoEmBytes_(json) < MAX_CACHE_CATALOGO_) cache.put(chave, json, VALIDADE_CACHE_CATALOGO_S);
  return lista;
}

if (typeof module !== 'undefined') {
  module.exports = {
    cardCatalogo: cardCatalogo,
    ordenarCatalogo: ordenarCatalogo,
    montarCatalogo: montarCatalogo
  };
}

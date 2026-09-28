/**
 * Resultados.gs — monta as seções e os cards da página de resultados (seções 5.3 e 8).
 *
 * Fatos (prazo, valores, duração, links, integridade, via) vêm SEMPRE da planilha.
 * Da IA vêm só a nota, os critérios e os textos de justificativa.
 * A resposta ao frontend contém apenas os campos dos cards (minimização de dados).
 *
 * Funções puras: testadas no Node (tests/resultados.test.js).
 */

var STATUS_SECAO_ABERTAS_ = ['aberto', 'prazo_curto', 'continuo', 'ciclos', 'a_confirmar'];
var NOTA_MIN_ABERTAS = 40;
var NOTA_MIN_MONITORAR = 60;
var NOTA_MIN_FINANCIADORES = 60;
var MAX_CARDS_ABERTAS = 8;
var MAX_CARDS_MONITORAR = 5;
var MAX_CARDS_FINANCIADORES = 5;
var INTEGRIDADE_COM_AVISO_ = ['Análise reforçada', 'Não avaliado'];

var MENSAGEM_SEM_RESULTADOS =
  'Não encontramos correspondências fortes na base atual. O Escritório recebeu sua demanda e fará uma análise manual.';

function seloAderencia(nota) {
  if (nota >= 75) return 'Alta aderência';
  if (nota >= 60) return 'Boa aderência';
  if (nota >= 40) return 'Aderência parcial';
  return 'Baixa aderência';
}

function cardOportunidade_(item, o) {
  return {
    tipo: 'oportunidade',
    id: o.id,
    financiador: o.financiador,
    edital: o.edital,
    nota: item.nota,
    selo: seloAderencia(item.nota),
    prazo_status: o.prazo.status,
    prazo_texto: o.prazo.texto,
    valores: o.valores,
    duracao: o.duracao,
    por_que_combina: item.por_que_combina,
    lacunas_e_riscos: item.lacunas_e_riscos,
    requisitos_criticos: item.requisitos_criticos,
    proximo_passo: item.proximo_passo,
    criterios: item.criterios,
    integridade: o.integridade,
    integridade_aviso: INTEGRIDADE_COM_AVISO_.indexOf(o.integridade) >= 0,
    via_governanca: o.via,
    link_edital: o.linkEdital || ''
  };
}

function cardFinanciador_(item, g) {
  return {
    tipo: 'financiador',
    organizacao: g.organizacao,
    nota: item.nota,
    selo: seloAderencia(item.nota),
    pais: g.pais,
    por_que_combina: item.por_que_combina,
    como_abordar: item.como_abordar,
    integridade: g.integridade,
    integridade_aviso: INTEGRIDADE_COM_AVISO_.indexOf(g.integridade) >= 0,
    website: g.website || ''
  };
}

/**
 * @param {Object} respostaIA     saída de validarRespostaMatching().dados
 * @param {Object[]} oportunidades as enviadas à IA (com prazo, integridade, via, linkEdital)
 * @param {Object[]} organizacoes  as enviadas à IA
 * @return {{ resumo_demanda, lacunas_da_demanda, abertas: [], monitorar: [], financiadores: [], vazio: boolean, mensagem_vazio: string }}
 */
function montarResultado(respostaIA, oportunidades, organizacoes) {
  var porId = {};
  (oportunidades || []).forEach(function (o) { porId[o.id] = o; });
  var porNome = {};
  (organizacoes || []).forEach(function (g) { porNome[g.organizacao] = g; });

  var abertas = [], monitorar = [];
  (respostaIA.oportunidades || []).forEach(function (item) {
    var o = porId[item.id];
    if (!o || o.integridade === 'Vedado') return;   // defesa extra: vedados nunca viram card
    var status = o.prazo && o.prazo.status;
    if (STATUS_SECAO_ABERTAS_.indexOf(status) >= 0 && item.nota >= NOTA_MIN_ABERTAS) {
      abertas.push(cardOportunidade_(item, o));
    } else if (status === 'encerrado' && item.nota >= NOTA_MIN_MONITORAR) {
      monitorar.push(cardOportunidade_(item, o));
    }
  });

  var financiadores = [];
  (respostaIA.financiadores || []).forEach(function (item) {
    var g = porNome[item.organizacao];
    if (!g || g.integridade === 'Vedado' || item.nota < NOTA_MIN_FINANCIADORES) return;
    financiadores.push(cardFinanciador_(item, g));
  });

  // Nota maior primeiro; no empate, prazo curto antes.
  abertas.sort(function (a, b) {
    return (b.nota - a.nota) ||
      ((b.prazo_status === 'prazo_curto' ? 1 : 0) - (a.prazo_status === 'prazo_curto' ? 1 : 0));
  });
  monitorar.sort(function (a, b) { return b.nota - a.nota; });
  financiadores.sort(function (a, b) { return b.nota - a.nota; });

  var r = {
    resumo_demanda: respostaIA.resumo_demanda || '',
    lacunas_da_demanda: respostaIA.lacunas_da_demanda || [],
    abertas: abertas.slice(0, MAX_CARDS_ABERTAS),
    monitorar: monitorar.slice(0, MAX_CARDS_MONITORAR),
    financiadores: financiadores.slice(0, MAX_CARDS_FINANCIADORES)
  };
  r.vazio = !r.abertas.length && !r.monitorar.length && !r.financiadores.length;
  r.mensagem_vazio = r.vazio ? MENSAGEM_SEM_RESULTADOS : '';
  return r;
}

/** Os `n` melhores cards de todas as seções, por nota (oportunidades antes de financiadores no empate). */
function melhoresCards(resultado, n) {
  var todos = [].concat(resultado.abertas || [], resultado.monitorar || [], resultado.financiadores || []);
  return todos
    .map(function (c, i) { return { c: c, i: i }; })
    .sort(function (a, b) { return (b.c.nota - a.c.nota) || (a.i - b.i); })
    .slice(0, n)
    .map(function (x) { return x.c; });
}

function tituloDoCard(c) {
  return c.tipo === 'financiador' ? c.organizacao : (c.edital + ' — ' + c.financiador);
}

/** Texto curto para a coluna "Top 3 (texto)" da aba Demandas. */
function top3Texto(resultado) {
  var top = melhoresCards(resultado, 3);
  if (!top.length) return 'Sem correspondências fortes';
  return top.map(function (c, i) {
    return (i + 1) + '. [' + c.nota + '] ' + tituloDoCard(c) + (c.id ? ' (' + c.id + ')' : '');
  }).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    MENSAGEM_SEM_RESULTADOS: MENSAGEM_SEM_RESULTADOS,
    seloAderencia: seloAderencia,
    montarResultado: montarResultado,
    melhoresCards: melhoresCards,
    tituloDoCard: tituloDoCard,
    top3Texto: top3Texto
  };
}

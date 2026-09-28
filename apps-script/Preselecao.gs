/**
 * Preselecao.gs — pré-seleção por sobreposição de termos (função pura).
 *
 * Usada só quando há mais de CONFIG_MATCHING.MAX_CANDIDATOS (40) oportunidades candidatas.
 * Lado do projeto: título, resumo, objetivos e áreas temáticas.
 * Lado do edital: tema central e resumo da chamada.
 * Texto normalizado: minúsculas, sem acentos, sem stopwords em PT, EN, ES e FR.
 *
 * Roda no Apps Script e no Node (tests/preselecao.test.js).
 */

var STOPWORDS_PRESELECAO_ = (function () {
  var listas = [
    // português
    'a o as os um uma uns umas de da do das dos em na no nas nos por pela pelo pelas pelos para pra com sem sob sobre ' +
    'entre ate apos ante e ou mas nem que se como quando onde qual quais cujo cuja este esta estes estas esse essa esses ' +
    'essas aquele aquela aqueles aquelas isto isso aquilo ele ela eles elas seu sua seus suas nosso nossa nossos nossas ' +
    'meu minha ao aos a as la lo mais menos muito muita muitos muitas pouco ja nao sim tambem so ser estar ter haver foi ' +
    'sao era sera tem temos pode podem deve devem sua outro outra outros outras cada todo toda todos todas mesmo mesma ' +
    'projeto projetos pesquisa estudo',
    // inglês
    'the a an of in on at by for with without to from into onto over under and or but nor not no yes is are was were be ' +
    'been being have has had do does did can could should would may might must will shall this that these those it its ' +
    'their our your his her they we you as than then so such also more most other others each any all some which who ' +
    'whom whose what when where how project projects research study',
    // espanhol
    'el la los las un una unos unas del al en por para con sin sobre entre hasta desde y o pero ni que como cuando donde ' +
    'cual cuales este esta estos estas ese esa esos esas su sus nuestro nuestra mas menos muy tambien ya no si ser estar ' +
    'es son fue proyecto proyectos investigacion estudio',
    // francês
    'le la les un une des du de d l au aux en dans par pour avec sans sur sous entre et ou mais ni que qui quoi dont ou ' +
    'comme quand ce cet cette ces son sa ses leur leurs notre nos votre vos plus moins tres aussi deja ne pas oui etre ' +
    'avoir est sont etait projet projets recherche etude'
  ];
  var conjunto = {};
  listas.join(' ').split(/\s+/).forEach(function (p) { if (p) conjunto[p] = true; });
  return conjunto;
})();

/** Texto → lista de termos normalizados (≥ 3 letras, sem stopwords, plural simples removido). */
function tokenizarPreselecao(texto) {
  var t = String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  var termos = [];
  t.split(' ').forEach(function (p) {
    if (p.length < 3 || STOPWORDS_PRESELECAO_[p] || /^\d+$/.test(p)) return;
    if (p.length > 4 && /s$/.test(p) && !/ss$/.test(p)) p = p.slice(0, -1);
    termos.push(p);
  });
  return termos;
}

function conjuntoDeTermos_(texto) {
  var c = {};
  tokenizarPreselecao(texto).forEach(function (p) { c[p] = true; });
  return c;
}

/** Pontuação = nº de termos distintos da demanda presentes no tema + resumo do edital. */
function pontuarSobreposicao(termosDemanda, oportunidade) {
  var termosEdital = conjuntoDeTermos_([oportunidade.tema, oportunidade.resumo].join(' '));
  var pontos = 0;
  Object.keys(termosDemanda).forEach(function (p) { if (termosEdital[p]) pontos++; });
  return pontos;
}

/**
 * Se houver mais de `max` candidatos, devolve os `max` com maior sobreposição de termos.
 * Empates mantêm a ordem original (a da planilha). Com `max` ou menos, devolve a lista como veio.
 */
function preselecionarCandidatos(demanda, candidatos, max) {
  var lista = candidatos || [];
  if (lista.length <= max) return lista.slice();
  var d = demanda || {};
  var termosDemanda = conjuntoDeTermos_([
    d.titulo, d.resumo, d.objetivos, (Array.isArray(d.areas) ? d.areas : []).join(' ')
  ].join(' '));

  return lista
    .map(function (o, i) { return { o: o, i: i, pontos: pontuarSobreposicao(termosDemanda, o) }; })
    .sort(function (a, b) { return (b.pontos - a.pontos) || (a.i - b.i); })
    .slice(0, max)
    .map(function (x) { return x.o; });
}

if (typeof module !== 'undefined') {
  module.exports = {
    tokenizarPreselecao: tokenizarPreselecao,
    pontuarSobreposicao: pontuarSobreposicao,
    preselecionarCandidatos: preselecionarCandidatos
  };
}

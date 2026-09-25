/**
 * Prazo.gs — classificação de prazos (função pura, sem chamadas ao Apps Script).
 *
 * Roda no Apps Script e no Node (testes em tests/prazo.test.js).
 *
 * classificarPrazo(valor, hoje, minDias) → { status, texto, data }
 *   status: 'aberto' | 'prazo_curto' | 'encerrado' | 'continuo' | 'ciclos' | 'a_confirmar'
 *   texto:  frase pronta para o card
 *   data:   'dd/mm/aaaa' quando o status veio de uma data; senão null
 *
 * Entradas aceitas em `valor`:
 *   - Date (data nativa da planilha; o ideal é já chegar convertida em texto
 *     'dd/mm/aaaa' pelo Planilha.gs, usando o fuso da planilha);
 *   - texto com 'dd/mm/aaaa' em qualquer posição (usa a primeira data válida);
 *   - texto com data por extenso com ano ('March 1, 2026', '1 de março de 2026');
 *   - texto de fluxo contínuo, de ciclos recorrentes ou qualquer outro texto.
 *
 * `hoje`: 'AAAA-MM-DD' (preferido; gerado por hojeSaoPaulo_() em Config.gs) ou Date.
 *
 * Ordem das regras: vazio → fluxo contínuo → data explícita → ciclos → a confirmar.
 * A data explícita vem antes dos ciclos porque um texto como
 * '15/03/2026 (rodada de março)' tem um prazo concreto.
 */

var PRAZO_TERMOS_CONTINUO_ = [
  'continu',        // contínuo, contínua, continuous, continuously (sem acento após normalizar)
  'rolling',
  'fluxo continuo',
  'open call',
  'ongoing'
];

// Nomes de meses (sem acento) em PT, EN, ES e FR → número do mês.
var PRAZO_MESES_ = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  enero: 1, febrero: 2, marzo: 3, mayo: 5, junio: 6,
  julio: 7, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, decembre: 12
};

// Abreviações em inglês, aceitas só quando vêm coladas a um número ('Mar 1', '1 Oct').
var PRAZO_MESES_ABREV_ = {
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

// Nomes que também são palavras comuns: só contam como mês quando há um número ao lado.
var PRAZO_MESES_AMBIGUOS_ = { may: true, mai: true, mars: true };

function classificarPrazo(valor, hoje, minDias) {
  var min = (typeof minDias === 'number' && isFinite(minDias) && minDias >= 0) ? Math.floor(minDias) : 21;
  var hojeDia = prazoDiaDeHoje_(hoje);

  // 1. Data nativa
  if (valor instanceof Date || (valor && typeof valor.getFullYear === 'function')) {
    if (isNaN(valor.getTime())) return prazoAConfirmar_();
    return prazoPorData_(valor.getFullYear(), valor.getMonth() + 1, valor.getDate(), hojeDia, min);
  }

  var original = (valor === null || valor === undefined) ? '' : String(valor).replace(/\s+/g, ' ').trim();
  if (!original) return prazoAConfirmar_();

  var t = prazoNormalizar_(original);

  // 2. Fluxo contínuo
  for (var i = 0; i < PRAZO_TERMOS_CONTINUO_.length; i++) {
    if (t.indexOf(PRAZO_TERMOS_CONTINUO_[i]) >= 0) {
      return { status: 'continuo', texto: 'Fluxo contínuo', data: null };
    }
  }

  // 3. Data explícita dd/mm/aaaa (primeira válida)
  var reData = /(^|[^\d])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?!\d)/g;
  var m;
  while ((m = reData.exec(t)) !== null) {
    var d = Number(m[2]), mes = Number(m[3]), ano = Number(m[4]);
    if (prazoDataValida_(ano, mes, d)) return prazoPorData_(ano, mes, d, hojeDia, min);
  }

  // 3b. Data ISO aaaa-mm-dd
  var mIso = t.match(/(^|[^\d])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (mIso && prazoDataValida_(Number(mIso[2]), Number(mIso[3]), Number(mIso[4]))) {
    return prazoPorData_(Number(mIso[2]), Number(mIso[3]), Number(mIso[4]), hojeDia, min);
  }

  // 3c. Data por extenso com ano
  var porExtenso = prazoDataPorExtenso_(t);
  if (porExtenso) return prazoPorData_(porExtenso.ano, porExtenso.mes, porExtenso.dia, hojeDia, min);

  // 4. Ciclos recorrentes: nomes de meses, ou vários dias do ano sem ano (ex.: '1/3 • 1/7')
  if (prazoTemMes_(t) || prazoTemVariosDiasSemAno_(t)) {
    return { status: 'ciclos', texto: 'Ciclos recorrentes: ' + original, data: null };
  }

  // 5. Qualquer outro texto ('Não encontrado.', 'Verificar', ...)
  return prazoAConfirmar_();
}

/* ---------- auxiliares (todos puros) ---------- */

function prazoAConfirmar_() {
  return { status: 'a_confirmar', texto: 'Prazo a confirmar', data: null };
}

function prazoNormalizar_(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function prazoDataValida_(ano, mes, dia) {
  if (!(ano >= 1900 && ano <= 2200 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return false;
  var dt = new Date(Date.UTC(ano, mes - 1, dia));
  return dt.getUTCFullYear() === ano && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === dia;
}

// Número de dias desde 1970-01-01, sem depender de fuso.
function prazoNumeroDoDia_(ano, mes, dia) {
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86400000);
}

function prazoDiaDeHoje_(hoje) {
  if (typeof hoje === 'string') {
    var m = hoje.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return prazoNumeroDoDia_(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (hoje instanceof Date || (hoje && typeof hoje.getFullYear === 'function')) {
    return prazoNumeroDoDia_(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate());
  }
  throw new Error('classificarPrazo: "hoje" deve ser "AAAA-MM-DD" ou Date.');
}

function prazoFormatar_(ano, mes, dia) {
  return (dia < 10 ? '0' : '') + dia + '/' + (mes < 10 ? '0' : '') + mes + '/' + ano;
}

function prazoPorData_(ano, mes, dia, hojeDia, minDias) {
  var alvo = prazoNumeroDoDia_(ano, mes, dia);
  var dataTxt = prazoFormatar_(ano, mes, dia);
  if (alvo < hojeDia) {
    return {
      status: 'encerrado',
      texto: 'Último prazo conhecido: ' + dataTxt + ' — verifique o próximo ciclo',
      data: dataTxt
    };
  }
  if (alvo < hojeDia + minDias) {
    return { status: 'prazo_curto', texto: 'Prazo curto: ' + dataTxt, data: dataTxt };
  }
  return { status: 'aberto', texto: 'Prazo: ' + dataTxt, data: dataTxt };
}

function prazoNumeroMes_(palavra) {
  if (PRAZO_MESES_.hasOwnProperty(palavra)) return PRAZO_MESES_[palavra];
  if (PRAZO_MESES_ABREV_.hasOwnProperty(palavra)) return PRAZO_MESES_ABREV_[palavra];
  return 0;
}

// 'march 1, 2026' | 'march 1st 2026' | '1 march 2026' | '1 de marco de 2026' | '1er mars 2026'
function prazoDataPorExtenso_(t) {
  var re1 = /([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/g;
  var m;
  while ((m = re1.exec(t)) !== null) {
    var mes = prazoNumeroMes_(m[1]);
    if (mes && prazoDataValida_(Number(m[3]), mes, Number(m[2]))) {
      return { ano: Number(m[3]), mes: mes, dia: Number(m[2]) };
    }
  }
  var re2 = /(^|[^\d])(\d{1,2})(?:st|nd|rd|th|er|º|o)?\s+(?:de\s+)?([a-z]+)\.?,?\s+(?:de\s+)?(\d{4})(?!\d)/g;
  while ((m = re2.exec(t)) !== null) {
    var mes2 = prazoNumeroMes_(m[3]);
    if (mes2 && prazoDataValida_(Number(m[4]), mes2, Number(m[2]))) {
      return { ano: Number(m[4]), mes: mes2, dia: Number(m[2]) };
    }
  }
  return null;
}

function prazoTemMes_(t) {
  var palavras = t.split(/[^a-z0-9]+/);
  for (var i = 0; i < palavras.length; i++) {
    var p = palavras[i];
    if (!p) continue;
    var vizinhoNumero = /^\d/.test(palavras[i - 1] || '') || /^\d/.test(palavras[i + 1] || '');
    if (PRAZO_MESES_.hasOwnProperty(p)) {
      if (!PRAZO_MESES_AMBIGUOS_[p] || vizinhoNumero) return true;
    } else if (PRAZO_MESES_ABREV_.hasOwnProperty(p) && vizinhoNumero) {
      return true;
    }
  }
  return false;
}

function prazoTemVariosDiasSemAno_(t) {
  var re = /(^|[^\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])/g;
  var n = 0, m;
  while ((m = re.exec(t)) !== null) {
    var d = Number(m[2]), mes = Number(m[3]);
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) n++;
  }
  return n >= 2;
}

if (typeof module !== 'undefined') {
  module.exports = { classificarPrazo: classificarPrazo };
}

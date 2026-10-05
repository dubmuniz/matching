/**
 * Claude.gs — chamada à API da Anthropic (UrlFetchApp) e validação da resposta do matching.
 *
 * Notas sobre o modelo claude-sonnet-5:
 * - não aceita `temperature`, `top_p` nem `top_k` (HTTP 400): o parâmetro não é enviado;
 * - usa raciocínio adaptativo por padrão; a resposta pode trazer blocos `thinking`
 *   antes do texto, por isso só os blocos `text` são lidos;
 * - `max_tokens` inclui o raciocínio, por isso o limite é maior que o do script antigo;
 * - saídas estruturadas (output_config.format) garantem JSON no formato do schema.
 *
 * As funções puras (extrairJsonMatching, validarRespostaMatching) são testadas no Node.
 */

// Tetos de cada critério da rubrica (seção 6.1).
var TETOS_CRITERIOS_ = { tematica: 40, elegibilidade: 25, porte: 15, maturidade: 10, viabilidade: 10 };
var LIMITE_OPORTUNIDADES_IA_ = 12;
var LIMITE_FINANCIADORES_IA_ = 6;
var LIMITE_LACUNAS_ = 4;
var LIMITE_REQUISITOS_ = 6;
var LIMITE_TEXTO_SAIDA_ = 400;

/* =====================================================================
 * Funções com Apps Script
 * ===================================================================== */

/**
 * Executa o matching com a IA: monta a mensagem, chama o Claude e valida.
 * Se a resposta não for JSON válido, tenta mais uma vez (seção 6.3).
 * @param {{ individual?: boolean }} opcoes  individual: avaliação de um único edital escolhido
 * @return {{ resultado: Object, tentativas: number, uso: Object[] }}
 * @throws Error com mensagem técnica (o chamador mostra uma mensagem amigável ao usuário)
 */
function executarMatchingIA_(cfg, demanda, oportunidades, financiadores, opcoes) {
  if (!cfg.anthropicApiKey) throw new Error('Propriedade ANTHROPIC_API_KEY não configurada.');
  var system = (opcoes && opcoes.individual)
    ? SYSTEM_PROMPT_MATCHING + '\n\n' + PROMPT_AVALIACAO_INDIVIDUAL
    : SYSTEM_PROMPT_MATCHING;

  var mensagem = montarMensagemMatching(demanda, oportunidades, financiadores);
  var ids = oportunidades.map(function (o) { return o.id; });
  var nomes = financiadores.map(function (g) { return g.organizacao; });
  var uso = [];
  var ultimoErro = '';

  for (var tentativa = 1; tentativa <= 2; tentativa++) {
    var texto = tentativa === 1 ? mensagem : mensagem + '\n\n' + PROMPT_AVISO_NOVA_TENTATIVA;
    var resposta = chamarClaudeMatching_(cfg, texto, system);
    uso.push(resposta.uso);

    if (resposta.stopReason === 'refusal') {
      throw new Error('O modelo recusou a solicitação (stop_reason=refusal).');
    }
    if (resposta.stopReason === 'max_tokens') {
      ultimoErro = 'Resposta cortada por max_tokens (' + cfg.maxTokens + ').';
      console.error('Matching, tentativa ' + tentativa + ': ' + ultimoErro);
      continue;
    }

    var validacao = validarRespostaMatching(resposta.texto, ids, nomes);
    if (validacao.ok) {
      if (validacao.descartados.length) {
        console.warn('Itens descartados na validação: ' + JSON.stringify(validacao.descartados));
      }
      return { resultado: validacao.dados, tentativas: tentativa, uso: uso };
    }
    ultimoErro = validacao.erro;
    console.error('Matching, tentativa ' + tentativa + ': ' + validacao.erro +
      ' | início da resposta: ' + String(resposta.texto).slice(0, 300));
  }
  throw new Error('Resposta da IA inválida após 2 tentativas: ' + ultimoErro);
}

function chamarClaudeMatching_(cfg, textoUsuario, system) {
  return chamarClaude_(cfg, {
    system: system || SYSTEM_PROMPT_MATCHING,
    conteudo: textoUsuario,
    schema: SCHEMA_RESPOSTA_MATCHING,
    maxTokens: cfg.maxTokens
  });
}

/**
 * Uma chamada a /v1/messages, com novas tentativas para erros temporários
 * (429, 500, 502, 503, 504, 529 e falhas de rede).
 * @param {{ system: string, conteudo: (string|Object[]), schema: Object, maxTokens: number }} pedido
 *   conteudo: texto, ou lista de blocos (ex.: documento PDF + texto)
 * @return {{ texto: string, stopReason: string, uso: Object }}
 */
function chamarClaude_(cfg, pedido) {
  var corpo = {
    model: cfg.modelo,
    max_tokens: pedido.maxTokens,
    system: pedido.system,
    messages: [{ role: 'user', content: pedido.conteudo }],
    thinking: { type: 'adaptive' },
    output_config: { effort: cfg.esforco }
  };
  if (CONFIG_MATCHING.USAR_SAIDA_ESTRUTURADA && pedido.schema) {
    corpo.output_config.format = { type: 'json_schema', schema: pedido.schema };
  }

  var opcoes = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': cfg.anthropicApiKey,
      'anthropic-version': CONFIG_MATCHING.ANTHROPIC_VERSAO
    },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  };

  var ultimo = '';
  for (var tentativa = 1; tentativa <= CONFIG_MATCHING.TENTATIVAS_MAX; tentativa++) {
    var codigo = 0, corpoResp = '', cabecalhos = {};
    try {
      var res = UrlFetchApp.fetch(CONFIG_MATCHING.ANTHROPIC_URL, opcoes);
      codigo = res.getResponseCode();
      corpoResp = res.getContentText('UTF-8');
      cabecalhos = res.getHeaders() || {};
    } catch (e) {
      ultimo = 'falha de rede: ' + e;                     // tempo esgotado, DNS etc.
    }

    if (codigo >= 200 && codigo < 300) {
      var dados = JSON.parse(corpoResp);
      return {
        texto: textoDaRespostaClaude(dados),
        stopReason: dados.stop_reason || '',
        uso: dados.usage || {}
      };
    }

    if (codigo) ultimo = 'HTTP ' + codigo + ': ' + corpoResp.slice(0, 500);
    var temporario = !codigo || [429, 500, 502, 503, 504, 529].indexOf(codigo) >= 0;
    if (!temporario || tentativa === CONFIG_MATCHING.TENTATIVAS_MAX) break;

    var espera = CONFIG_MATCHING.ESPERA_BASE_MS * Math.pow(2, tentativa - 1);
    var retryAfter = Number(cabecalhos['retry-after'] || cabecalhos['Retry-After']);
    if (isFinite(retryAfter) && retryAfter > 0) espera = Math.max(espera, retryAfter * 1000);
    Utilities.sleep(Math.min(espera, 20000));
  }
  throw new Error('Falha na API da Anthropic. ' + ultimo);
}

/* =====================================================================
 * Funções puras (testáveis no Node)
 * ===================================================================== */

/** Junta o texto de todos os blocos `text` (ignora `thinking` e outros). */
function textoDaRespostaClaude(dados) {
  return ((dados && dados.content) || [])
    .filter(function (b) { return b && b.type === 'text' && typeof b.text === 'string'; })
    .map(function (b) { return b.text; })
    .join('');
}

/** Remove cercas de código e faz o parse. Lança erro se não houver JSON. */
function extrairJsonMatching(texto) {
  var s = String(texto || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    var ini = s.indexOf('{'), fim = s.lastIndexOf('}');
    if (ini >= 0 && fim > ini) return JSON.parse(s.slice(ini, fim + 1));
    throw e;
  }
}

function inteiroEntre_(v, min, max) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

function textoCurto_(v, max) {
  var t = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  var limite = max || LIMITE_TEXTO_SAIDA_;
  return t.length > limite ? t.slice(0, limite - 1) + '…' : t;
}

function listaDeTextos_(v, maxItens) {
  return (Array.isArray(v) ? v : [])
    .map(function (x) { return textoCurto_(x); })
    .filter(function (x) { return x; })
    .slice(0, maxItens);
}

/**
 * Valida a resposta da IA (seção 6.3).
 * - JSON válido com os campos principais;
 * - descarta ids que não foram enviados e organizações que não batem exatamente;
 * - notas inteiras de 0 a 100; critérios limitados ao teto da rubrica;
 * - textos cortados em 400 caracteres.
 * @return {{ ok: boolean, erro?: string, dados?: Object, descartados: Object[] }}
 */
function validarRespostaMatching(texto, idsEnviados, organizacoesEnviadas) {
  var bruto;
  try {
    bruto = extrairJsonMatching(texto);
  } catch (e) {
    return { ok: false, erro: 'JSON inválido', descartados: [] };
  }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { ok: false, erro: 'A resposta não é um objeto JSON', descartados: [] };
  }
  if (!Array.isArray(bruto.oportunidades) || !Array.isArray(bruto.financiadores)) {
    return { ok: false, erro: 'Faltam as listas "oportunidades" ou "financiadores"', descartados: [] };
  }

  var ids = {};
  (idsEnviados || []).forEach(function (id) { ids[String(id)] = true; });
  var orgs = {};
  (organizacoesEnviadas || []).forEach(function (n) { orgs[String(n)] = true; });
  var descartados = [];

  var vistosOpp = {};
  var oportunidades = [];
  bruto.oportunidades.forEach(function (item) {
    var id = item && typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || !ids[id]) { descartados.push({ tipo: 'oportunidade', id: item && item.id, motivo: 'id desconhecido' }); return; }
    if (vistosOpp[id]) { descartados.push({ tipo: 'oportunidade', id: id, motivo: 'repetido' }); return; }
    vistosOpp[id] = true;

    var c = (item.criterios && typeof item.criterios === 'object') ? item.criterios : {};
    var criterios = {};
    Object.keys(TETOS_CRITERIOS_).forEach(function (k) {
      criterios[k] = inteiroEntre_(c[k], 0, TETOS_CRITERIOS_[k]);
    });

    oportunidades.push({
      id: id,
      nota: inteiroEntre_(item.nota, 0, 100),
      criterios: criterios,
      por_que_combina: textoCurto_(item.por_que_combina),
      lacunas_e_riscos: textoCurto_(item.lacunas_e_riscos),
      requisitos_criticos: listaDeTextos_(item.requisitos_criticos, LIMITE_REQUISITOS_),
      proximo_passo: textoCurto_(item.proximo_passo)
    });
  });

  var vistosOrg = {};
  var financiadores = [];
  bruto.financiadores.forEach(function (item) {
    var nome = item && typeof item.organizacao === 'string' ? item.organizacao.trim() : '';
    if (!nome || !orgs[nome]) { descartados.push({ tipo: 'financiador', organizacao: item && item.organizacao, motivo: 'organização desconhecida' }); return; }
    if (vistosOrg[nome]) { descartados.push({ tipo: 'financiador', organizacao: nome, motivo: 'repetido' }); return; }
    vistosOrg[nome] = true;
    financiadores.push({
      organizacao: nome,
      nota: inteiroEntre_(item.nota, 0, 100),
      por_que_combina: textoCurto_(item.por_que_combina),
      como_abordar: textoCurto_(item.como_abordar)
    });
  });

  var porNota = function (a, b) { return b.nota - a.nota; };
  return {
    ok: true,
    descartados: descartados,
    dados: {
      resumo_demanda: textoCurto_(bruto.resumo_demanda),
      lacunas_da_demanda: listaDeTextos_(bruto.lacunas_da_demanda, LIMITE_LACUNAS_),
      oportunidades: oportunidades.sort(porNota).slice(0, LIMITE_OPORTUNIDADES_IA_),
      financiadores: financiadores.sort(porNota).slice(0, LIMITE_FINANCIADORES_IA_)
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    textoDaRespostaClaude: textoDaRespostaClaude,
    extrairJsonMatching: extrairJsonMatching,
    validarRespostaMatching: validarRespostaMatching
  };
}

/**
 * Codigo.gs — web app: doGet, doPost e orquestração do matching (seção 5.1).
 *
 * Implantação: "Executar como: eu" e "Quem pode acessar: qualquer pessoa".
 * O frontend envia POST com Content-Type text/plain e corpo JSON (evita o preflight de CORS).
 *
 * Resposta sempre em JSON:
 *   sucesso: { ok: true, id_demanda, resultado }          (resultado: ver montarResultado)
 *   erro:    { ok: false, erro: 'mensagem em português', campos?: { campo: mensagem } }
 * Detalhes técnicos dos erros vão só para console.error (Execuções do Apps Script).
 */

var MENSAGENS_ERRO = {
  tamanho: 'O envio é grande demais. Reduza os textos e tente de novo.',
  formato: 'Não foi possível ler o envio. Recarregue a página e tente de novo.',
  campos: 'Revise os campos destacados.',
  robo: 'Não foi possível confirmar o envio. Recarregue a página e tente de novo.',
  limiteEmail: 'Você atingiu o limite de 3 envios em 24 horas com este e-mail. Tente novamente amanhã.',
  limiteGlobal: 'O sistema recebeu muitos envios na última hora. Tente novamente mais tarde.',
  ocupado: 'O sistema está ocupado. Tente novamente em alguns instantes.',
  ia: 'Não conseguimos gerar as sugestões agora. Sua demanda foi registrada e o Escritório fará uma análise manual.',
  inesperado: 'Ocorreu um erro inesperado. Tente novamente em alguns minutos.'
};

function doGet() {
  return respostaJson_({ ok: true });
}

function doPost(e) {
  try {
    return respostaJson_(processarEnvio_(e));
  } catch (err) {
    console.error('doPost: erro inesperado: ' + (err && err.stack ? err.stack : err));
    return respostaJson_({ ok: false, erro: MENSAGENS_ERRO.inesperado });
  }
}

function respostaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function falha_(chave, extra) {
  var r = { ok: false, erro: MENSAGENS_ERRO[chave] };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return r;
}

/** Pipeline completo. Devolve o objeto de resposta (sem serializar). */
function processarEnvio_(e) {
  // 1. Tamanho e formato
  var bruto = (e && e.postData && typeof e.postData.contents === 'string') ? e.postData.contents : '';
  if (!bruto) return falha_('formato');
  if (bruto.length > LIMITE_CORPO_BYTES || tamanhoEmBytes_(bruto) > LIMITE_CORPO_BYTES) return falha_('tamanho');

  var dados;
  try { dados = JSON.parse(bruto); } catch (err) { return falha_('formato'); }

  // 2. Honeypot (antes de qualquer outra coisa, sem dar pistas)
  if (honeypotPreenchido(dados)) {
    console.warn('Envio descartado: honeypot preenchido.');
    return falha_('robo');
  }

  // 3. Validação de todos os campos
  var v = validarDemanda(dados);
  if (!v.ok) return falha_('campos', { campos: v.erros });
  var demanda = v.demanda;

  // 4. Anti-abuso: Turnstile e limite de taxa
  var cfg = obterConfigMatching_();
  if (!verificarTurnstile_(cfg, dados.turnstileToken)) return falha_('robo');
  var limite = verificarLimiteDeTaxa_(demanda.email);
  if (!limite.permitido) {
    console.warn('Envio bloqueado pelo limite de taxa: ' + limite.motivo);
    return falha_(limite.motivo === 'email' ? 'limiteEmail' : limite.motivo === 'global' ? 'limiteGlobal' : 'ocupado');
  }

  // 5-8. Base, pré-seleção, IA e cards
  var hoje = hojeSaoPaulo_();
  var base = carregarBaseMatching_(cfg, hoje);
  var candidatos = preselecionarCandidatos(demanda, base.candidatos, CONFIG_MATCHING.MAX_CANDIDATOS);
  var resultado = null, erroIA = '';
  try {
    var ia = executarMatchingIA_(cfg, demanda, candidatos, base.organizacoesParaIA);
    resultado = montarResultado(ia.resultado, candidatos, base.organizacoesParaIA);
  } catch (err) {
    erroIA = String(err && err.message ? err.message : err).slice(0, 500);
    console.error('Matching: falha na IA: ' + erroIA);
  }

  // 9. Registro e e-mail: falhas aqui não impedem a resposta
  var agora = new Date();
  var idDemanda = gerarIdDemanda(
    Utilities.formatDate(agora, CONFIG_MATCHING.FUSO, 'yyyyMMdd'),
    Utilities.getUuid().replace(/-/g, '')
  );
  try {
    var ss = abrirPlanilhaMatching_(cfg);
    registrarDemanda_(ss, montarLinhaDemanda(
      Utilities.formatDate(agora, CONFIG_MATCHING.FUSO, 'dd/MM/yyyy HH:mm:ss'), idDemanda, demanda, resultado, erroIA));
  } catch (err) {
    console.error('Falha ao gravar a demanda ' + idDemanda + ': ' + (err && err.stack ? err.stack : err));
  }
  try {
    enviarEmails_(cfg, demanda, idDemanda, resultado, erroIA);
  } catch (err) {
    console.error('Falha ao enviar e-mail da demanda ' + idDemanda + ': ' + (err && err.stack ? err.stack : err));
  }

  // 10. Resposta
  if (!resultado) return falha_('ia', { id_demanda: idDemanda });
  return { ok: true, id_demanda: idDemanda, resultado: resultado };
}

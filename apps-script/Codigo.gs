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
    var ref = registrarErro_('doPost: erro inesperado', err);
    return respostaJson_({ ok: false, erro: MENSAGENS_ERRO.inesperado + ' (ref. ' + ref + ')' });
  }
}

var CHAVE_ULTIMOS_ERROS_ = 'ULTIMOS_ERROS';
var MAX_ERROS_GUARDADOS_ = 10;
var LIMITE_BYTES_ERROS_ = 7000; // margem abaixo do limite de 9 KB por propriedade (acentos ocupam 2 bytes)

/**
 * Registra um erro no console e guarda os últimos erros nas Propriedades do script,
 * para consulta com verUltimosErros() (os registros de execução do app da web nem
 * sempre ficam visíveis no painel). Nunca guarda dados do formulário.
 * @return {string} código de referência curto, mostrado ao usuário
 */
function registrarErro_(contexto, err) {
  var ref = Utilities.getUuid().slice(0, 8).toUpperCase();
  var detalhe = String(err && err.stack ? err.stack : err).slice(0, 1200);
  console.error('[' + ref + '] ' + contexto + ': ' + detalhe);
  try {
    var props = PropertiesService.getScriptProperties();
    var lista = lerJson_(props.getProperty(CHAVE_ULTIMOS_ERROS_));
    lista.unshift({
      quando: Utilities.formatDate(new Date(), CONFIG_MATCHING.FUSO, 'dd/MM/yyyy HH:mm:ss'),
      ref: ref,
      contexto: contexto,
      detalhe: detalhe
    });
    // Cada propriedade guarda no máximo 9 KB: descarta os erros mais antigos até caber.
    lista = lista.slice(0, MAX_ERROS_GUARDADOS_);
    var json = JSON.stringify(lista);
    while (tamanhoEmBytes_(json) > LIMITE_BYTES_ERROS_ && lista.length > 1) {
      lista.pop();
      json = JSON.stringify(lista);
    }
    props.setProperty(CHAVE_ULTIMOS_ERROS_, json);
  } catch (e) {
    console.error('Não foi possível guardar o erro: ' + e);
  }
  return ref;
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
  // Só a leitura de arquivo (acao "extrair") pode passar de 20 KB, até 15 MB.
  var pareceExtracao = bruto.indexOf('"acao":"extrair"') >= 0;
  if (bruto.length > (pareceExtracao ? LIMITE_CORPO_EXTRACAO_BYTES : LIMITE_CORPO_BYTES)) return falha_('tamanho');

  var dados;
  try { dados = JSON.parse(bruto); } catch (err) { return falha_('formato'); }

  if (dados && typeof dados === 'object' && dados.acao === 'extrair') return processarExtracao_(dados);
  if (tamanhoEmBytes_(bruto) > LIMITE_CORPO_BYTES) return falha_('tamanho');

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
    registrarErro_('Matching: falha na IA', err);
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
    registrarErro_('Falha ao gravar a demanda ' + idDemanda, err);
  }
  try {
    enviarEmails_(cfg, demanda, idDemanda, resultado, erroIA);
  } catch (err) {
    registrarErro_('Falha ao enviar e-mail da demanda ' + idDemanda, err);
  }

  // 10. Resposta
  if (!resultado) return falha_('ia', { id_demanda: idDemanda });
  return { ok: true, id_demanda: idDemanda, resultado: resultado };
}

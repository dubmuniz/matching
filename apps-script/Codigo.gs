/**
 * Codigo.gs — web app: doGet, doPost e orquestração do matching (seção 5.1).
 *
 * Implantação: "Executar como: eu" e "Quem pode acessar: qualquer pessoa".
 * O frontend envia POST com Content-Type text/plain e corpo JSON (evita o preflight de CORS).
 *
 * Ações (campo "acao" do corpo):
 *   (nenhuma)       matching; com "idOportunidade", avaliação de um único edital escolhido
 *   codigo, entrar  login por código enviado ao e-mail (Acesso.gs)
 *   oportunidades   lista completa de oportunidades (Catalogo.gs)
 *   extrair         leitura de arquivo (Extracao.gs)
 *   proposta        rascunho de proposta (Proposta.gs)
 * Com o login ligado (LOGIN_ATIVO), todas as ações, menos codigo e entrar, exigem "passe".
 *
 * Resposta sempre em JSON:
 *   sucesso: { ok: true, id_demanda, resultado }          (resultado: ver montarResultado)
 *   erro:    { ok: false, erro: 'mensagem em português', campos?: { campo: mensagem }, codigo?: 'login' }
 * Detalhes técnicos dos erros vão só para console.error (Execuções do Apps Script).
 */

var MENSAGENS_ERRO = {
  tamanho: 'O envio é grande demais. Reduza os textos e tente de novo.',
  formato: 'Não foi possível ler o envio. Recarregue a página e tente de novo.',
  campos: 'Revise os campos destacados.',
  robo: 'Não foi possível confirmar o envio. Recarregue a página e tente de novo.',
  limiteEmail: 'Você atingiu o limite de 3 envios em 24 horas com este e-mail. Tente novamente amanhã.',
  limiteAvaliacao: 'Você atingiu o limite de 10 avaliações de edital em 24 horas. Tente novamente amanhã.',
  limiteLista: 'Muitos acessos à lista de oportunidades. Tente novamente mais tarde.',
  login: 'Sua sessão expirou ou não é válida. Entre novamente com o seu e-mail.',
  edital: 'Este edital não está mais disponível na base. Atualize a lista de oportunidades.',
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

var ACOES_ = ['codigo', 'entrar', 'oportunidades', 'extrair', 'proposta'];

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

/**
 * Recebe o envio, confere login e encaminha para a ação. Devolve o objeto de resposta (sem serializar).
 * @param {{ semLogin?: boolean }} opcoesTeste  só para as funções de teste do editor (Testes.gs);
 *   o doPost nunca passa este argumento
 */
function processarEnvio_(e, opcoesTeste) {
  // 1. Tamanho e formato
  var bruto = (e && e.postData && typeof e.postData.contents === 'string') ? e.postData.contents : '';
  if (!bruto) return falha_('formato');
  // Só a leitura de arquivo (acao "extrair") pode passar de 20 KB, até 15 MB.
  var pareceExtracao = bruto.indexOf('"acao":"extrair"') >= 0;
  if (bruto.length > (pareceExtracao ? LIMITE_CORPO_EXTRACAO_BYTES : LIMITE_CORPO_BYTES)) return falha_('tamanho');

  var dados;
  try { dados = JSON.parse(bruto); } catch (err) { return falha_('formato'); }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return falha_('formato');
  var acao = dados.acao;
  if (acao !== undefined && ACOES_.indexOf(acao) < 0) return falha_('formato');
  if (acao !== 'extrair' && tamanhoEmBytes_(bruto) > LIMITE_CORPO_BYTES) return falha_('tamanho');

  // 2. Login: pedir código e entrar não exigem passe
  if (acao === 'codigo') return processarPedidoCodigo_(dados);
  if (acao === 'entrar') return processarEntrada_(dados);

  var cfg = obterConfigMatching_();
  var sessao = (opcoesTeste && opcoesTeste.semLogin) ? { ok: true, email: '' } : sessaoDoEnvio_(cfg, dados);
  if (!sessao.ok) return falha_('login', { codigo: 'login' });
  if (acao === 'oportunidades') return processarListaOportunidades_(dados, cfg, sessao);
  if (sessao.email) aplicarEmailDaSessao_(dados, sessao.email);

  var r;
  if (acao === 'extrair') {
    r = processarExtracao_(dados);
    if (r.ok) registrarAcesso_(cfg, dados.email, 'Leitura de arquivo', '');
    return r;
  }
  if (acao === 'proposta') {
    r = processarProposta_(dados);
    if (r.ok) registrarAcesso_(cfg, dados.demanda.email, 'Proposta (parte ' + r.parte + ')', dados.idOportunidade);
    return r;
  }
  return processarMatching_(dados, cfg);
}

/** Matching (ou avaliação de um edital escolhido, com "idOportunidade"). */
function processarMatching_(dados, cfg) {
  // O edital escolhido não faz parte do formulário: sai antes da validação.
  var idFoco = dados.idOportunidade;
  delete dados.idOportunidade;
  if (idFoco !== undefined && (typeof idFoco !== 'string' || !idFoco || idFoco.length > 40)) return falha_('formato');
  var individual = idFoco !== undefined;

  // Honeypot (antes de qualquer outra coisa, sem dar pistas)
  if (honeypotPreenchido(dados)) {
    console.warn('Envio descartado: honeypot preenchido.');
    return falha_('robo');
  }

  // Validação de todos os campos
  var v = validarDemanda(dados);
  if (!v.ok) return falha_('campos', { campos: v.erros });
  var demanda = v.demanda;

  // Anti-abuso: Turnstile e limite de taxa (a avaliação de um edital tem cota própria)
  if (!verificarTurnstile_(cfg, dados.turnstileToken)) return falha_('robo');
  var limite = verificarLimiteDeTaxa_(demanda.email, individual ? 'avaliacao' : 'matching');
  if (!limite.permitido) {
    console.warn('Envio bloqueado pelo limite de taxa: ' + limite.motivo);
    return falha_(limite.motivo === 'email' ? (individual ? 'limiteAvaliacao' : 'limiteEmail')
      : limite.motivo === 'global' ? 'limiteGlobal' : 'ocupado');
  }

  // Base, pré-seleção, IA e cards
  var hoje = hojeSaoPaulo_();
  var base = carregarBaseMatching_(cfg, hoje);
  var candidatos, organizacoes, edital = null;
  if (individual) {
    edital = base.candidatos.filter(function (o) { return o.id === idFoco; })[0];
    if (!edital) return falha_('edital');
    candidatos = [edital];
    organizacoes = [];
  } else {
    candidatos = preselecionarCandidatos(demanda, base.candidatos, CONFIG_MATCHING.MAX_CANDIDATOS);
    organizacoes = base.organizacoesParaIA;
  }
  var resultado = null, erroIA = '';
  try {
    var ia = executarMatchingIA_(cfg, demanda, candidatos, organizacoes, { individual: individual });
    resultado = montarResultado(ia.resultado, candidatos, organizacoes, { individual: individual });
  } catch (err) {
    erroIA = String(err && err.message ? err.message : err).slice(0, 500);
    registrarErro_('Matching: falha na IA', err);
  }

  // Registro e e-mail: falhas aqui não impedem a resposta
  var agora = new Date();
  var idDemanda = gerarIdDemanda(
    Utilities.formatDate(agora, CONFIG_MATCHING.FUSO, 'yyyyMMdd'),
    Utilities.getUuid().replace(/-/g, '')
  );
  var opcoesRegistro = {
    versaoPrompt: individual ? PROMPT_VERSAO + '+' + PROMPT_VERSAO_INDIVIDUAL : PROMPT_VERSAO,
    editalAvaliado: individual ? edital.id + ' — ' + edital.edital + ' (' + edital.financiador + ')' : ''
  };
  try {
    var ss = abrirPlanilhaMatching_(cfg);
    registrarDemanda_(ss, montarLinhaDemanda(
      Utilities.formatDate(agora, CONFIG_MATCHING.FUSO, 'dd/MM/yyyy HH:mm:ss'), idDemanda, demanda, resultado, erroIA, opcoesRegistro));
  } catch (err) {
    registrarErro_('Falha ao gravar a demanda ' + idDemanda, err);
  }
  try {
    enviarEmails_(cfg, demanda, idDemanda, resultado, erroIA, opcoesRegistro);
  } catch (err) {
    registrarErro_('Falha ao enviar e-mail da demanda ' + idDemanda, err);
  }
  registrarAcesso_(cfg, demanda.email, individual ? 'Avaliação de edital' : 'Matching',
    idDemanda + (individual ? ' · ' + edital.id : ''));

  // Resposta
  if (!resultado) return falha_('ia', { id_demanda: idDemanda });
  return { ok: true, id_demanda: idDemanda, resultado: resultado };
}

/**
 * Seguranca.gs — validação do formulário, honeypot, Turnstile e limite de taxa.
 *
 * O servidor é a autoridade: toda regra aqui vale mesmo que o navegador já tenha validado.
 * As listas fechadas abaixo são o contrato com o frontend (docs/app.js usa os mesmos valores).
 *
 * Funções puras (validarDemanda, aplicarJanelaDeLimite, dominioPermitidoParaCopia) são testadas no Node.
 */

var UNIDADES_FIOCRUZ = [
  'Presidência',
  'Bio-Manguinhos',
  'Farmanguinhos',
  'ENSP',
  'EPSJV',
  'ICICT',
  'IFF',
  'INCQS',
  'INI',
  'IOC',
  'COC – Casa de Oswaldo Cruz',
  'ILMD – Fiocruz Amazônia',
  'IAM – Fiocruz Pernambuco',
  'IGM – Fiocruz Bahia',
  'IRR – Fiocruz Minas',
  'ICC – Fiocruz Paraná',
  'Fiocruz Brasília',
  'Fiocruz Ceará',
  'Fiocruz Mato Grosso do Sul',
  'Fiocruz Piauí',
  'Fiocruz Rondônia',
  'Outra'
];

var AREAS_TEMATICAS = [
  'Doenças infecciosas e negligenciadas',
  'Arboviroses e vetores',
  'Vacinas, biofármacos e insumos',
  'Clima e saúde',
  'Saúde materno-infantil',
  'Saúde digital e ciência de dados',
  'Vigilância em saúde',
  'Sistemas e políticas de saúde',
  'Educação e formação em saúde',
  'Territórios, comunidades e determinantes sociais',
  'Biodiversidade e ambiente',
  'Inovação e desenvolvimento tecnológico',
  'Outra'
];

var ESTAGIOS_MATURIDADE = [
  'Ideia inicial',
  'Projeto estruturado',
  'Em execução, buscando ampliação',
  'Solução pronta para escalar'
];

var FAIXAS_VALOR = [
  'Até R$ 250 mil',
  'R$ 250 mil–1 milhão',
  'R$ 1–5 milhões',
  'Acima de R$ 5 milhões',
  'Não sei'
];

var HORIZONTES_INICIO = ['Até 6 meses', '6–12 meses', 'Mais de 12 meses'];

var IDIOMAS_SUBMISSAO = ['Português', 'Inglês', 'Espanhol', 'Francês'];

// Todos os campos aceitos no corpo do POST. Qualquer outro é rejeitado.
var CAMPOS_FORMULARIO = [
  'nome', 'email', 'unidade', 'unidadeOutra', 'titulo', 'resumo', 'problema', 'objetivos',
  'areas', 'abrangencia', 'maturidade', 'valorEstimado', 'horizonte', 'parceiros', 'idiomas',
  'consentimento',
  'idiomaProposta',  // opcional: idioma do rascunho de proposta (fase 2B); padrão Português
  'site',            // honeypot: campo invisível que precisa chegar vazio
  'turnstileToken'   // token do Cloudflare Turnstile
];

var LIMITE_CORPO_BYTES = 20 * 1024;
var LIMITE_ENVIOS_POR_EMAIL = 3;          // a cada 24 h
var JANELA_EMAIL_MS = 24 * 60 * 60 * 1000;
var LIMITE_ENVIOS_GLOBAIS = 30;           // por hora
var JANELA_GLOBAL_MS = 60 * 60 * 1000;
var PREFIXO_LIMITE_EMAIL_ = 'LIMITE_EMAIL_';
var CHAVE_LIMITE_GLOBAL_ = 'LIMITE_GLOBAL';

// Cotas por tipo de uso. A extração de arquivos (fase 2) tem cota própria.
var COTAS_TAXA_ = {
  matching: { porEmail: LIMITE_ENVIOS_POR_EMAIL, global: LIMITE_ENVIOS_GLOBAIS, prefixo: PREFIXO_LIMITE_EMAIL_, chaveGlobal: CHAVE_LIMITE_GLOBAL_ },
  extracao: { porEmail: 5, global: 30, prefixo: 'LIMITE_EXTRACAO_EMAIL_', chaveGlobal: 'LIMITE_EXTRACAO_GLOBAL' },
  proposta: { porEmail: 5, global: 20, prefixo: 'LIMITE_PROPOSTA_EMAIL_', chaveGlobal: 'LIMITE_PROPOSTA_GLOBAL' },
  proposta2: { porEmail: 5, global: 20, prefixo: 'LIMITE_PROPOSTA2_EMAIL_', chaveGlobal: 'LIMITE_PROPOSTA2_GLOBAL' }
};

/* =====================================================================
 * Funções puras
 * ===================================================================== */

/** Remove caracteres de controle (mantém quebra de linha e tabulação nos campos longos). */
function limparTexto_(v, multilinha) {
  var s = String(v);
  s = multilinha
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  return s.trim();
}

function validarEmail_(email) {
  return email.length <= 254 &&
    /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+$/.test(email);
}

/**
 * Valida o corpo do formulário.
 * @return {{ ok: boolean, erros: Object<string,string>, demanda: Object }}
 *   erros: campo → mensagem em português. `demanda` só vem limpa quando ok.
 */
function validarDemanda(dados) {
  var erros = {};
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { ok: false, erros: { _geral: 'Envio em formato inválido.' }, demanda: null };
  }

  Object.keys(dados).forEach(function (k) {
    if (CAMPOS_FORMULARIO.indexOf(k) < 0) erros._geral = 'O envio contém campos não reconhecidos.';
  });

  var d = {};

  function texto(campo, rotulo, min, max, opcoes) {
    opcoes = opcoes || {};
    var v = dados[campo];
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') { erros[campo] = rotulo + ': formato inválido.'; return; }
    v = limparTexto_(v, opcoes.multilinha);
    if (!v && opcoes.opcional) { d[campo] = ''; return; }
    if (v.length < min) { erros[campo] = rotulo + ': informe pelo menos ' + min + ' caracteres.'; return; }
    if (v.length > max) { erros[campo] = rotulo + ': use no máximo ' + max + ' caracteres.'; return; }
    d[campo] = v;
  }

  function escolha(campo, rotulo, lista) {
    var v = dados[campo];
    if (typeof v !== 'string' || lista.indexOf(v) < 0) { erros[campo] = rotulo + ': escolha uma opção da lista.'; return; }
    d[campo] = v;
  }

  function multipla(campo, rotulo, lista, min, max) {
    var v = dados[campo];
    if (!Array.isArray(v)) { erros[campo] = rotulo + ': escolha ao menos ' + min + ' opção.'; return; }
    var unicos = [];
    for (var i = 0; i < v.length; i++) {
      if (typeof v[i] !== 'string' || lista.indexOf(v[i]) < 0) { erros[campo] = rotulo + ': opção inválida.'; return; }
      if (unicos.indexOf(v[i]) < 0) unicos.push(v[i]);
    }
    if (unicos.length < min) { erros[campo] = rotulo + ': escolha ao menos ' + min + (min > 1 ? ' opções.' : ' opção.'); return; }
    if (unicos.length > max) { erros[campo] = rotulo + ': escolha no máximo ' + max + ' opções.'; return; }
    d[campo] = unicos;
  }

  texto('nome', 'Nome do pesquisador', 3, 120);

  var email = typeof dados.email === 'string' ? limparTexto_(dados.email).toLowerCase() : '';
  if (!validarEmail_(email)) erros.email = 'E-mail institucional: informe um e-mail válido.';
  else d.email = email;

  escolha('unidade', 'Unidade Fiocruz', UNIDADES_FIOCRUZ);
  if (d.unidade === 'Outra') texto('unidadeOutra', 'Nome da unidade', 2, 120);
  else d.unidadeOutra = '';

  texto('titulo', 'Título do projeto', 5, 200);
  texto('resumo', 'Resumo', 100, 1500, { multilinha: true });
  texto('problema', 'Problema ou necessidade', 50, 1000, { multilinha: true });
  texto('objetivos', 'Objetivos principais', 50, 1000, { multilinha: true });
  multipla('areas', 'Áreas temáticas', AREAS_TEMATICAS, 1, 3);
  texto('abrangencia', 'Abrangência geográfica', 3, 300);
  escolha('maturidade', 'Estágio de maturidade', ESTAGIOS_MATURIDADE);
  escolha('valorEstimado', 'Valor estimado necessário', FAIXAS_VALOR);
  escolha('horizonte', 'Horizonte de início desejado', HORIZONTES_INICIO);
  texto('parceiros', 'Parceiros internacionais', 0, 500, { multilinha: true, opcional: true });
  multipla('idiomas', 'Idiomas de submissão', IDIOMAS_SUBMISSAO, 1, IDIOMAS_SUBMISSAO.length);

  if (dados.idiomaProposta === undefined || dados.idiomaProposta === '') d.idiomaProposta = 'Português';
  else escolha('idiomaProposta', 'Idioma da proposta', IDIOMAS_SUBMISSAO);

  if (dados.consentimento !== true) erros.consentimento = 'É preciso autorizar o uso das informações para continuar.';

  var ok = Object.keys(erros).length === 0;
  return { ok: ok, erros: erros, demanda: ok ? d : null };
}

/** true se o honeypot foi preenchido (provável robô). */
function honeypotPreenchido(dados) {
  return !!(dados && dados.site !== undefined && dados.site !== null && String(dados.site).trim() !== '');
}

/**
 * Janela deslizante: descarta registros antigos e diz se cabe mais um envio.
 * @param {number[]} registros  horários (ms) dos envios anteriores
 * @return {{ permitido: boolean, registros: number[] }}  registros atualizados (com o envio atual, se permitido)
 */
function aplicarJanelaDeLimite(registros, agora, janelaMs, maximo) {
  var recentes = (Array.isArray(registros) ? registros : []).filter(function (t) {
    return typeof t === 'number' && t > agora - janelaMs && t <= agora;
  });
  if (recentes.length >= maximo) return { permitido: false, registros: recentes };
  recentes.push(agora);
  return { permitido: true, registros: recentes };
}

/** Cópia ao pesquisador só se o domínio do e-mail for exatamente um dos permitidos. */
function dominioPermitidoParaCopia(email, dominios) {
  var partes = String(email || '').toLowerCase().split('@');
  if (partes.length !== 2 || !partes[1]) return false;
  return (dominios || []).indexOf(partes[1]) >= 0;
}

/* =====================================================================
 * Funções com Apps Script
 * ===================================================================== */

function tamanhoEmBytes_(s) {
  return Utilities.newBlob(String(s || '')).getBytes().length;
}

/** Confere o token do Turnstile no Cloudflare. Com o Turnstile desligado, sempre aprova. */
function verificarTurnstile_(cfg, token) {
  if (!cfg.turnstileAtivo) return true;
  if (!cfg.turnstileSecret) {
    console.error('TURNSTILE_ATIVO=sim, mas TURNSTILE_SECRET está vazio. Envio recusado.');
    return false;
  }
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    var res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post',
      payload: { secret: cfg.turnstileSecret, response: token },
      muteHttpExceptions: true
    });
    var dados = JSON.parse(res.getContentText('UTF-8'));
    if (!dados.success) console.warn('Turnstile recusou: ' + JSON.stringify(dados['error-codes'] || []));
    return dados.success === true;
  } catch (e) {
    console.error('Falha ao verificar o Turnstile: ' + e);
    return false;
  }
}

function chaveLimiteEmail_(email, prefixo) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email).toLowerCase(), Utilities.Charset.UTF_8);
  return (prefixo || PREFIXO_LIMITE_EMAIL_) + Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/**
 * Aplica os limites de taxa e já registra o uso atual.
 * - por e-mail: N usos a cada 24 h (guardado em Propriedades do usuário, porque o
 *   CacheService só guarda por até 6 h). A chave é um hash do e-mail, não o e-mail;
 * - global: N usos por hora (CacheService).
 * @param {string} tipo  'matching' (padrão: 3 por e-mail, 30 por hora) ou 'extracao' (5 e 30)
 * @return {{ permitido: boolean, motivo?: 'email'|'global'|'ocupado' }}
 */
function verificarLimiteDeTaxa_(email, tipo) {
  var cota = COTAS_TAXA_[tipo || 'matching'];
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(10000)) return { permitido: false, motivo: 'ocupado' };
  try {
    var agora = Date.now();
    var cache = CacheService.getScriptCache();
    var props = PropertiesService.getUserProperties();

    var global = aplicarJanelaDeLimite(lerJson_(cache.get(cota.chaveGlobal)), agora, JANELA_GLOBAL_MS, cota.global);
    if (!global.permitido) return { permitido: false, motivo: 'global' };

    var chave = chaveLimiteEmail_(email, cota.prefixo);
    var porEmail = aplicarJanelaDeLimite(lerJson_(props.getProperty(chave)), agora, JANELA_EMAIL_MS, cota.porEmail);
    if (!porEmail.permitido) return { permitido: false, motivo: 'email' };

    cache.put(cota.chaveGlobal, JSON.stringify(global.registros), Math.ceil(JANELA_GLOBAL_MS / 1000));
    props.setProperty(chave, JSON.stringify(porEmail.registros));
    limparLimitesVencidos_(props, agora);
    return { permitido: true };
  } finally {
    trava.releaseLock();
  }
}

function lerJson_(s) {
  if (!s) return [];
  try { return JSON.parse(s); } catch (e) { return []; }
}

/** Apaga registros de e-mail cujo último envio tem mais de 24 h. */
function limparLimitesVencidos_(props, agora) {
  var todas = props.getProperties();
  Object.keys(todas).forEach(function (k) {
    if (!ehChaveDeLimite_(k)) return;
    var ativos = lerJson_(todas[k]).filter(function (t) { return t > agora - JANELA_EMAIL_MS; });
    if (!ativos.length) props.deleteProperty(k);
  });
}

/** Para testes: zera os limites de taxa (rode pelo editor). */
function ehChaveDeLimite_(k) {
  return Object.keys(COTAS_TAXA_).some(function (t) { return k.indexOf(COTAS_TAXA_[t].prefixo) === 0; });
}

function limparLimitesDeTaxa() {
  var cache = CacheService.getScriptCache();
  Object.keys(COTAS_TAXA_).forEach(function (t) { cache.remove(COTAS_TAXA_[t].chaveGlobal); });
  var props = PropertiesService.getUserProperties();
  var n = 0;
  Object.keys(props.getProperties()).forEach(function (k) {
    if (ehChaveDeLimite_(k)) { props.deleteProperty(k); n++; }
  });
  console.log('Limites de taxa zerados (' + n + ' e-mail(s)).');
}

if (typeof module !== 'undefined') {
  module.exports = {
    UNIDADES_FIOCRUZ: UNIDADES_FIOCRUZ,
    AREAS_TEMATICAS: AREAS_TEMATICAS,
    ESTAGIOS_MATURIDADE: ESTAGIOS_MATURIDADE,
    FAIXAS_VALOR: FAIXAS_VALOR,
    HORIZONTES_INICIO: HORIZONTES_INICIO,
    IDIOMAS_SUBMISSAO: IDIOMAS_SUBMISSAO,
    validarDemanda: validarDemanda,
    honeypotPreenchido: honeypotPreenchido,
    aplicarJanelaDeLimite: aplicarJanelaDeLimite,
    dominioPermitidoParaCopia: dominioPermitidoParaCopia
  };
}

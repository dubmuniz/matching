/**
 * Acesso.gs — login por código enviado ao e-mail institucional, passe assinado e registro de acessos.
 *
 * Fluxo:
 *   1. { acao: 'codigo', email, site, turnstileToken } → envia um código de 6 dígitos (vale 10 minutos);
 *   2. { acao: 'entrar', email, codigo, site }          → devolve um passe assinado (vale 30 dias);
 *   3. as demais ações levam { passe } e o servidor usa o e-mail do passe (o do formulário é ignorado).
 *
 * - O código nunca é gravado: fica só no CacheService, como hash, e some depois de usado,
 *   de 10 minutos ou de 5 tentativas erradas.
 * - O passe é "e-mail|validade|assinatura", com HMAC-SHA256 e segredo guardado em SEGREDO_PASSE
 *   (criado automaticamente). Apagar SEGREDO_PASSE desconecta todo mundo.
 * - Cada login e cada uso ficam na aba Acessos (data/hora, e-mail, evento, detalhe), por
 *   RETENCAO_ACESSOS_MESES (padrão 12). As linhas mais antigas são apagadas automaticamente.
 * - LOGIN_ATIVO=nao desliga o login (o formulário volta a aceitar qualquer e-mail).
 *
 * Funções puras (emailPermitidoParaLogin, codigoDeHex, iguaisEmTempoConstante, separarPasse,
 * linhasDeAcessoVencidas) são testadas no Node (tests/acesso.test.js).
 */

var VALIDADE_PASSE_DIAS = 30;
var VALIDADE_CODIGO_SEGUNDOS = 600;
var MAX_TENTATIVAS_CODIGO = 5;
var PREFIXO_CODIGO_ = 'CODIGO_LOGIN_';
var PREFIXO_ACESSO_LISTA_ = 'ACESSO_LISTA_';
var CHAVE_LIMPEZA_ACESSOS_ = 'LIMPEZA_ACESSOS';
var CABECALHO_ACESSOS = ['Data/hora', 'E-mail', 'Evento', 'Detalhe'];

var CAMPOS_PEDIDO_CODIGO = ['acao', 'email', 'site', 'turnstileToken'];
var CAMPOS_ENTRADA = ['acao', 'email', 'codigo', 'site'];

var MENSAGENS_ACESSO = {
  formato: 'Não foi possível ler o envio. Recarregue a página e tente de novo.',
  robo: 'Não foi possível confirmar o envio. Recarregue a página e tente de novo.',
  email: 'Informe um e-mail válido.',
  dominio: 'Este e-mail não tem acesso à plataforma. Use o seu e-mail institucional.',
  desligado: 'O acesso por código está desligado. Recarregue a página.',
  limiteEmail: 'Você pediu muitos códigos nas últimas 24 horas. Use o último código recebido ou tente amanhã.',
  limiteGlobal: 'Muitos pedidos de acesso na última hora. Tente novamente mais tarde.',
  ocupado: 'O sistema está ocupado. Tente novamente em alguns instantes.',
  cotaEmail: 'O sistema atingiu o limite diário de envio de e-mails. Tente novamente amanhã ou fale com o Escritório de Captação.',
  envio: 'Não foi possível enviar o código agora. Tente novamente em alguns minutos.',
  codigoFormato: 'O código tem 6 números. Confira e tente de novo.',
  codigoExpirado: 'Este código expirou ou já foi usado. Peça um novo código.',
  codigoErrado: 'Código incorreto. Confira o e-mail e tente de novo.',
  tentativas: 'Muitas tentativas com código errado. Peça um novo código.'
};

/* =====================================================================
 * Funções puras
 * ===================================================================== */

/**
 * O e-mail pode entrar? Cada item da lista é um domínio (correspondência exata, sem subdomínios)
 * ou um endereço completo (com @), para liberar pessoas de fora dos domínios.
 */
function emailPermitidoParaLogin(email, lista, bloqueados) {
  var e = String(email || '').toLowerCase();
  var partes = e.split('@');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
  if ((bloqueados || []).indexOf(e) >= 0) return false;
  return (lista || []).some(function (item) {
    var i = String(item || '').toLowerCase();
    return i.indexOf('@') >= 0 ? i === e : i === partes[1];
  });
}

/** Código de 6 dígitos a partir de 12 caracteres hexadecimais aleatórios (48 bits; viés desprezível). */
function codigoDeHex(hex) {
  var n = parseInt(String(hex).replace(/[^0-9a-f]/gi, '').slice(0, 12), 16);
  if (!isFinite(n)) throw new Error('Fonte aleatória inválida para o código.');
  return ('000000' + (n % 1000000)).slice(-6);
}

/** Compara duas strings sem sair no primeiro caractere diferente. */
function iguaisEmTempoConstante(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** 'email|validade|assinatura' → { email, validade, assinatura } ou null. */
function separarPasse(passe) {
  if (typeof passe !== 'string' || passe.length > 400) return null;
  var p = passe.split('|');
  if (p.length !== 3 || !/^\d{10,15}$/.test(p[1]) || !/^[A-Za-z0-9_-]{20,100}$/.test(p[2])) return null;
  var email = p[0].toLowerCase();
  if (!validarEmail_(email)) return null;
  return { email: email, validade: Number(p[1]), assinatura: p[2] };
}

/**
 * Quantas linhas do início da aba Acessos são anteriores ao limite.
 * As linhas são gravadas em ordem cronológica; a contagem para na primeira linha recente.
 * @param {Array} datas  valores da coluna Data/hora (Date ou 'dd/MM/yyyy HH:mm:ss')
 */
function linhasDeAcessoVencidas(datas, limite) {
  var n = 0;
  for (var i = 0; i < datas.length; i++) {
    var d = dataDoAcesso_(datas[i]);
    if (!d || d.getTime() >= limite.getTime()) break;
    n++;
  }
  return n;
}

function dataDoAcesso_(v) {
  if (v instanceof Date || (v && typeof v.getTime === 'function')) return v;
  var m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
}

/* =====================================================================
 * Passe e sessão
 * ===================================================================== */

/** Segredo do passe. Criado na primeira vez (64 caracteres aleatórios) e guardado nas Propriedades. */
function segredoPasse_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SEGREDO_PASSE');
  if (s && s.length >= 32) return s;
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(10000)) throw new Error('Não foi possível criar o segredo do passe (trava ocupada).');
  try {
    s = props.getProperty('SEGREDO_PASSE');
    if (!s || s.length < 32) {
      s = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
      props.setProperty('SEGREDO_PASSE', s);
    }
    return s;
  } finally {
    trava.releaseLock();
  }
}

function assinarPasse_(email, validade) {
  var bytes = Utilities.computeHmacSha256Signature('passe-v1|' + email + '|' + validade, segredoPasse_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function emitirPasse_(email, agora) {
  var validade = agora + VALIDADE_PASSE_DIAS * 24 * 60 * 60 * 1000;
  return { passe: email + '|' + validade + '|' + assinarPasse_(email, validade), validade: validade };
}

/** @return {{ ok: boolean, email?: string, motivo?: string }} */
function verificarPasse_(cfg, passe, agora) {
  var p = separarPasse(passe);
  if (!p) return { ok: false, motivo: 'ausente ou malformado' };
  if (p.validade <= agora) return { ok: false, motivo: 'vencido' };
  if (p.validade > agora + (VALIDADE_PASSE_DIAS + 1) * 24 * 60 * 60 * 1000) return { ok: false, motivo: 'validade impossível' };
  if (!iguaisEmTempoConstante(assinarPasse_(p.email, p.validade), p.assinatura)) return { ok: false, motivo: 'assinatura' };
  if (!emailPermitidoParaLogin(p.email, cfg.dominiosLogin, cfg.emailsBloqueados)) return { ok: false, motivo: 'e-mail sem acesso' };
  return { ok: true, email: p.email };
}

/**
 * Confere o passe do envio (se o login estiver ligado) e o remove dos dados.
 * @return {{ ok: boolean, email: string }}  email vazio com o login desligado
 */
function sessaoDoEnvio_(cfg, dados) {
  var passe = dados.passe;
  delete dados.passe;
  if (!cfg.loginAtivo) return { ok: true, email: '' };
  var v = verificarPasse_(cfg, passe, Date.now());
  if (!v.ok) {
    if (passe) console.warn('Passe recusado: ' + v.motivo);
    return { ok: false, email: '' };
  }
  return { ok: true, email: v.email };
}

/** Com login, o e-mail que vale é o do passe, nunca o digitado. */
function aplicarEmailDaSessao_(dados, email) {
  if (dados.acao === 'proposta') {
    if (dados.demanda && typeof dados.demanda === 'object' && !Array.isArray(dados.demanda)) dados.demanda.email = email;
  } else {
    dados.email = email;
  }
}

/* =====================================================================
 * Código por e-mail
 * ===================================================================== */

function falhaAcesso_(chave, extra) {
  var r = { ok: false, erro: MENSAGENS_ACESSO[chave] };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return r;
}

function hashTexto_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function chaveCodigo_(email) {
  return PREFIXO_CODIGO_ + hashTexto_(email);
}

function hashCodigo_(email, codigo) {
  return hashTexto_('codigo-v1|' + email + '|' + codigo);
}

function processarPedidoCodigo_(dados) {
  if (Object.keys(dados).some(function (k) { return CAMPOS_PEDIDO_CODIGO.indexOf(k) < 0; })) return falhaAcesso_('formato');
  if (honeypotPreenchido(dados)) {
    console.warn('Pedido de código descartado: honeypot preenchido.');
    return falhaAcesso_('robo');
  }
  var email = typeof dados.email === 'string' ? limparTexto_(dados.email).toLowerCase() : '';
  if (!validarEmail_(email)) return falhaAcesso_('email');

  var cfg = obterConfigMatching_();
  if (!cfg.loginAtivo) return falhaAcesso_('desligado');
  // Turnstile e limite de taxa antes de tudo que grava ou envia (inclusive o registro de recusa).
  if (!verificarTurnstile_(cfg, dados.turnstileToken)) return falhaAcesso_('robo');
  var limite = verificarLimiteDeTaxa_(email, 'codigo');
  if (!limite.permitido) {
    console.warn('Pedido de código bloqueado pelo limite de taxa: ' + limite.motivo);
    return falhaAcesso_(limite.motivo === 'email' ? 'limiteEmail' : limite.motivo === 'global' ? 'limiteGlobal' : 'ocupado');
  }
  if (!emailPermitidoParaLogin(email, cfg.dominiosLogin, cfg.emailsBloqueados)) {
    registrarAcesso_(cfg, email, 'Acesso recusado', 'e-mail fora dos domínios autorizados ou bloqueado');
    return falhaAcesso_('dominio');
  }
  if (MailApp.getRemainingDailyQuota() < 1) {
    registrarErro_('Login: cota diária de e-mails esgotada', 'MailApp.getRemainingDailyQuota() = 0');
    return falhaAcesso_('cotaEmail');
  }

  var codigo = codigoDeHex(Utilities.getUuid().replace(/-/g, ''));
  CacheService.getScriptCache().put(chaveCodigo_(email),
    JSON.stringify({ h: hashCodigo_(email, codigo), n: 0, t: Date.now() }), VALIDADE_CODIGO_SEGUNDOS);

  try {
    MailApp.sendEmail({
      to: email,
      subject: '[Fioconecta] Seu código de acesso: ' + codigo,
      body: [
        'Seu código de acesso ao Fioconecta é: ' + codigo,
        '',
        'Ele vale por 10 minutos. Se você não pediu este código, ignore esta mensagem.'
      ].join('\n'),
      htmlBody: [
        '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#222">',
        '<p>Seu código de acesso ao Fioconecta é:</p>',
        '<p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:8px 0">' + codigo + '</p>',
        '<p>Ele vale por 10 minutos. Se você não pediu este código, ignore esta mensagem.</p>',
        '</div>'
      ].join('\n'),
      name: 'Fioconecta'
    });
  } catch (err) {
    CacheService.getScriptCache().remove(chaveCodigo_(email));
    var ref = registrarErro_('Login: falha ao enviar o código', err);
    return falhaAcesso_('envio', { erro: MENSAGENS_ACESSO.envio + ' (ref. ' + ref + ')' });
  }
  registrarAcesso_(cfg, email, 'Código enviado', '');
  return { ok: true, email: email, validade_minutos: VALIDADE_CODIGO_SEGUNDOS / 60 };
}

function processarEntrada_(dados) {
  if (Object.keys(dados).some(function (k) { return CAMPOS_ENTRADA.indexOf(k) < 0; })) return falhaAcesso_('formato');
  if (honeypotPreenchido(dados)) return falhaAcesso_('robo');
  var email = typeof dados.email === 'string' ? limparTexto_(dados.email).toLowerCase() : '';
  if (!validarEmail_(email)) return falhaAcesso_('email');
  var codigo = typeof dados.codigo === 'string' ? dados.codigo.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(codigo)) return falhaAcesso_('codigoFormato');

  var cfg = obterConfigMatching_();
  if (!cfg.loginAtivo) return falhaAcesso_('desligado');

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(10000)) return falhaAcesso_('ocupado');
  var resultado;
  try {
    var cache = CacheService.getScriptCache();
    var chave = chaveCodigo_(email);
    var reg = null;
    try { reg = JSON.parse(cache.get(chave) || 'null'); } catch (e) { reg = null; }
    if (!reg || typeof reg.h !== 'string') {
      resultado = { falha: 'codigoExpirado' };
    } else if (!iguaisEmTempoConstante(hashCodigo_(email, codigo), reg.h)) {
      reg.n = (Number(reg.n) || 0) + 1;
      if (reg.n >= MAX_TENTATIVAS_CODIGO) {
        cache.remove(chave);
        resultado = { falha: 'tentativas', evento: 'Código bloqueado', detalhe: reg.n + ' tentativas erradas' };
      } else {
        var restante = Math.ceil(VALIDADE_CODIGO_SEGUNDOS - (Date.now() - Number(reg.t || 0)) / 1000);
        if (restante > 0) cache.put(chave, JSON.stringify(reg), Math.min(restante, VALIDADE_CODIGO_SEGUNDOS));
        else cache.remove(chave);
        resultado = { falha: 'codigoErrado', evento: 'Código incorreto', detalhe: 'tentativa ' + reg.n };
      }
    } else {
      cache.remove(chave);
      resultado = { ok: true };
    }
  } finally {
    trava.releaseLock();
  }

  if (!resultado.ok) {
    if (resultado.evento) registrarAcesso_(cfg, email, resultado.evento, resultado.detalhe);
    return falhaAcesso_(resultado.falha);
  }
  if (!emailPermitidoParaLogin(email, cfg.dominiosLogin, cfg.emailsBloqueados)) return falhaAcesso_('dominio');

  var passe = emitirPasse_(email, Date.now());
  var expira = Utilities.formatDate(new Date(passe.validade), CONFIG_MATCHING.FUSO, 'dd/MM/yyyy');
  registrarAcesso_(cfg, email, 'Login confirmado', 'passe válido até ' + expira);
  limparAcessosSeNecessario_(cfg);
  return { ok: true, passe: passe.passe, email: email, expira: expira };
}

/* =====================================================================
 * Aba Acessos
 * ===================================================================== */

function obterAbaAcessos_(ss) {
  var sh = ss.getSheetByName(CONFIG_MATCHING.ABA_ACESSOS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_MATCHING.ABA_ACESSOS);
    sh.getRange(1, 1, 1, CABECALHO_ACESSOS.length).setValues([CABECALHO_ACESSOS]);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CABECALHO_ACESSOS.length).setValues([CABECALHO_ACESSOS]);
  }
  return sh;
}

/** Grava uma linha na aba Acessos. Nunca lança erro: falhas aqui não impedem a resposta. */
function registrarAcesso_(cfg, email, evento, detalhe) {
  try {
    var sh = obterAbaAcessos_(abrirPlanilhaMatching_(cfg));
    sh.appendRow([new Date(), protegerCelula(String(email || '').slice(0, 254)), evento, protegerCelula(String(detalhe || '').slice(0, 300))]);
  } catch (err) {
    registrarErro_('Falha ao registrar acesso (' + evento + ')', err);
  }
}

/** Registra o acesso à lista de oportunidades no máximo uma vez a cada 6 horas por e-mail. */
function registrarAcessoALista_(cfg, email) {
  if (!email) return;
  var cache = CacheService.getScriptCache();
  var chave = PREFIXO_ACESSO_LISTA_ + hashTexto_(email);
  if (cache.get(chave)) return;
  cache.put(chave, '1', 6 * 60 * 60);
  registrarAcesso_(cfg, email, 'Lista de oportunidades', '');
}

/**
 * Apaga da aba Acessos as linhas com mais de RETENCAO_ACESSOS_MESES meses (padrão 12).
 * Roda sozinha no máximo a cada 6 horas (depois de um login); também pode ser rodada pelo editor.
 */
function limparAcessosAntigos() {
  var cfg = obterConfigMatching_();
  var sh = obterAbaAcessos_(abrirPlanilhaMatching_(cfg));
  var n = sh.getLastRow() - 1;
  if (n <= 0) { console.log('Aba Acessos vazia.'); return 0; }
  var limite = new Date();
  limite.setMonth(limite.getMonth() - cfg.retencaoAcessosMeses);
  var datas = sh.getRange(2, 1, n, 1).getValues().map(function (l) { return l[0]; });
  var vencidas = linhasDeAcessoVencidas(datas, limite);
  if (vencidas > 0) sh.deleteRows(2, vencidas);
  console.log('Acessos apagados (mais de ' + cfg.retencaoAcessosMeses + ' meses): ' + vencidas);
  return vencidas;
}

function limparAcessosSeNecessario_(cfg) {
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get(CHAVE_LIMPEZA_ACESSOS_)) return;
    cache.put(CHAVE_LIMPEZA_ACESSOS_, '1', 6 * 60 * 60);
    limparAcessosAntigos();
  } catch (err) {
    registrarErro_('Falha ao limpar acessos antigos', err);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    emailPermitidoParaLogin: emailPermitidoParaLogin,
    codigoDeHex: codigoDeHex,
    iguaisEmTempoConstante: iguaisEmTempoConstante,
    linhasDeAcessoVencidas: linhasDeAcessoVencidas
  };
}

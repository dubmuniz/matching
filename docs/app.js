/*
 * Fioconecta · Matching de Oportunidades — frontend.
 *
 * Regras de segurança:
 * - todo texto vindo do servidor entra na página com textContent (nunca innerHTML);
 * - links só são exibidos com protocolo http(s), em nova aba, com rel="noopener noreferrer";
 * - a validação aqui é só para ajudar o usuário: o servidor valida tudo de novo.
 *
 * Telas (pelo endereço): #oportunidades (lista), #avaliar (matching com toda a base) e
 * #avaliar/<ID> (avaliação de um edital escolhido). Com o login ligado no servidor, a tela de
 * entrada aparece antes de tudo; o passe fica guardado neste navegador por 30 dias.
 *
 * Modo de teste sem backend: ?mock=1 (resultado de exemplo), ?mock=vazio, ?mock=erro,
 * ?mock=login (pede login; o código de teste é 123456).
 *
 * As listas e a validação abaixo espelham apps-script/Seguranca.gs
 * (tests/frontend.test.js confere que continuam iguais).
 */
(function () {
  'use strict';

  var LISTAS = {
    unidades: [
      'Presidência', 'Bio-Manguinhos', 'Farmanguinhos', 'ENSP', 'EPSJV', 'ICICT', 'IFF', 'INCQS', 'INI', 'IOC',
      'COC – Casa de Oswaldo Cruz', 'ILMD – Fiocruz Amazônia', 'IAM – Fiocruz Pernambuco', 'IGM – Fiocruz Bahia',
      'IRR – Fiocruz Minas', 'ICC – Fiocruz Paraná', 'Fiocruz Brasília', 'Fiocruz Ceará',
      'Fiocruz Mato Grosso do Sul', 'Fiocruz Piauí', 'Fiocruz Rondônia', 'Outra'
    ],
    areas: [
      'Doenças infecciosas e negligenciadas', 'Arboviroses e vetores', 'Vacinas, biofármacos e insumos',
      'Clima e saúde', 'Saúde materno-infantil', 'Saúde digital e ciência de dados', 'Vigilância em saúde',
      'Sistemas e políticas de saúde', 'Educação e formação em saúde',
      'Territórios, comunidades e determinantes sociais', 'Biodiversidade e ambiente',
      'Inovação e desenvolvimento tecnológico', 'Outra'
    ],
    maturidade: ['Ideia inicial', 'Projeto estruturado', 'Em execução, buscando ampliação', 'Solução pronta para escalar'],
    valorEstimado: ['Até R$ 250 mil', 'R$ 250 mil–1 milhão', 'R$ 1–5 milhões', 'Acima de R$ 5 milhões', 'Não sei'],
    horizonte: ['Até 6 meses', '6–12 meses', 'Mais de 12 meses'],
    idiomas: ['Português', 'Inglês', 'Espanhol', 'Francês']
  };

  // Tamanhos (mínimo, máximo) — iguais aos do servidor.
  var TAMANHOS = {
    nome: [3, 120], unidadeOutra: [2, 120], titulo: [5, 200], resumo: [100, 1500], problema: [50, 1000],
    objetivos: [50, 1000], abrangencia: [3, 300], parceiros: [0, 500]
  };
  var ROTULOS = {
    nome: 'Nome do pesquisador', email: 'E-mail institucional', unidade: 'Unidade Fiocruz',
    unidadeOutra: 'Nome da unidade', titulo: 'Título do projeto', resumo: 'Resumo',
    problema: 'Problema ou necessidade', objetivos: 'Objetivos principais', areas: 'Áreas temáticas',
    abrangencia: 'Abrangência geográfica', maturidade: 'Estágio de maturidade',
    valorEstimado: 'Valor estimado necessário', horizonte: 'Horizonte de início desejado',
    parceiros: 'Parceiros internacionais', idiomas: 'Idiomas de submissão', consentimento: 'Autorização'
  };
  var ORDEM_CAMPOS = ['nome', 'email', 'unidade', 'unidadeOutra', 'titulo', 'resumo', 'problema', 'objetivos',
    'areas', 'abrangencia', 'maturidade', 'valorEstimado', 'horizonte', 'parceiros', 'idiomas', 'consentimento'];

  var RE_EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+$/;

  /** Mesma normalização do servidor, para os contadores e limites baterem. */
  function limpar(v, multilinha) {
    var s = String(v == null ? '' : v);
    s = multilinha
      ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      : s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
    return s.trim();
  }
  var MULTILINHA = { resumo: true, problema: true, objetivos: true, parceiros: true };

  /**
   * Valida os dados do formulário (mesmas regras do servidor).
   * @return {Object<string,string>} campo → mensagem; vazio se tudo certo
   */
  function validarFormulario(d) {
    var erros = {};
    function texto(campo, opcional) {
      var v = limpar(d[campo], MULTILINHA[campo]);
      var t = TAMANHOS[campo];
      if (!v && opcional) return;
      if (v.length < t[0]) erros[campo] = ROTULOS[campo] + ': informe pelo menos ' + t[0] + ' caracteres.';
      else if (v.length > t[1]) erros[campo] = ROTULOS[campo] + ': use no máximo ' + t[1] + ' caracteres.';
    }
    function escolha(campo, lista) {
      if (lista.indexOf(d[campo]) < 0) erros[campo] = ROTULOS[campo] + ': escolha uma opção.';
    }
    function multipla(campo, lista, max) {
      var v = Array.isArray(d[campo]) ? d[campo] : [];
      if (!v.length) erros[campo] = ROTULOS[campo] + ': escolha ao menos 1 opção.';
      else if (v.length > max) erros[campo] = ROTULOS[campo] + ': escolha no máximo ' + max + ' opções.';
      else if (v.some(function (x) { return lista.indexOf(x) < 0; })) erros[campo] = ROTULOS[campo] + ': opção inválida.';
    }

    texto('nome');
    var email = limpar(d.email).toLowerCase();
    if (!(email.length <= 254 && RE_EMAIL.test(email))) erros.email = ROTULOS.email + ': informe um e-mail válido.';
    escolha('unidade', LISTAS.unidades);
    if (d.unidade === 'Outra') texto('unidadeOutra');
    texto('titulo');
    texto('resumo');
    texto('problema');
    texto('objetivos');
    multipla('areas', LISTAS.areas, 3);
    texto('abrangencia');
    escolha('maturidade', LISTAS.maturidade);
    escolha('valorEstimado', LISTAS.valorEstimado);
    escolha('horizonte', LISTAS.horizonte);
    texto('parceiros', true);
    multipla('idiomas', LISTAS.idiomas, LISTAS.idiomas.length);
    if (d.consentimento !== true) erros.consentimento = 'É preciso autorizar o uso das informações para continuar.';
    return erros;
  }

  /** Só http(s). Qualquer outra coisa não vira link. */
  function linkSeguro(url) {
    if (typeof url !== 'string' || !url) return '';
    try {
      var u = new URL(url);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch (e) {
      return '';
    }
  }

  /* ---------- leitura de arquivos (fase 2A) ---------- */

  var LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024;
  var LIMITE_TEXTO_ARQUIVO = 200000;

  /** 'pdf' | 'docx' | 'txt' | '' a partir do nome e do tipo MIME. */
  function tipoDoArquivo(nome, mime) {
    var n = String(nome || '').toLowerCase();
    var m = String(mime || '').toLowerCase();
    if (/\.pdf$/.test(n) || m === 'application/pdf') return 'pdf';
    if (/\.docx$/.test(n) || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (/\.txt$/.test(n) || m === 'text/plain') return 'txt';
    return '';
  }

  /**
   * Procura um arquivo dentro de um zip (DOCX é um zip) lendo o diretório central.
   * @param {Uint8Array} bytes
   * @return {{ metodo: number, dados: Uint8Array } | null}  metodo 0 = sem compressão, 8 = deflate
   */
  function localizarNoZip(bytes, nomeProcurado) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var fim = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) return null;
    var total = dv.getUint16(fim + 10, true);
    var p = dv.getUint32(fim + 16, true);
    var decodificar = function (a, b) { return new TextDecoder('utf-8').decode(bytes.subarray(a, b)); };
    for (var k = 0; k < total && p + 46 <= bytes.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) return null;
      var metodo = dv.getUint16(p + 10, true);
      var tamComprimido = dv.getUint32(p + 20, true);
      var tamNome = dv.getUint16(p + 28, true);
      var tamExtra = dv.getUint16(p + 30, true);
      var tamComentario = dv.getUint16(p + 32, true);
      var inicioLocal = dv.getUint32(p + 42, true);
      var nome = decodificar(p + 46, p + 46 + tamNome);
      if (nome === nomeProcurado) {
        if (dv.getUint32(inicioLocal, true) !== 0x04034b50) return null;
        var inicioDados = inicioLocal + 30 + dv.getUint16(inicioLocal + 26, true) + dv.getUint16(inicioLocal + 28, true);
        return { metodo: metodo, dados: bytes.subarray(inicioDados, inicioDados + tamComprimido) };
      }
      p += 46 + tamNome + tamExtra + tamComentario;
    }
    return null;
  }

  /** Texto de word/document.xml: um parágrafo (<w:p>) por linha. */
  function textoDoDocumentXml(xml) {
    var entidades = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    var decodificar = function (s) {
      return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (_, e) {
        if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return entidades[e.toLowerCase()];
      });
    };
    var paragrafos = String(xml).match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
    return paragrafos.map(function (p) {
      var partes = [];
      var re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
      var m;
      while ((m = re.exec(p)) !== null) partes.push(m[1] !== undefined ? decodificar(m[1]) : (m[0] === '<w:tab/>' ? '\t' : '\n'));
      return partes.join('');
    }).filter(function (t) { return t.trim(); }).join('\n');
  }

  /** Lê um DOCX (ArrayBuffer) e devolve o texto. Usa DecompressionStream (navegadores atuais e Node 18+). */
  function textoDeDocx(arrayBuffer) {
    var entrada = localizarNoZip(new Uint8Array(arrayBuffer), 'word/document.xml');
    if (!entrada) return Promise.reject(new Error('DOCX inválido'));
    var bytesXml;
    if (entrada.metodo === 0) {
      bytesXml = Promise.resolve(entrada.dados);
    } else if (entrada.metodo === 8 && typeof DecompressionStream !== 'undefined') {
      var fluxo = new Blob([entrada.dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytesXml = new Response(fluxo).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    } else {
      return Promise.reject(new Error('compressão não suportada'));
    }
    return bytesXml.then(function (b) { return textoDoDocumentXml(new TextDecoder('utf-8').decode(b)); });
  }

  // Exporta para os testes no Node.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      LISTAS: LISTAS, TAMANHOS: TAMANHOS, validarFormulario: validarFormulario, linkSeguro: linkSeguro, limpar: limpar,
      tipoDoArquivo: tipoDoArquivo, localizarNoZip: localizarNoZip, textoDoDocumentXml: textoDoDocumentXml, textoDeDocx: textoDeDocx
    };
  }
  if (typeof document === 'undefined') return;

  /* =====================================================================
   * Navegador
   * ===================================================================== */

  var CONFIG = window.FIOCONECTA_CONFIG || {};
  var MODO_MOCK = new URLSearchParams(window.location.search).get('mock');
  var TEMPO_LIMITE_MS = 150000;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('form-demanda');

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }

  /* ---------- montagem do formulário ---------- */

  function montarOpcoes() {
    LISTAS.unidades.forEach(function (u) {
      var o = el('option', null, u);
      o.value = u;
      $('unidade').appendChild(o);
    });
    criarGrupo('opcoes-areas', 'areas', 'checkbox', LISTAS.areas);
    criarGrupo('opcoes-maturidade', 'maturidade', 'radio', LISTAS.maturidade);
    criarGrupo('opcoes-valorEstimado', 'valorEstimado', 'radio', LISTAS.valorEstimado);
    criarGrupo('opcoes-horizonte', 'horizonte', 'radio', LISTAS.horizonte);
    criarGrupo('opcoes-idiomas', 'idiomas', 'checkbox', LISTAS.idiomas);
    criarGrupo('opcoes-idiomaProposta', 'idiomaProposta', 'radio', LISTAS.idiomas);
    $('idiomaProposta-0').checked = true;
  }

  function criarGrupo(idContainer, nome, tipo, valores) {
    var c = $(idContainer);
    valores.forEach(function (v, i) {
      var id = nome + '-' + i;
      var linha = el('div', 'opcao');
      var input = el('input');
      input.type = tipo;
      input.name = nome;
      input.id = id;
      input.value = v;
      var label = el('label', null, v);
      label.htmlFor = id;
      linha.appendChild(input);
      linha.appendChild(label);
      c.appendChild(linha);
    });
  }

  function atualizarContador(campo) {
    var input = $(campo);
    var alvo = $(campo + '-contador');
    if (!input || !alvo) return;
    var n = limpar(input.value, MULTILINHA[campo]).length;
    var t = TAMANHOS[campo];
    var txt = n + ' / ' + t[1] + ' caracteres';
    if (t[0] > 0 && n < t[0]) txt += ' (mínimo ' + t[0] + ')';
    alvo.textContent = txt;
    alvo.classList.toggle('contador-alerta', (t[0] > 0 && n > 0 && n < t[0]) || n > t[1]);
  }

  function atualizarContagemAreas() {
    var n = form.querySelectorAll('input[name="areas"]:checked').length;
    $('areas-contagem').textContent = n ? n + ' de 3 selecionada' + (n > 1 ? 's' : '') + '.' : '';
  }

  function alternarUnidadeOutra() {
    var outra = $('unidade').value === 'Outra';
    $('campo-unidadeOutra').hidden = !outra;
    $('unidadeOutra').required = outra;
  }

  /* ---------- leitura e erros ---------- */

  function lerFormulario() {
    var marcados = function (nome) {
      return Array.prototype.map.call(form.querySelectorAll('input[name="' + nome + '"]:checked'), function (i) { return i.value; });
    };
    var radio = function (nome) {
      var r = form.querySelector('input[name="' + nome + '"]:checked');
      return r ? r.value : '';
    };
    var d = {
      nome: $('nome').value,
      email: $('email').value.trim(),
      unidade: $('unidade').value,
      unidadeOutra: $('unidade').value === 'Outra' ? $('unidadeOutra').value : '',
      titulo: $('titulo').value,
      resumo: $('resumo').value,
      problema: $('problema').value,
      objetivos: $('objetivos').value,
      areas: marcados('areas'),
      abrangencia: $('abrangencia').value,
      maturidade: radio('maturidade'),
      valorEstimado: radio('valorEstimado'),
      horizonte: radio('horizonte'),
      parceiros: $('parceiros').value,
      idiomas: marcados('idiomas'),
      consentimento: $('consentimento').checked,
      site: $('site').value,
      turnstileToken: tokenTurnstile()
    };
    ['nome', 'unidadeOutra', 'titulo', 'abrangencia'].forEach(function (k) { d[k] = limpar(d[k]); });
    ['resumo', 'problema', 'objetivos', 'parceiros'].forEach(function (k) { d[k] = limpar(d[k], true); });
    return d;
  }

  function elementoDoCampo(campo) {
    var direto = $(campo);
    if (direto) return direto;
    return form.querySelector('input[name="' + campo + '"]');
  }

  function limparErros() {
    ORDEM_CAMPOS.forEach(function (c) {
      var p = $(c + '-erro');
      if (p) { p.hidden = true; p.textContent = ''; }
      var e = elementoDoCampo(c);
      if (e) e.removeAttribute('aria-invalid');
      var grupo = form.querySelectorAll('input[name="' + c + '"]');
      Array.prototype.forEach.call(grupo, function (i) { i.removeAttribute('aria-invalid'); });
    });
    $('resumo-erros').hidden = true;
    $('resumo-erros').textContent = '';
  }

  function mostrarErros(erros, mensagemGeral) {
    limparErros();
    var campos = ORDEM_CAMPOS.filter(function (c) { return erros[c]; });
    campos.forEach(function (c) {
      var p = $(c + '-erro');
      if (p) { p.textContent = erros[c]; p.hidden = false; }
      var grupo = form.querySelectorAll('input[name="' + c + '"]');
      if (grupo.length > 1) Array.prototype.forEach.call(grupo, function (i) { i.setAttribute('aria-invalid', 'true'); });
      else if (elementoDoCampo(c)) elementoDoCampo(c).setAttribute('aria-invalid', 'true');
    });

    var caixa = $('resumo-erros');
    caixa.appendChild(el('p', 'resumo-erros-titulo', mensagemGeral || 'Revise os campos abaixo:'));
    var lista = el('ul');
    campos.forEach(function (c) {
      var item = el('li');
      var a = el('a', null, erros[c]);
      a.href = '#' + (elementoDoCampo(c) ? elementoDoCampo(c).id : c);
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var alvo = elementoDoCampo(c);
        if (alvo) alvo.focus();
      });
      item.appendChild(a);
      lista.appendChild(item);
    });
    if (erros._geral) lista.appendChild(el('li', null, erros._geral));
    caixa.appendChild(lista);
    caixa.hidden = false;
    caixa.focus();
  }

  function mostrarAvisoGeral(mensagem) {
    var a = $('aviso-geral');
    a.textContent = mensagem;
    a.hidden = false;
    a.focus();
  }

  /* ---------- Turnstile ---------- */

  // Um widget no formulário e outro na tela de entrada.
  var widgetsTurnstile = {};

  function iniciarTurnstile() {
    if (!CONFIG.turnstileSiteKey || MODO_MOCK) return;
    window.fioconectaTurnstileCarregado = function () {
      widgetsTurnstile.form = window.turnstile.render('#turnstile', { sitekey: CONFIG.turnstileSiteKey, language: 'pt-br' });
      widgetsTurnstile.login = window.turnstile.render('#turnstile-login', { sitekey: CONFIG.turnstileSiteKey, language: 'pt-br' });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=fioconectaTurnstileCarregado&render=explicit';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function tokenTurnstile(qual) {
    var id = widgetsTurnstile[qual || 'form'];
    if (id === undefined || !window.turnstile) return '';
    return window.turnstile.getResponse(id) || '';
  }

  function reiniciarTurnstile(qual) {
    var id = widgetsTurnstile[qual || 'form'];
    if (id !== undefined && window.turnstile) window.turnstile.reset(id);
  }

  /* ---------- envio ---------- */

  /**
   * Envia ao serviço. Com sessão, acrescenta o passe; se o serviço disser que a sessão
   * expirou (codigo "login"), volta para a tela de entrada.
   */
  function enviar(dados) {
    if (sessao.passe && dados.acao !== 'codigo' && dados.acao !== 'entrar') {
      dados = Object.assign({}, dados, { passe: sessao.passe });
    }
    // Matching, leitura de arquivo e proposta levam uma identificação do pedido (se o servidor
    // anunciou o recurso): se a resposta se perder, a página pergunta de novo pelo mesmo pedido.
    if (recursosDoServidor.idPedido && COM_ID_PEDIDO[dados.acao || 'matching'] && !dados.idPedido) {
      dados = Object.assign({}, dados, { idPedido: novoIdPedido() });
    }
    return enviarAoServico(dados).then(function (r) {
      if (r && r.codigo === 'login' && dados.acao !== 'oportunidades') {
        exigirLogin('Sua sessão expirou. Entre novamente: os dados do formulário continuam na página.');
      }
      return r;
    });
  }

  // Pedidos que podem ser repetidos sem efeito colateral: ler a lista e "entrar" (o servidor devolve
  // o mesmo passe se o código for repetido em até 3 minutos). Matching, leitura de arquivo e proposta
  // não são repetidos: gastariam cota e duplicariam registros.
  var REPETIVEIS = { oportunidades: true, entrar: true };
  // Com idPedido, matching, extração e proposta também podem ser repetidos: o servidor devolve o
  // resultado guardado (ou "pendente", se ainda estiver processando) sem rodar a IA de novo.
  var COM_ID_PEDIDO = { matching: true, extrair: true, proposta: true };
  var LIMITE_RECUPERACAO_MS = 5 * 60 * 1000;
  var recursosDoServidor = {};

  function novoIdPedido() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }

  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  /** Repete o mesmo pedido (mesmo idPedido) enquanto a resposta se perder ou o servidor disser "pendente". */
  function enviarRecuperavel(dados, inicio) {
    return umaTentativa(dados).then(function (r) {
      var recuperar = r._transitorio || r._tempo || r.pendente === true;
      if (recuperar && Date.now() - inicio < LIMITE_RECUPERACAO_MS) {
        console.warn('Resposta não recebida (' + (r.pendente ? 'pendente' : 'falha de comunicação') + '); perguntando de novo pelo mesmo pedido.');
        return esperar(r.pendente ? 5000 : 3000).then(function () { return enviarRecuperavel(dados, inicio); });
      }
      return r;
    });
  }

  function enviarAoServico(dados) {
    if (MODO_MOCK) return respostaMock(MODO_MOCK, dados);
    if (!CONFIG.webAppUrl) {
      return Promise.resolve({ ok: false, erro: 'A página ainda não foi configurada (falta a URL do serviço). Avise o Escritório de Captação.' });
    }
    var tentativa = dados.idPedido ? enviarRecuperavel(dados, Date.now()) : umaTentativa(dados);
    return tentativa.then(function (r) {
      if (r._transitorio && REPETIVEIS[dados.acao]) {
        // O Google às vezes devolve 404 ou perde a resposta; uma nova tentativa costuma funcionar.
        console.warn('Falha passageira do serviço; repetindo o pedido "' + dados.acao + '".');
        return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return umaTentativa(dados); });
      }
      return r;
    }).then(function (r) {
      delete r._transitorio;
      delete r._tempo;
      return r;
    });
  }

  /** Um envio. Falhas de comunicação voltam com _transitorio: true (exceto tempo esgotado). */
  function umaTentativa(dados) {
    var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var relogio = controle ? setTimeout(function () { controle.abort(); }, TEMPO_LIMITE_MS) : null;
    return fetch(CONFIG.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(dados),
      redirect: 'follow',
      credentials: 'omit',
      signal: controle ? controle.signal : undefined
    }).then(function (res) {
      return res.text().then(function (texto) {
        var json;
        try { json = JSON.parse(texto); } catch (e) { json = null; }
        if (!json || typeof json !== 'object' || typeof json.ok !== 'boolean') {
          // Ex.: página de login ou de erro do Google no lugar do JSON (implantação sem acesso "Qualquer pessoa").
          console.error('Resposta não-JSON do serviço (HTTP ' + res.status + '):', texto.slice(0, 500));
          return { ok: false, _transitorio: true, erro: 'O serviço respondeu num formato inesperado (código R2, HTTP ' + res.status + ').' };
        }
        return json;
      });
    }).catch(function (e) {
      var tempo = e && e.name === 'AbortError';
      console.error('Falha de comunicação com o serviço:', e);
      return {
        ok: false,
        _transitorio: !tempo,
        _tempo: tempo,
        erro: tempo
          ? 'A análise demorou mais que o esperado. Tente novamente em alguns minutos.'
          : 'Não foi possível falar com o serviço (código R1). Verifique sua conexão e tente novamente.'
      };
    }).then(function (r) {
      if (relogio) clearTimeout(relogio);
      return r;
    });
  }

  function respostaMock(modo, dados) {
    var espera = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    if (dados.acao === 'oportunidades') {
      if (modo === 'login' && dados.passe !== 'passe-de-teste') return espera(300).then(function () { return { ok: false, codigo: 'login', erro: 'Entre.' }; });
      return fetch('mock/oportunidades-exemplo.json', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (m) {
        return { ok: true, login: modo === 'login', email: modo === 'login' ? 'pesquisadora@fiocruz.br' : '', oportunidades: m.oportunidades };
      });
    }
    if (dados.acao === 'codigo') return espera(600).then(function () { return { ok: true, email: dados.email, validade_minutos: 10 }; });
    if (dados.acao === 'entrar') {
      return espera(600).then(function () {
        return dados.codigo === '123456'
          ? { ok: true, passe: 'passe-de-teste', email: 'pesquisadora@fiocruz.br', expira: '01/01/2099' }
          : { ok: false, erro: 'Código incorreto. Confira o e-mail e tente de novo.' };
      });
    }
    if (dados.idOportunidade) {
      return espera(1200).then(function () {
        return fetch('mock/resultado-exemplo.json', { credentials: 'omit' }).then(function (r) { return r.json(); });
      }).then(function (m) {
        var card = Object.assign({}, m.resultado.abertas[0], { id: dados.idOportunidade, nota: 35, selo: 'Baixa aderência' });
        var res = Object.assign({}, m.resultado, { abertas: [card], monitorar: [], financiadores: [], individual: true });
        return { ok: true, id_demanda: 'DEM-20261005-TEST', resultado: res };
      });
    }
    if (modo === 'erro') {
      return espera(1200).then(function () {
        return { ok: false, erro: 'Não conseguimos gerar as sugestões agora. Sua demanda foi registrada e o Escritório fará uma análise manual.', id_demanda: 'DEM-20260930-TEST' };
      });
    }
    if (modo === 'vazio') {
      return espera(1200).then(function () {
        return {
          ok: true, id_demanda: 'DEM-20260930-TEST',
          resultado: {
            resumo_demanda: 'Exemplo de demanda sem correspondências fortes.', lacunas_da_demanda: [],
            abertas: [], monitorar: [], financiadores: [], vazio: true,
            mensagem_vazio: 'Não encontramos correspondências fortes na base atual. O Escritório recebeu sua demanda e fará uma análise manual.'
          }
        };
      });
    }
    return espera(1500).then(function () {
      return fetch('mock/resultado-exemplo.json', { credentials: 'omit' }).then(function (r) { return r.json(); });
    });
  }

  function aoEnviar(ev) {
    ev.preventDefault();
    $('aviso-geral').hidden = true;
    var dados = lerFormulario();
    var erros = validarFormulario(dados);
    if (Object.keys(erros).length) { mostrarErros(erros); return; }
    limparErros();

    var botao = $('botao-enviar');
    botao.disabled = true;
    form.setAttribute('aria-busy', 'true');
    $('resultados').hidden = true;
    $('carregando').hidden = false;

    // O edital escolhido vai fora do formulário (o rascunho de proposta reusa só a demanda).
    var corpo = focoAtual ? Object.assign({}, dados, { idOportunidade: focoAtual }) : dados;
    var focoDoEnvio = focoAtual;
    enviar(corpo).then(function (r) {
      focoDoResultado = focoDoEnvio;
      $('carregando').hidden = true;
      botao.disabled = false;
      form.removeAttribute('aria-busy');
      reiniciarTurnstile();
      var protocolo = r.id_demanda ? ' Protocolo: ' + r.id_demanda + '.' : '';
      if (r.ok && r.resultado) {
        ultimaDemanda = JSON.parse(JSON.stringify(dados));
        delete ultimaDemanda.site;
        delete ultimaDemanda.turnstileToken;
        try {
          mostrarResultado(r);
        } catch (e) {
          console.error('Falha ao exibir o resultado:', e, r);
          $('resultados').hidden = true;
          mostrarAvisoGeral('Sua demanda foi recebida, mas não foi possível exibir o resultado nesta página (código P2).' +
            protocolo + ' O Escritório recebeu os dados por e-mail.');
        }
      } else if (r.campos) {
        mostrarErros(r.campos, r.erro);
      } else if (r.erro) {
        mostrarAvisoGeral(r.erro + protocolo);
      } else {
        console.error('Resposta inesperada do serviço:', r);
        mostrarAvisoGeral('O serviço respondeu num formato inesperado (código P1).' + protocolo);
      }
    }).catch(function (e) {
      console.error('Falha no envio:', e);
      $('carregando').hidden = true;
      botao.disabled = false;
      form.removeAttribute('aria-busy');
      mostrarAvisoGeral('Ocorreu um erro na página (código P3). Tente novamente.');
    });
  }

  /* ---------- upload: a IA sugere o preenchimento (fase 2A) ---------- */

  var arquivoEscolhido = null;

  function mostrarEstadoArquivo(texto, tipo) {
    var e = $('estado-arquivo');
    e.textContent = '';
    e.className = 'estado-arquivo' + (tipo ? ' estado-' + tipo : '');
    if (texto) e.appendChild(el('p', null, texto));
    return e;
  }

  function escolherArquivo(arquivo) {
    if (!arquivo) return;
    if (!tipoDoArquivo(arquivo.name, arquivo.type)) {
      arquivoEscolhido = null;
      $('botao-ler-arquivo').disabled = true;
      mostrarEstadoArquivo('Formato não aceito. Envie um PDF, DOCX ou TXT.', 'erro');
      return;
    }
    if (arquivo.size > LIMITE_ARQUIVO_BYTES) {
      arquivoEscolhido = null;
      $('botao-ler-arquivo').disabled = true;
      mostrarEstadoArquivo('O arquivo tem mais de 10 MB. Envie uma versão menor.', 'erro');
      return;
    }
    arquivoEscolhido = arquivo;
    $('arquivo-nome').textContent = 'Arquivo escolhido: ' + arquivo.name + ' (' + Math.ceil(arquivo.size / 1024) + ' KB)';
    $('botao-ler-arquivo').disabled = false;
    mostrarEstadoArquivo('');
  }

  function lerComoBase64(arquivo) {
    return new Promise(function (ok, falha) {
      var leitor = new FileReader();
      leitor.onload = function () { ok(String(leitor.result).replace(/^data:[^,]*,/, '')); };
      leitor.onerror = function () { falha(leitor.error); };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** Prepara o arquivo para o servidor: PDF em base64; DOCX e TXT como texto. */
  function prepararArquivo(arquivo) {
    var tipo = tipoDoArquivo(arquivo.name, arquivo.type);
    var nome = String(arquivo.name).slice(0, 200);
    if (tipo === 'pdf') return lerComoBase64(arquivo).then(function (b64) { return { nome: nome, tipo: 'pdf', conteudo: b64 }; });
    var texto = tipo === 'docx' ? arquivo.arrayBuffer().then(textoDeDocx) : arquivo.text();
    return texto.then(function (t) { return { nome: nome, tipo: 'texto', conteudo: String(t).slice(0, LIMITE_TEXTO_ARQUIVO) }; });
  }

  function enviarExtracao(corpo) {
    if (MODO_MOCK) {
      return new Promise(function (ok) { setTimeout(ok, 1200); }).then(function () {
        return {
          ok: true,
          campos: {
            titulo: 'Vigilância integrada de arboviroses com dados climáticos (EXEMPLO)',
            resumo: 'Sistema de vigilância que combina notificações, dados entomológicos e climáticos para gerar alertas precoces de dengue, chikungunya, Zika e Oropouche em municípios do Amazonas, com painéis para as secretarias de saúde e formação de equipes locais.',
            problema: 'Surtos de arboviroses são detectados tarde porque os dados estão dispersos.',
            objetivos: 'Integrar bases de saúde e clima; validar modelos de alerta; implantar painéis em 10 municípios.',
            areas: ['Arboviroses e vetores', 'Clima e saúde'], abrangencia: 'Amazonas', unidade: 'ILMD – Fiocruz Amazônia',
            maturidade: 'Projeto estruturado', valorEstimado: '', horizonte: '', parceiros: '', idiomas: ['Português', 'Inglês']
          },
          observacoes: ['O documento não informa o valor total necessário.', 'O documento não indica quando o projeto deve começar.']
        };
      });
    }
    return enviar(corpo);
  }

  var CAMPOS_TEXTO_IA = ['titulo', 'resumo', 'problema', 'objetivos', 'abrangencia', 'parceiros'];

  function marcarSugerido(campo) {
    var alvo = $(campo) ? $(campo).closest('.campo') : $('opcoes-' + campo) && $('opcoes-' + campo).closest('.campo');
    if (!alvo || alvo.querySelector('.nota-ia')) return;
    alvo.classList.add('sugerido-ia');
    alvo.appendChild(el('p', 'nota-ia', 'Sugerido pela IA a partir do arquivo. Revise.'));
  }

  /** Preenche só os campos vazios. @return {{ preenchidos: number, mantidos: number }} */
  function preencherComSugestoes(c) {
    var preenchidos = 0, mantidos = 0;
    CAMPOS_TEXTO_IA.forEach(function (k) {
      if (!c[k]) return;
      if (limpar($(k).value)) { mantidos++; return; }
      $(k).value = c[k];
      atualizarContador(k);
      marcarSugerido(k);
      preenchidos++;
    });
    if (c.unidade) {
      if ($('unidade').value) mantidos++;
      else { $('unidade').value = c.unidade; alternarUnidadeOutra(); marcarSugerido('unidade'); preenchidos++; }
    }
    ['maturidade', 'valorEstimado', 'horizonte'].forEach(function (k) {
      if (!c[k]) return;
      if (form.querySelector('input[name="' + k + '"]:checked')) { mantidos++; return; }
      var opcao = Array.prototype.filter.call(form.querySelectorAll('input[name="' + k + '"]'), function (i) { return i.value === c[k]; })[0];
      if (opcao) { opcao.checked = true; marcarSugerido(k); preenchidos++; }
    });
    ['areas', 'idiomas'].forEach(function (k) {
      if (!c[k] || !c[k].length) return;
      if (form.querySelector('input[name="' + k + '"]:checked')) { mantidos++; return; }
      Array.prototype.forEach.call(form.querySelectorAll('input[name="' + k + '"]'), function (i) {
        if (c[k].indexOf(i.value) >= 0) i.checked = true;
      });
      marcarSugerido(k);
      preenchidos++;
    });
    atualizarContagemAreas();
    return { preenchidos: preenchidos, mantidos: mantidos };
  }

  function aoLerArquivo() {
    if (!arquivoEscolhido) return;
    var email = limpar($('email').value).toLowerCase();
    if (!RE_EMAIL.test(email)) {
      mostrarEstadoArquivo('Antes de enviar o arquivo, preencha o seu e-mail institucional (acima).', 'erro');
      $('email').focus();
      return;
    }
    if (!$('consentimentoArquivo').checked) {
      mostrarEstadoArquivo('Para enviar o arquivo, marque a autorização logo acima do botão.', 'erro');
      $('consentimentoArquivo').focus();
      return;
    }
    var botao = $('botao-ler-arquivo');
    botao.disabled = true;
    mostrarEstadoArquivo('Lendo o arquivo… isso pode levar até um minuto.', 'carregando');

    prepararArquivo(arquivoEscolhido).then(function (arquivo) {
      if (arquivo.tipo === 'texto' && limpar(arquivo.conteudo, true).length < 50) {
        return { ok: false, erro: 'Não encontramos texto suficiente no arquivo.' };
      }
      return enviarExtracao({
        acao: 'extrair',
        email: email,
        consentimentoArquivo: true,
        arquivo: arquivo,
        site: $('site').value,
        turnstileToken: tokenTurnstile()
      });
    }, function (e) {
      console.error('Falha ao ler o arquivo no navegador:', e);
      return { ok: false, erro: 'Não foi possível abrir este arquivo no navegador (código A1). Tente salvá-lo como PDF.' };
    }).then(function (r) {
      botao.disabled = false;
      reiniciarTurnstile();
      if (!r.ok) { mostrarEstadoArquivo(r.erro || 'Não foi possível ler o arquivo.', 'erro'); return; }
      var conta = preencherComSugestoes(r.campos || {});
      var msg = conta.preenchidos
        ? conta.preenchidos + ' campo(s) preenchido(s) a partir do arquivo, marcados em azul. Revise antes de enviar.'
        : 'O arquivo não trouxe informações para os campos vazios.';
      if (conta.mantidos) msg += ' ' + conta.mantidos + ' campo(s) que você já tinha preenchido foram mantidos.';
      var caixa = mostrarEstadoArquivo(msg, 'ok');
      if (r.observacoes && r.observacoes.length) {
        caixa.appendChild(el('p', 'estado-subtitulo', 'O arquivo não informa:'));
        var ul = el('ul');
        r.observacoes.forEach(function (o) { ul.appendChild(el('li', null, o)); });
        caixa.appendChild(ul);
      }
    }).catch(function (e) {
      console.error('Falha na leitura do arquivo:', e);
      botao.disabled = false;
      mostrarEstadoArquivo('Ocorreu um erro na página ao ler o arquivo (código A2).', 'erro');
    });
  }

  function iniciarUpload() {
    var zona = $('zona-arquivo');
    $('arquivo').addEventListener('change', function () { escolherArquivo(this.files && this.files[0]); });
    $('botao-ler-arquivo').addEventListener('click', aoLerArquivo);
    ['dragenter', 'dragover'].forEach(function (t) {
      zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.add('arrastando'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      zona.addEventListener(t, function (ev) { ev.preventDefault(); zona.classList.remove('arrastando'); });
    });
    zona.addEventListener('drop', function (ev) {
      var arquivos = ev.dataTransfer && ev.dataTransfer.files;
      if (arquivos && arquivos.length) escolherArquivo(arquivos[0]);
    });
  }

  /* ---------- rascunho de proposta em XLSX (fase 2B) ---------- */

  var ultimaDemanda = null;     // demanda enviada no último matching bem-sucedido
  var gerandoProposta = false;

  function hojeTexto() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /** Com o Turnstile ligado, cada envio precisa de um token novo: espera o widget gerar (até 20 s). */
  function aguardarToken() {
    if (widgetsTurnstile.form === undefined || !window.turnstile) return Promise.resolve('');
    return new Promise(function (ok) {
      var inicio = Date.now();
      (function tentar() {
        var t = tokenTurnstile();
        if (t || Date.now() - inicio > 20000) ok(t);
        else setTimeout(tentar, 300);
      })();
    });
  }

  function pedirParteProposta(parte, c, idioma, outputs) {
    if (MODO_MOCK) {
      return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () {
        return fetch('mock/proposta-exemplo.json', { credentials: 'omit' }).then(function (r) { return r.json(); });
      }).then(function (m) { return parte === 1 ? m.parte1 : m.parte2; });
    }
    return aguardarToken().then(function (token) {
      var corpo = { acao: 'proposta', parte: parte, demanda: ultimaDemanda, idOportunidade: c.id, idioma: idioma,
        site: $('site').value, turnstileToken: token };
      if (parte === 2) corpo.outputs = outputs;
      return enviar(corpo);
    }).then(function (r) { reiniciarTurnstile(); return r; });
  }

  function baixarArquivo(bytes, nome, onde) {
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = el('a', 'link-download', 'Baixar novamente');
    a.title = nome;
    a.href = url;
    a.download = nome;
    onde.appendChild(a);
    a.click();
  }

  function blocoProposta(c) {
    if (!window.XlsxSimples || !window.PropostaXlsx) return null;
    var bloco = el('div', 'bloco-proposta');
    var botao = el('button', 'botao-secundario botao-proposta', 'Gerar rascunho de proposta (.xlsx)');
    botao.type = 'button';
    var estado = el('div', 'estado-proposta');
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');
    botao.addEventListener('click', function (ev) {
      ev.stopPropagation();
      gerarProposta(c, botao, estado);
    });
    bloco.appendChild(botao);
    bloco.appendChild(estado);
    return bloco;
  }

  /** Mensagem de erro de uma parte da proposta, com diagnóstico para servidor desatualizado. */
  function erroDaProposta(r, padrao) {
    if (r && r.campos) {
      // Servidor sem a fase 2B: trata o pedido como matching e recusa os campos "acao", "parte"...
      console.error('Pedido de proposta recusado como formulário:', r);
      return 'O serviço ainda não reconhece o pedido de rascunho de proposta (código V1). ' +
        'O Apps Script precisa ser atualizado para a versão com a fase 2B e implantado em uma nova versão.';
    }
    return (r && r.erro) || padrao;
  }

  function mensagemEstado(estado, texto, tipo) {
    estado.textContent = '';
    estado.className = 'estado-proposta' + (tipo ? ' estado-' + tipo : '');
    if (texto) estado.appendChild(el('p', null, texto));
  }

  function gerarProposta(c, botao, estado) {
    if (gerandoProposta) return;
    if (!ultimaDemanda) { mensagemEstado(estado, 'Refaça o matching antes de gerar a proposta.', 'erro'); return; }
    // O idioma é lido na hora (pode ser trocado depois do matching) e não vai no envio do matching.
    var marcado = form.querySelector('input[name="idiomaProposta"]:checked');
    var idioma = marcado ? marcado.value : 'Português';
    gerandoProposta = true;
    var botoes = document.querySelectorAll('.botao-proposta');
    Array.prototype.forEach.call(botoes, function (b) { b.disabled = true; });
    var terminar = function () {
      gerandoProposta = false;
      Array.prototype.forEach.call(botoes, function (b) { b.disabled = false; });
    };

    mensagemEstado(estado, 'Etapa 1 de 2: ficha de identificação e marco lógico (até 1 minuto)…', 'carregando');
    var parte1;
    pedirParteProposta(1, c, idioma).then(function (r1) {
      if (!r1 || !r1.ok) throw { mensagem: erroDaProposta(r1, 'Não foi possível gerar a primeira parte.') };
      parte1 = r1;
      mensagemEstado(estado, 'Etapa 2 de 2: orçamento e cronograma (até 1 minuto)…', 'carregando');
      return pedirParteProposta(2, c, idioma, window.PropostaXlsx.outputsDoMarco(r1.marco));
    }).then(function (r2) {
      if (!r2 || !r2.ok) throw { mensagem: erroDaProposta(r2, 'Não foi possível gerar a segunda parte.') };
      var dados = {
        idioma: idioma, geradoEm: hojeTexto(), demanda: ultimaDemanda, edital: parte1.edital,
        duracao: parte1.duracao, parte1: parte1, parte2: r2
      };
      var bytes = window.XlsxSimples.criar(window.PropostaXlsx.montarAbasProposta(dados));
      var nome = window.PropostaXlsx.nomeArquivoProposta(parte1.edital.edital);
      var msg = 'Rascunho pronto: o download começou. Revise todo o conteúdo, principalmente os valores do orçamento, que são estimativas.';
      if (parte1.duracao.origem === 'padrao') {
        msg += ' Atenção: o edital não informa a duração do projeto; o cronograma usa ' + parte1.duracao.meses + ' meses. Ajuste à regra do edital.';
      }
      mensagemEstado(estado, msg, 'ok');
      baixarArquivo(bytes, nome, estado);
    }).catch(function (e) {
      if (!(e && e.mensagem)) console.error('Falha ao gerar a proposta:', e);
      mensagemEstado(estado, (e && e.mensagem) || 'Ocorreu um erro na página ao montar a planilha (código X1).', 'erro');
    }).then(terminar);
  }

  /* ---------- resultados ---------- */

  var CRITERIOS = [
    ['tematica', 'Temática', 40], ['elegibilidade', 'Elegibilidade', 25], ['porte', 'Porte', 15],
    ['maturidade', 'Maturidade', 10], ['viabilidade', 'Viabilidade', 10]
  ];

  function classeSelo(nota) {
    if (nota >= 75) return 'selo selo-alta';
    if (nota >= 60) return 'selo selo-boa';
    if (nota >= 40) return 'selo selo-parcial';
    return 'selo selo-baixa';
  }

  function paragrafoRotulado(rotulo, texto, classe) {
    if (!texto) return null;
    var p = el('p', classe || 'card-texto');
    p.appendChild(el('strong', null, rotulo + ': '));
    p.appendChild(document.createTextNode(String(texto)));
    return p;
  }

  function adicionar(pai, filho) { if (filho) pai.appendChild(filho); }

  function linkExterno(url, texto, rotuloAcessivel) {
    var seguro = linkSeguro(url);
    if (!seguro) return null;
    var a = el('a', 'link-externo', texto);
    a.href = seguro;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', rotuloAcessivel + ' (abre em nova aba)');
    return a;
  }

  function seloIntegridade(card) {
    if (!card.integridade_aviso) return null;
    return el('span', 'selo-integridade', 'Integridade: ' + card.integridade + ' — sujeito à triagem do Escritório');
  }

  var contadorCards = 0;

  function cardOportunidade(c) {
    var art = el('article', 'card');
    var topo = el('div', 'card-topo');
    topo.appendChild(el('span', classeSelo(c.nota), c.nota + ' · ' + c.selo));
    adicionar(topo, seloIntegridade(c));
    art.appendChild(topo);

    art.appendChild(el('p', 'card-financiador', c.financiador));
    art.appendChild(el('h4', 'card-titulo', c.edital));

    var fatos = el('dl', 'fatos');
    var fato = function (rotulo, valor, classe) {
      if (!valor) return;
      var grupo = el('div', classe || null);
      grupo.appendChild(el('dt', null, rotulo));
      grupo.appendChild(el('dd', null, valor));
      fatos.appendChild(grupo);
    };
    fato('Prazo', c.prazo_texto, c.prazo_status === 'prazo_curto' ? 'fato-urgente' : null);
    fato('Valores', c.valores);
    fato('Duração', c.duracao);
    fato('Via de governança', c.via_governanca);
    art.appendChild(fatos);

    adicionar(art, paragrafoRotulado('Por que combina', c.por_que_combina));
    adicionar(art, paragrafoRotulado('Lacunas e riscos', c.lacunas_e_riscos));
    if (c.requisitos_criticos && c.requisitos_criticos.length) {
      var req = el('div', 'requisitos');
      req.appendChild(el('p', 'requisitos-titulo', 'Requisitos críticos'));
      var ul = el('ul');
      c.requisitos_criticos.forEach(function (r) { ul.appendChild(el('li', null, r)); });
      req.appendChild(ul);
      art.appendChild(req);
    }
    adicionar(art, paragrafoRotulado('Próximo passo', c.proximo_passo));

    var rodape = el('div', 'card-acoes');
    adicionar(rodape, linkExterno(c.link_edital, 'Ver edital', 'Ver edital ' + c.edital));
    rodape.appendChild(botaoCriterios(art, c));
    art.appendChild(rodape);
    adicionar(art, blocoProposta(c));
    return art;
  }

  function botaoCriterios(art, c) {
    var id = 'criterios-' + (++contadorCards);
    var botao = el('button', 'botao-secundario', 'Ver critérios');
    botao.type = 'button';
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-controls', id);

    var painel = el('div', 'criterios');
    painel.id = id;
    painel.hidden = true;
    CRITERIOS.forEach(function (k) {
      var valor = (c.criterios && typeof c.criterios[k[0]] === 'number') ? c.criterios[k[0]] : 0;
      var linha = el('div', 'criterio');
      var rotulo = el('span', 'criterio-rotulo', k[1]);
      var barra = el('div', 'criterio-barra');
      barra.setAttribute('role', 'img');
      barra.setAttribute('aria-label', k[1] + ': ' + valor + ' de ' + k[2]);
      var preench = el('div', 'criterio-preenchimento');
      preench.style.width = Math.max(0, Math.min(100, (valor / k[2]) * 100)) + '%';
      barra.appendChild(preench);
      linha.appendChild(rotulo);
      linha.appendChild(barra);
      linha.appendChild(el('span', 'criterio-valor', valor + '/' + k[2]));
      painel.appendChild(linha);
    });

    var alternar = function () {
      var abrir = painel.hidden;
      painel.hidden = !abrir;
      botao.setAttribute('aria-expanded', String(abrir));
      botao.textContent = abrir ? 'Ocultar critérios' : 'Ver critérios';
    };
    botao.addEventListener('click', function (ev) { ev.stopPropagation(); alternar(); });
    // Clicar no card também abre os critérios (sem atrapalhar links e seleção de texto).
    art.addEventListener('click', function (ev) {
      if (ev.target.closest('a, button') || (window.getSelection && String(window.getSelection()))) return;
      alternar();
    });
    art.classList.add('card-clicavel');
    art.appendChild(painel);
    return botao;
  }

  function cardFinanciador(c) {
    var art = el('article', 'card card-financiador-org');
    var topo = el('div', 'card-topo');
    topo.appendChild(el('span', classeSelo(c.nota), c.nota + ' · ' + c.selo));
    adicionar(topo, seloIntegridade(c));
    art.appendChild(topo);
    art.appendChild(el('h4', 'card-titulo', c.organizacao));
    if (c.pais) art.appendChild(el('p', 'card-financiador', c.pais));
    adicionar(art, paragrafoRotulado('Por que combina', c.por_que_combina));
    adicionar(art, paragrafoRotulado('Como abordar', c.como_abordar));
    var rodape = el('div', 'card-acoes');
    adicionar(rodape, linkExterno(c.website, 'Website', 'Website de ' + c.organizacao));
    if (rodape.childNodes.length) art.appendChild(rodape);
    return art;
  }

  function secao(titulo, descricao, cards, criar) {
    if (!cards || !cards.length) return null;
    var s = el('section', 'secao-resultados');
    s.appendChild(el('h3', null, titulo + ' (' + cards.length + ')'));
    if (descricao) s.appendChild(el('p', 'secao-descricao', descricao));
    var grade = el('div', 'grade-cards');
    cards.forEach(function (c) { grade.appendChild(criar(c)); });
    s.appendChild(grade);
    return s;
  }

  function mostrarResultado(r) {
    var res = r.resultado;
    $('titulo-resultados').textContent = res.individual ? 'Resultado da avaliação' : 'Resultado do matching';
    $('protocolo').textContent = r.id_demanda ? 'Protocolo: ' + r.id_demanda : '';

    var topo = $('resumo-demanda');
    topo.textContent = '';
    if (res.resumo_demanda) topo.appendChild(paragrafoRotulado('Sua demanda', res.resumo_demanda, 'resumo-demanda'));
    if (res.lacunas_da_demanda && res.lacunas_da_demanda.length) {
      var caixa = el('aside', 'caixa-lacunas');
      caixa.setAttribute('aria-label', 'Para fortalecer sua candidatura');
      caixa.appendChild(el('h3', null, 'Para fortalecer sua candidatura'));
      caixa.appendChild(el('p', 'caixa-nota', 'Sugestões gerais, não obrigatórias. Você não precisa responder nada aqui; o Escritório de Captação pode ajudar.'));
      var ul = el('ul');
      res.lacunas_da_demanda.forEach(function (l) { ul.appendChild(el('li', null, l)); });
      caixa.appendChild(ul);
      topo.appendChild(caixa);
    }

    var lista = $('lista-resultados');
    lista.textContent = '';
    if (res.vazio) {
      lista.appendChild(el('p', 'mensagem-vazio', res.mensagem_vazio));
    } else if (res.individual) {
      adicionar(lista, secao('Avaliação do edital escolhido',
        'Nota de aderência do seu projeto a este edital, com a justificativa. Notas abaixo de 40 indicam baixa aderência.',
        [].concat(res.abertas || [], res.monitorar || []), cardOportunidade));
    } else {
      adicionar(lista, secao('Oportunidades abertas', 'Editais com prazo aberto, contínuo, recorrente ou a confirmar.',
        res.abertas, cardOportunidade));
      adicionar(lista, secao('Para monitorar (ciclos anteriores)',
        'O último prazo conhecido já passou, mas muitos editais são anuais: vale acompanhar o próximo ciclo.',
        res.monitorar, cardOportunidade));
      adicionar(lista, secao('Financiadores com aderência',
        'Organizações que podem apoiar a demanda mesmo sem edital aberto.', res.financiadores, cardFinanciador));
    }

    $('resultados').hidden = false;
    $('titulo-resultados').focus();
  }

  /* ---------- sessão (login por código) ---------- */

  var CHAVE_SESSAO = 'fioconecta_sessao';
  // login: null = ainda não sabemos se o servidor exige; passe: string assinada pelo servidor.
  var sessao = { login: null, passe: '', email: '', expira: '' };

  function lerSessaoGuardada() {
    try {
      var s = JSON.parse(window.localStorage.getItem(CHAVE_SESSAO) || 'null');
      if (s && typeof s.passe === 'string' && typeof s.email === 'string') {
        sessao.passe = s.passe;
        sessao.email = s.email;
        sessao.expira = String(s.expira || '');
      }
    } catch (e) { /* armazenamento indisponível: pede login de novo */ }
  }

  function guardarSessao() {
    try {
      window.localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ passe: sessao.passe, email: sessao.email, expira: sessao.expira }));
    } catch (e) { /* sem armazenamento, a sessão vale só enquanto a página estiver aberta */ }
  }

  function esquecerSessao() {
    sessao.passe = '';
    sessao.email = '';
    sessao.expira = '';
    try { window.localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* nada a fazer */ }
  }

  function atualizarNavegacao() {
    var logado = sessao.login && sessao.email;
    $('usuario').textContent = logado ? sessao.email : '';
    $('botao-sair').hidden = !logado;
    // Com login, o e-mail do formulário é o confirmado no acesso.
    var email = $('email');
    if (logado) {
      email.value = sessao.email;
      email.readOnly = true;
      $('email-ajuda').textContent = 'E-mail confirmado no acesso. Endereços @fiocruz.br recebem uma cópia do resultado por e-mail.';
    } else {
      email.readOnly = false;
    }
  }

  function sair() {
    esquecerSessao();
    esquecerLista();
    // Recarrega para limpar o formulário (computador compartilhado).
    window.location.hash = '';
    window.location.reload();
  }

  /* ---------- tela de entrada ---------- */

  var emailDoCodigo = '';

  function exigirLogin(mensagem) {
    esquecerSessao();
    sessao.login = true;
    atualizarNavegacao();
    mostrarTela('login');
    var aviso = $('aviso-login');
    aviso.hidden = !mensagem;
    aviso.textContent = mensagem || '';
    $('form-codigo').hidden = false;
    $('form-entrar').hidden = true;
  }

  function erroNoCampo(id, mensagem) {
    var p = $(id + '-erro');
    p.textContent = mensagem || '';
    p.hidden = !mensagem;
    if (mensagem) { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); }
    else $(id).removeAttribute('aria-invalid');
  }

  function aoPedirCodigo(ev) {
    ev.preventDefault();
    $('aviso-login').hidden = true;
    var email = limpar($('email-login').value).toLowerCase();
    if (!(email.length <= 254 && RE_EMAIL.test(email))) { erroNoCampo('email-login', 'Informe um e-mail válido.'); return; }
    erroNoCampo('email-login', '');
    var botao = $('botao-codigo');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    enviar({ acao: 'codigo', email: email, site: $('site').value, turnstileToken: tokenTurnstile('login') }).then(function (r) {
      botao.disabled = false;
      botao.textContent = 'Enviar código';
      reiniciarTurnstile('login');
      if (!r.ok) { erroNoCampo('email-login', r.erro || 'Não foi possível enviar o código.'); return; }
      emailDoCodigo = r.email || email;
      $('form-codigo').hidden = true;
      $('form-entrar').hidden = false;
      $('codigo-enviado').textContent = 'Enviamos um código para ' + emailDoCodigo + '.';
      $('codigo-login').value = '';
      $('codigo-login').focus();
    });
  }

  function aoEntrar(ev) {
    ev.preventDefault();
    var codigo = $('codigo-login').value.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(codigo)) { erroNoCampo('codigo-login', 'O código tem 6 números.'); return; }
    erroNoCampo('codigo-login', '');
    var botao = $('botao-entrar');
    botao.disabled = true;
    enviar({ acao: 'entrar', email: emailDoCodigo, codigo: codigo, site: $('site').value }).then(function (r) {
      botao.disabled = false;
      if (!r.ok || typeof r.passe !== 'string') {
        erroNoCampo('codigo-login', (r && r.erro) || 'Não foi possível entrar.');
        if (r && /novo código/.test(r.erro || '')) { $('form-entrar').hidden = true; $('form-codigo').hidden = false; }
        return;
      }
      sessao.passe = r.passe;
      sessao.email = r.email;
      sessao.expira = r.expira || '';
      guardarSessao();
      $('aviso-login').hidden = true;
      // A resposta do login já traz a lista; se não trouxer, pede em seguida.
      if (Array.isArray(r.oportunidades)) aplicarLista(r);
      else carregarOportunidades();
    });
  }

  function voltarAoEmail() {
    $('form-entrar').hidden = true;
    $('form-codigo').hidden = false;
    erroNoCampo('codigo-login', '');
    $('email-login').focus();
  }

  /* ---------- lista de oportunidades ---------- */

  var oportunidades = null;   // lista vinda do servidor (null = ainda não carregada)
  var listaFalhou = false;    // a lista não carregou: as telas ficam disponíveis mesmo assim

  var ROTULOS_PRAZO = {
    aberto: 'Aberto', prazo_curto: 'Prazo curto', continuo: 'Fluxo contínuo', ciclos: 'Ciclos recorrentes',
    a_confirmar: 'Prazo a confirmar', encerrado: 'Encerrado: acompanhar o próximo ciclo'
  };

  function semAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // A última lista fica guardada neste navegador e aparece na hora na próxima visita,
  // enquanto a versão atual chega do servidor. Sair apaga a cópia.
  var CHAVE_LISTA = 'fioconecta_lista';
  var VALIDADE_LISTA_MS = 7 * 24 * 60 * 60 * 1000;

  function lerListaGuardada() {
    try {
      var g = JSON.parse(window.localStorage.getItem(CHAVE_LISTA) || 'null');
      if (!g || !Array.isArray(g.oportunidades) || typeof g.quando !== 'number') return null;
      if (Date.now() - g.quando > VALIDADE_LISTA_MS) return null;
      // Só vale para a mesma situação de acesso: a mesma pessoa conectada, ou login desligado.
      if (g.login ? (g.email !== sessao.email || !sessao.passe) : !!sessao.passe) return null;
      return g;
    } catch (e) { return null; }
  }

  function guardarLista(r) {
    try {
      window.localStorage.setItem(CHAVE_LISTA, JSON.stringify({
        quando: Date.now(), login: !!r.login, email: r.login ? (r.email || sessao.email) : '', oportunidades: r.oportunidades,
        recursos: r.recursos || {}
      }));
    } catch (e) { /* sem armazenamento: a lista só não aparece antecipada */ }
  }

  function esquecerLista() {
    try { window.localStorage.removeItem(CHAVE_LISTA); } catch (e) { /* nada a fazer */ }
  }

  /** Mostra uma lista válida (do servidor ou guardada) e segue para a tela do endereço. */
  function aplicarLista(r, guardada) {
    listaFalhou = false;
    recursosDoServidor = (r.recursos && typeof r.recursos === 'object') ? r.recursos : {};
    sessao.login = !!r.login;
    if (!r.login) esquecerSessao();
    else if (r.email) sessao.email = r.email;
    oportunidades = r.oportunidades;
    if (!guardada) {
      guardarLista(r);
      $('aviso-oportunidades').hidden = true;
    }
    $('carregando-pagina').hidden = true;
    atualizarNavegacao();
    desenharOportunidades();
    if (!listaExibida) {
      listaExibida = true;
      aoMudarEndereco();
    } else if (rotaAtual().tela === 'avaliar') {
      // Lista atualizada depois da guardada: só refaz os textos, sem mudar o foco de quem já está usando.
      prepararAvaliacao(rotaAtual().id);
    }
  }
  var listaExibida = false;

  function carregarOportunidades() {
    var guardada = !oportunidades && lerListaGuardada();
    if (guardada) aplicarLista(guardada, true);
    else $('carregando-pagina').hidden = false;
    return enviar({ acao: 'oportunidades' }).then(function (r) {
      $('carregando-pagina').hidden = true;
      if (r && r.codigo === 'login') {
        oportunidades = null;
        listaExibida = false;
        esquecerLista();
        exigirLogin(sessao.passe ? 'Sua sessão expirou. Entre novamente.' : '');
        return;
      }
      if (r && r.ok && Array.isArray(r.oportunidades)) {
        aplicarLista(r);
        return;
      }
      // Servidor sem esta versão: trata o pedido como formulário e recusa o campo "acao".
      var msg = (r && r.campos)
        ? 'O serviço ainda não reconhece a lista de oportunidades (código V2). O Apps Script precisa ser atualizado e implantado em uma nova versão.'
        : ((r && r.erro) || 'Não foi possível carregar a lista de oportunidades.');
      if (r && r.campos) console.error('Pedido da lista recusado como formulário:', r);
      listaFalhou = true;
      atualizarNavegacao();
      mostrarTela(rotaAtual().tela === 'avaliar' ? 'avaliar' : 'oportunidades');
      var aviso = $('aviso-oportunidades');
      aviso.textContent = '';
      aviso.appendChild(el('p', null, msg));
      var botao = el('button', 'botao-secundario', 'Tentar novamente');
      botao.type = 'button';
      botao.addEventListener('click', carregarOportunidades);
      aviso.appendChild(botao);
      aviso.hidden = false;
    });
  }

  function filtrarOportunidades() {
    var termo = semAcentos(limpar($('busca').value));
    var prazo = $('filtro-prazo').value;
    return (oportunidades || []).filter(function (o) {
      if (prazo === 'abertas' && o.prazo_status === 'encerrado') return false;
      if (prazo === 'encerradas' && o.prazo_status !== 'encerrado') return false;
      if (!termo) return true;
      return semAcentos([o.financiador, o.edital, o.tema, o.resumo].join(' ')).indexOf(termo) >= 0;
    });
  }

  function desenharOportunidades() {
    var lista = $('lista-oportunidades');
    lista.textContent = '';
    if (!oportunidades) return;
    var filtradas = filtrarOportunidades();
    var total = oportunidades.length;
    $('contagem-oportunidades').textContent = filtradas.length === total
      ? total + ' oportunidade' + (total === 1 ? '' : 's') + '.'
      : filtradas.length + ' de ' + total + ' oportunidades.';
    if (!filtradas.length) {
      lista.appendChild(el('p', 'mensagem-vazio', 'Nenhuma oportunidade com estes filtros.'));
      return;
    }
    filtradas.forEach(function (o) { lista.appendChild(cardDaLista(o)); });
  }

  function cardDaLista(o) {
    var art = el('article', 'card card-lista');
    var topo = el('div', 'card-topo');
    topo.appendChild(el('span', 'chip-prazo chip-' + (ROTULOS_PRAZO[o.prazo_status] ? o.prazo_status : 'a_confirmar'),
      ROTULOS_PRAZO[o.prazo_status] || ROTULOS_PRAZO.a_confirmar));
    adicionar(topo, seloIntegridade(o));
    art.appendChild(topo);
    art.appendChild(el('p', 'card-financiador', o.financiador));
    art.appendChild(el('h3', 'card-titulo', o.edital));

    var fatos = el('dl', 'fatos');
    [['Prazo', o.prazo_texto, o.prazo_status === 'prazo_curto' ? 'fato-urgente' : null],
     ['Valores', o.valores], ['Duração', o.duracao], ['Tema', o.tema], ['Via de governança', o.via_governanca]
    ].forEach(function (f) {
      if (!f[1]) return;
      var grupo = el('div', f[2] || null);
      grupo.appendChild(el('dt', null, f[0]));
      grupo.appendChild(el('dd', null, f[1]));
      fatos.appendChild(grupo);
    });
    art.appendChild(fatos);

    if (o.resumo) {
      var det = el('details', 'resumo-chamada');
      det.appendChild(el('summary', null, 'Resumo da chamada'));
      det.appendChild(el('p', null, o.resumo));
      art.appendChild(det);
    }

    var acoes = el('div', 'card-acoes');
    var avaliar = el('a', 'botao botao-pequeno', 'Avaliar meu projeto para este edital');
    avaliar.href = '#avaliar/' + encodeURIComponent(o.id);
    avaliar.setAttribute('aria-label', 'Avaliar meu projeto para o edital ' + o.edital);
    acoes.appendChild(avaliar);
    adicionar(acoes, linkExterno(o.link_edital, 'Ver edital', 'Ver edital ' + o.edital));
    art.appendChild(acoes);
    return art;
  }

  /* ---------- telas e endereço ---------- */

  var TELAS = { login: 'tela-login', oportunidades: 'tela-oportunidades', avaliar: 'tela-avaliar' };
  var focoAtual = '';        // ID do edital escolhido (vazio = toda a base)
  var focoDoResultado = null; // foco do resultado exibido na tela

  /** #oportunidades | #avaliar | #avaliar/<ID> */
  function rotaAtual() {
    var h;
    try { h = decodeURIComponent(String(window.location.hash || '').replace(/^#/, '')); } catch (e) { h = ''; }
    var m = h.match(/^avaliar(?:\/(.{1,40}))?$/);
    if (m) return { tela: 'avaliar', id: m[1] || '' };
    return { tela: 'oportunidades', id: '' };
  }

  function mostrarTela(nome) {
    Object.keys(TELAS).forEach(function (k) { $(TELAS[k]).hidden = k !== nome; });
    $('carregando-pagina').hidden = true;
    $('navegacao').hidden = nome === 'login';
    ['oportunidades', 'avaliar'].forEach(function (k) {
      var link = $('nav-' + k);
      if (k === nome) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function aoMudarEndereco() {
    if (sessao.login && !sessao.passe) { mostrarTela('login'); return; }
    if (sessao.login === null && !oportunidades && !listaFalhou) return; // ainda carregando
    var rota = rotaAtual();
    if (rota.tela === 'avaliar') prepararAvaliacao(rota.id);
    mostrarTela(rota.tela);
    var titulo = $(rota.tela === 'avaliar' ? 'titulo-intro' : 'titulo-oportunidades');
    if (titulo && document.activeElement !== titulo && iniciado) titulo.focus();
    iniciado = true;
  }
  var iniciado = false;

  function prepararAvaliacao(id) {
    var edital = id && oportunidades ? oportunidades.filter(function (o) { return o.id === id; })[0] : null;
    if (id && oportunidades && !edital) {
      mostrarAvisoGeral('Este edital não está mais na lista de oportunidades. Você pode comparar o projeto com todas as oportunidades.');
      id = '';
    }
    focoAtual = id;
    var foco = $('foco-edital');
    foco.hidden = !id;
    if (edital) {
      $('foco-titulo').textContent = edital.edital + ' — ' + edital.financiador;
      $('foco-detalhes').textContent = [edital.prazo_texto, edital.valores].filter(Boolean).join(' · ');
    } else if (id) {
      $('foco-titulo').textContent = 'Edital ' + id;
      $('foco-detalhes').textContent = '';
    }
    $('intro-texto').textContent = id
      ? 'Descreva o seu projeto (ou use os dados já preenchidos). A IA avalia a aderência a este edital, com nota, justificativa, lacunas e próximo passo. Depois, você pode gerar um rascunho de proposta.'
      : 'Descreva o seu projeto. Vamos compará-lo com a base de editais e financiadores mantida pelo Escritório de Captação e mostrar as oportunidades mais aderentes, com a justificativa de cada sugestão. O Escritório recebe a sua demanda e entrará em contato.';
    $('botao-enviar').textContent = id ? 'Avaliar aderência a este edital' : 'Encontrar oportunidades';
    $('texto-carregando').textContent = id ? 'Avaliando a aderência do seu projeto a este edital…' : 'Analisando a aderência do seu projeto…';
    // Resultado de outra avaliação não fica na tela.
    if (focoDoResultado !== null && focoDoResultado !== focoAtual) {
      $('resultados').hidden = true;
      $('aviso-geral').hidden = true;
    }
  }

  /* ---------- início ---------- */

  function iniciar() {
    montarOpcoes();
    Object.keys(TAMANHOS).forEach(function (campo) {
      var input = $(campo);
      if (!input || !input.hasAttribute('data-contador')) return;
      input.addEventListener('input', function () { atualizarContador(campo); });
      atualizarContador(campo);
    });
    $('unidade').addEventListener('change', alternarUnidadeOutra);
    $('opcoes-areas').addEventListener('change', atualizarContagemAreas);
    form.addEventListener('submit', aoEnviar);
    iniciarUpload();
    iniciarTurnstile();
    $('form-codigo').addEventListener('submit', aoPedirCodigo);
    $('form-entrar').addEventListener('submit', aoEntrar);
    $('botao-outro-email').addEventListener('click', voltarAoEmail);
    $('botao-sair').addEventListener('click', sair);
    $('busca').addEventListener('input', desenharOportunidades);
    $('filtro-prazo').addEventListener('change', desenharOportunidades);
    window.addEventListener('hashchange', aoMudarEndereco);
    if (MODO_MOCK) {
      var aviso = el('p', 'aviso-mock', 'Modo de teste: nada é enviado; os resultados são exemplos fixos.' +
        (MODO_MOCK === 'login' ? ' Código de acesso: 123456.' : ''));
      $('conteudo').insertBefore(aviso, $('conteudo').firstChild);
    }
    lerSessaoGuardada();
    carregarOportunidades();
  }

  iniciar();
})();

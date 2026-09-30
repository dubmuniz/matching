/*
 * Fioconecta · Matching de Oportunidades — frontend.
 *
 * Regras de segurança:
 * - todo texto vindo do servidor entra na página com textContent (nunca innerHTML);
 * - links só são exibidos com protocolo http(s), em nova aba, com rel="noopener noreferrer";
 * - a validação aqui é só para ajudar o usuário: o servidor valida tudo de novo.
 *
 * Modo de teste sem backend: ?mock=1 (resultado de exemplo), ?mock=vazio, ?mock=erro.
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

  // Exporta para os testes no Node.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LISTAS: LISTAS, TAMANHOS: TAMANHOS, validarFormulario: validarFormulario, linkSeguro: linkSeguro, limpar: limpar };
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

  var idWidgetTurnstile = null;

  function iniciarTurnstile() {
    if (!CONFIG.turnstileSiteKey || MODO_MOCK) return;
    window.fioconectaTurnstileCarregado = function () {
      idWidgetTurnstile = window.turnstile.render('#turnstile', { sitekey: CONFIG.turnstileSiteKey, language: 'pt-br' });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=fioconectaTurnstileCarregado&render=explicit';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function tokenTurnstile() {
    if (idWidgetTurnstile === null || !window.turnstile) return '';
    return window.turnstile.getResponse(idWidgetTurnstile) || '';
  }

  function reiniciarTurnstile() {
    if (idWidgetTurnstile !== null && window.turnstile) window.turnstile.reset(idWidgetTurnstile);
  }

  /* ---------- envio ---------- */

  function enviar(dados) {
    if (MODO_MOCK) return respostaMock(MODO_MOCK);
    if (!CONFIG.webAppUrl) {
      return Promise.resolve({ ok: false, erro: 'A página ainda não foi configurada (falta a URL do serviço). Avise o Escritório de Captação.' });
    }
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
      return res.json();
    }).then(function (json) {
      if (!json || typeof json !== 'object' || typeof json.ok !== 'boolean') throw new Error('resposta inesperada');
      return json;
    }).catch(function (e) {
      var tempo = e && e.name === 'AbortError';
      return {
        ok: false,
        erro: tempo
          ? 'A análise demorou mais que o esperado. Tente novamente em alguns minutos.'
          : 'Não foi possível falar com o serviço. Verifique sua conexão e tente novamente.'
      };
    }).then(function (r) {
      if (relogio) clearTimeout(relogio);
      return r;
    });
  }

  function respostaMock(modo) {
    var espera = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
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

    enviar(dados).then(function (r) {
      $('carregando').hidden = true;
      botao.disabled = false;
      form.removeAttribute('aria-busy');
      reiniciarTurnstile();
      if (r.ok && r.resultado) {
        mostrarResultado(r);
      } else if (r.campos) {
        mostrarErros(r.campos, r.erro);
      } else {
        mostrarAvisoGeral((r.erro || 'Ocorreu um erro inesperado.') + (r.id_demanda ? ' Protocolo: ' + r.id_demanda + '.' : ''));
      }
    });
  }

  /* ---------- resultados ---------- */

  var CRITERIOS = [
    ['tematica', 'Temática', 40], ['elegibilidade', 'Elegibilidade', 25], ['porte', 'Porte', 15],
    ['maturidade', 'Maturidade', 10], ['viabilidade', 'Viabilidade', 10]
  ];

  function classeSelo(nota) {
    if (nota >= 75) return 'selo selo-alta';
    if (nota >= 60) return 'selo selo-boa';
    return 'selo selo-parcial';
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
    $('protocolo').textContent = r.id_demanda ? 'Protocolo: ' + r.id_demanda : '';

    var topo = $('resumo-demanda');
    topo.textContent = '';
    if (res.resumo_demanda) topo.appendChild(paragrafoRotulado('Sua demanda', res.resumo_demanda, 'resumo-demanda'));
    if (res.lacunas_da_demanda && res.lacunas_da_demanda.length) {
      var caixa = el('aside', 'caixa-lacunas');
      caixa.setAttribute('aria-label', 'Para melhorar o matching');
      caixa.appendChild(el('h3', null, 'Para melhorar o matching'));
      var ul = el('ul');
      res.lacunas_da_demanda.forEach(function (l) { ul.appendChild(el('li', null, l)); });
      caixa.appendChild(ul);
      topo.appendChild(caixa);
    }

    var lista = $('lista-resultados');
    lista.textContent = '';
    if (res.vazio) {
      lista.appendChild(el('p', 'mensagem-vazio', res.mensagem_vazio));
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
    iniciarTurnstile();
    if (MODO_MOCK) {
      var aviso = el('p', 'aviso-mock', 'Modo de teste: nada é enviado; o resultado é um exemplo fixo.');
      form.parentNode.insertBefore(aviso, form);
    }
  }

  iniciar();
})();

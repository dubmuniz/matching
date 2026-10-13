/*
 * apresentacao.js — monta a apresentação executiva (.pptx) com o PptxGenJS (docs/lib/pptxgen.bundle.js).
 *
 * Identidade visual do modelo do Escritório (Captação Internacional para OSCs): fonte Archivo,
 * 16:9, capa quase preta, slide de tese em vinho, conteúdo em cinza-claro, rótulo em maiúsculas
 * acima do título, cartões com rótulos, números em destaque. Laranja e amarelo só como destaque.
 *
 * Layouts adaptativos: cada texto é medido (larguras reais dos caracteres da Archivo, quebra de
 * linha simulada) e recebe o maior tamanho de fonte que cabe na caixa; se nem o mínimo couber, o
 * texto é cortado com "…" e o texto completo vai para as anotações do slide. Os elementos ocupam a
 * altura toda do slide, e a IA escolhe a variante de alguns slides num catálogo fechado
 * (problema: numero | pontos | texto; proposta: grade | colunas | lista; resultados: cartoes | numeros).
 * Sem foto, ícones (docs/img/icones, Lucide, ISC) em círculos coloridos fazem o papel visual.
 *
 * Entrada: textos da IA (servidor), fatos do edital/financiador (planilha, via servidor), fotos do
 * acervo Fiocruz Imagens (com crédito), ícones e os dados do formulário (nome/e-mail ficam só no
 * navegador). Todo texto entra como texto; nada de HTML.
 *
 * Funciona no navegador (window.ApresentacaoPptx) e no Node (module.exports), para os testes.
 */
(function (raiz) {
  'use strict';

  var COR = {
    escuro: '201E1D', vinho: '6E2623', vinhoMedio: '903638', vinhoEscuro: '5A221F',
    laranja: 'EF7918', laranjaEscuro: 'B8540A', amarelo: 'FFC000',
    claro: 'F3F2F2', branco: 'FFFFFF', cinza: 'C2C1C1', cinzaMedio: 'D9D6D4', rosado: 'EADFDD',
    texto: '201E1D', textoSuave: '5A5553'
  };
  var FONTE = 'Archivo';
  var L = 13.333, A = 7.5, M = 0.6;   // largura, altura e margem (polegadas)
  var Y_TITULO = 0.95, Y_FIM = 6.7;    // topo do título e fim da área de conteúdo
  var ENTRELINHA = 1.18;               // espaçamento fixo entre linhas (× tamanho da fonte)
  var FOLGA = 1.06;                    // margem de erro da medida de largura

  /** Catálogo de ícones (precisa bater com ICONES_APRESENTACAO em Apresentacao.gs). */
  var ICONES = [
    'saude', 'comunidade', 'pesquisa', 'dados', 'clima', 'agua', 'vacina', 'vetor', 'educacao', 'territorio',
    'rede', 'crescimento', 'recursos', 'prazo', 'meta', 'protecao', 'inovacao', 'documento', 'parceria', 'global',
    'hospital', 'infancia', 'laboratorio', 'resultado', 'ambiente', 'moradia', 'comunicacao', 'equidade'
  ];
  var ICONES_FIXOS = ['parceria', 'saude'];

  var IDIOMA_CODIGO = { 'Português': 'pt', 'Inglês': 'en', 'Espanhol': 'es', 'Francês': 'fr' };

  var T = {
    pt: {
      exec: 'APRESENTAÇÃO EXECUTIVA', tese: 'A TESE', problema: 'O PROBLEMA', proposta: 'A PROPOSTA',
      resultados: 'RESULTADOS ESPERADOS', alinhamento: 'POR QUE {alvo}', escala: 'ESCALA E INVESTIMENTO',
      parcerias: 'PARCERIAS E CRONOGRAMA', proximos: 'PRÓXIMOS PASSOS', objetivos: 'OBJETIVOS',
      valorProjeto: 'Valor estimado do projeto', valoresEdital: 'Valores do edital', alvoEdital: 'EDITAL', alvoFinanciador: 'FINANCIADOR',
      parceirosTit: 'PARCEIROS', etapasTit: 'ETAPAS', contato: 'CONTATO', escritorio: 'Escritório de Captação de Recursos · Presidência da Fiocruz',
      rascunho: 'Rascunho gerado com apoio de IA. Revise todo o conteúdo antes de usar.',
      notaRascunho: 'RASCUNHO GERADO COM APOIO DE IA (Fioconecta). Revise todos os textos antes de usar; nada aqui foi conferido pelo Escritório.',
      rodape: 'RASCUNHO', textoCompleto: 'Texto completo (cortado no slide):'
    },
    en: {
      exec: 'EXECUTIVE PRESENTATION', tese: 'THE CASE', problema: 'THE PROBLEM', proposta: 'THE PROPOSAL',
      resultados: 'EXPECTED RESULTS', alinhamento: 'WHY {alvo}', escala: 'SCALE AND INVESTMENT',
      parcerias: 'PARTNERSHIPS AND TIMELINE', proximos: 'NEXT STEPS', objetivos: 'OBJECTIVES',
      valorProjeto: 'Estimated project value', valoresEdital: 'Call amounts', alvoEdital: 'CALL', alvoFinanciador: 'FUNDER',
      parceirosTit: 'PARTNERS', etapasTit: 'MILESTONES', contato: 'CONTACT', escritorio: 'Resource Mobilization Office · Fiocruz Presidency',
      rascunho: 'AI-assisted draft. Review all content before use.',
      notaRascunho: 'AI-ASSISTED DRAFT (Fioconecta). Review all text before use; nothing here has been checked by the Office.',
      rodape: 'DRAFT', textoCompleto: 'Full text (shortened on the slide):'
    },
    es: {
      exec: 'PRESENTACIÓN EJECUTIVA', tese: 'LA TESIS', problema: 'EL PROBLEMA', proposta: 'LA PROPUESTA',
      resultados: 'RESULTADOS ESPERADOS', alinhamento: 'POR QUÉ {alvo}', escala: 'ESCALA E INVERSIÓN',
      parcerias: 'ALIANZAS Y CRONOGRAMA', proximos: 'PRÓXIMOS PASOS', objetivos: 'OBJETIVOS',
      valorProjeto: 'Valor estimado del proyecto', valoresEdital: 'Montos de la convocatoria', alvoEdital: 'CONVOCATORIA', alvoFinanciador: 'FINANCIADOR',
      parceirosTit: 'SOCIOS', etapasTit: 'ETAPAS', contato: 'CONTACTO', escritorio: 'Oficina de Captación de Recursos · Presidencia de Fiocruz',
      rascunho: 'Borrador generado con apoyo de IA. Revise todo el contenido antes de usarlo.',
      notaRascunho: 'BORRADOR GENERADO CON APOYO DE IA (Fioconecta). Revise todos los textos antes de usarlos.',
      rodape: 'BORRADOR', textoCompleto: 'Texto completo (recortado en la diapositiva):'
    },
    fr: {
      exec: 'PRÉSENTATION EXÉCUTIVE', tese: 'LA THÈSE', problema: 'LE PROBLÈME', proposta: 'LA PROPOSITION',
      resultados: 'RÉSULTATS ATTENDUS', alinhamento: 'POURQUOI {alvo}', escala: 'ÉCHELLE ET INVESTISSEMENT',
      parcerias: 'PARTENARIATS ET CALENDRIER', proximos: 'PROCHAINES ÉTAPES', objetivos: 'OBJECTIFS',
      valorProjeto: 'Valeur estimée du projet', valoresEdital: "Montants de l'appel", alvoEdital: 'APPEL', alvoFinanciador: 'BAILLEUR',
      parceirosTit: 'PARTENAIRES', etapasTit: 'ÉTAPES', contato: 'CONTACT', escritorio: 'Bureau de mobilisation de ressources · Présidence de la Fiocruz',
      rascunho: "Brouillon généré avec l'aide de l'IA. Vérifiez tout le contenu avant usage.",
      notaRascunho: "BROUILLON GÉNÉRÉ AVEC L'AIDE DE L'IA (Fioconecta). Vérifiez tous les textes avant usage.",
      rodape: 'BROUILLON', textoCompleto: 'Texte complet (raccourci sur la diapositive) :'
    }
  };

  function texto(v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim(); }

  function maiusculas(s) { return texto(s).toLocaleUpperCase('pt-BR'); }

  /* ---------------- medida e ajuste de texto ---------------- */

  // Avanço de cada caractere ASCII 32–126 na Archivo (centésimos de em), regular e negrito.
  var LARG_REG = [21, 27, 37, 58, 51, 95, 69, 21, 36, 36, 41, 62, 28, 33, 28, 29, 57, 52, 57, 57, 56, 57, 57, 55, 57, 57, 30, 30, 62, 62, 62, 58, 100, 68, 70, 73, 73, 68, 61, 80, 74, 27, 56, 66, 54, 85, 74, 79, 66, 79, 73, 67, 61, 73, 65, 92, 68, 66, 64, 30, 29, 30, 62, 48, 19, 55, 57, 52, 57, 55, 28, 56, 56, 22, 22, 51, 22, 86, 56, 57, 57, 57, 33, 51, 30, 56, 50, 72, 51, 50, 50, 35, 24, 35, 62];
  var LARG_NEG = [20, 30, 46, 60, 56, 97, 76, 25, 36, 36, 41, 64, 31, 33, 31, 30, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 34, 34, 64, 64, 64, 61, 100, 72, 72, 73, 74, 68, 62, 80, 75, 30, 60, 72, 59, 87, 75, 79, 68, 79, 73, 68, 64, 75, 69, 96, 71, 70, 65, 35, 30, 35, 64, 52, 23, 58, 61, 57, 61, 58, 32, 61, 60, 27, 26, 57, 27, 89, 60, 61, 61, 61, 38, 56, 34, 60, 55, 80, 57, 55, 52, 39, 25, 39, 64];
  var LARG_ESPECIAIS = { '–': 50, '—': 100, '…': 97, '“': 49, '”': 49, '‘': 28, '’': 28, '•': 44, '·': 33, '€': 60, '£': 60, 'º': 40, 'ª': 40, '°': 40 };

  /** Largura de um texto em polegadas, no tamanho dado (pt), com espaçamento extra entre letras (pt). */
  function larguraTexto(s, tamanho, negrito, espaco) {
    var tab = negrito ? LARG_NEG : LARG_REG, em = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), k = c.charCodeAt(0);
      if (k >= 32 && k < 127) { em += tab[k - 32]; continue; }
      if (LARG_ESPECIAIS[c]) { em += LARG_ESPECIAIS[c]; continue; }
      var base = c.normalize ? c.normalize('NFD').charCodeAt(0) : 0;
      em += (base >= 32 && base < 127) ? tab[base - 32] : 62;
    }
    return (em / 100 * tamanho + s.length * (espaco || 0)) / 72;
  }

  /** Quebra de linha por palavras, como no PowerPoint; palavra maior que a linha é partida. */
  function quebrarLinhas(s, tamanho, largura, negrito, espaco) {
    var limite = largura / FOLGA, linhas = [], atual = '';
    var cabe = function (x) { return larguraTexto(x, tamanho, negrito, espaco) <= limite; };
    texto(s).split(' ').filter(Boolean).forEach(function (p) {
      var tentativa = atual ? atual + ' ' + p : p;
      if (cabe(tentativa)) { atual = tentativa; return; }
      if (atual) linhas.push(atual);
      while (p.length > 1 && !cabe(p)) {
        var n = p.length - 1;
        while (n > 1 && !cabe(p.slice(0, n))) n--;
        linhas.push(p.slice(0, n));
        p = p.slice(n);
      }
      atual = p;
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  function alturaLinhas(n, tamanho) { return n * tamanho * ENTRELINHA / 72; }

  /**
   * Maior tamanho de fonte (entre max e min) em que o texto cabe na caixa. Se nem o mínimo couber,
   * corta palavras do fim e põe "…".
   * @param {Object} o  { max, min, negrito, espaco, maxLinhas }
   * @return {{ texto, tamanho, linhas, altura, cortado }}
   */
  function ajustarTexto(s, w, h, o) {
    var t = texto(s);
    var cabe = function (tam, x) {
      var n = quebrarLinhas(x, tam, w, o.negrito, o.espaco).length;
      return alturaLinhas(n, tam) <= h + 0.001 && (!o.maxLinhas || n <= o.maxLinhas) ? n : 0;
    };
    if (!t) return { texto: '', tamanho: o.min, linhas: 0, altura: 0, cortado: false };
    for (var tam = o.max; tam >= o.min; tam -= (tam > 28 ? 2 : 1)) {
      var n = cabe(tam, t);
      if (n) return { texto: t, tamanho: tam, linhas: n, altura: alturaLinhas(n, tam), cortado: false };
    }
    var palavras = t.split(' ');
    while (palavras.length > 1) {
      palavras.pop();
      var c = palavras.join(' ').replace(/[\s,;:.–—-]+$/, '') + '…';
      var nc = cabe(o.min, c);
      if (nc) return { texto: c, tamanho: o.min, linhas: nc, altura: alturaLinhas(nc, o.min), cortado: true };
    }
    var unica = quebrarLinhas(t, o.min, w, o.negrito, o.espaco)[0] || '';
    return { texto: unica.slice(0, Math.max(1, unica.length - 1)) + '…', tamanho: o.min, linhas: 1, altura: alturaLinhas(1, o.min), cortado: true };
  }

  /**
   * Tamanho comum para textos irmãos (cartões de um mesmo slide): o menor que serve a todos,
   * para que o slide não fique com cada cartão num tamanho.
   */
  function tamanhoComum(textos, w, h, o) {
    var t = o.max;
    textos.forEach(function (x) { if (texto(x)) t = Math.min(t, ajustarTexto(x, w, h, o).tamanho); });
    return Math.max(t, o.min);
  }

  /* ---------------- desenho ---------------- */

  function bytesDeBase64(b64) {
    if (typeof atob === 'function') {
      var bin = atob(b64), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  /**
   * Largura e altura (pixels) de um JPEG ou PNG, lidas do cabeçalho. null se não reconhecer.
   * A biblioteca precisa da proporção real para recortar a foto ("cover") sem esticá-la.
   */
  function dimensoesDaImagem(bytes) {
    var b = bytes;
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
      var w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
      var h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
      return w && h ? { w: w, h: h } : null;
    }
    if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) {
      var i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        var marca = b[i + 1];
        if (marca === 0xD8 || marca === 0x01 || (marca >= 0xD0 && marca <= 0xD7)) { i += 2; continue; }
        var tam = (b[i + 2] << 8) | b[i + 3];
        // SOF0–SOF15, menos DHT (C4), JPG (C8) e DAC (CC)
        if (marca >= 0xC0 && marca <= 0xCF && marca !== 0xC4 && marca !== 0xC8 && marca !== 0xCC) {
          var hj = (b[i + 5] << 8) | b[i + 6], wj = (b[i + 7] << 8) | b[i + 8];
          return wj && hj ? { w: wj, h: hj } : null;
        }
        i += 2 + tam;
      }
    }
    return null;
  }

  /**
   * Monta os auxiliares de desenho de uma apresentação (pres) com os ícones carregados.
   * Cada slide guarda os textos cortados para as anotações (slide._cortes).
   */
  function desenhista(pres, icones) {
    var D = {};

    /**
     * Escreve um texto ajustado à caixa. Devolve a altura usada (para empilhar o próximo elemento).
     * @param {Object} e  { max, min, negrito, cor, alinhar, valign, maxLinhas, espaco, maiusculas }
     */
    D.texto = function (slide, s, caixa, e) {
      var original = e.maiusculas ? maiusculas(s) : texto(s);
      var a = ajustarTexto(original, caixa.w, caixa.h, e);
      if (!a.texto) return 0;
      if (a.cortado) (slide._cortes = slide._cortes || []).push(original);
      var valign = e.valign || 'top';
      slide.addText(a.texto, {
        x: caixa.x, y: caixa.y, w: caixa.w, h: valign === 'top' ? Math.max(a.altura, 0.2) : caixa.h,
        fontFace: FONTE, fontSize: a.tamanho, bold: !!e.negrito, color: e.cor || COR.texto,
        align: e.alinhar || 'left', valign: valign, margin: 0, lineSpacing: Math.round(a.tamanho * ENTRELINHA * 10) / 10,
        charSpacing: e.espaco || 0, fit: 'none', isTextBox: true, objectName: e.nome || 'texto'
      });
      return a.altura;
    };

    /** Rótulo pequeno em maiúsculas (uma linha). */
    D.rotulo = function (slide, s, x, y, w, cor, max) {
      return D.texto(slide, s, { x: x, y: y, w: w, h: 0.3 }, { max: max || 13, min: 9, negrito: true, cor: cor, espaco: 1.5, maxLinhas: 1, maiusculas: true, nome: 'rotulo' });
    };

    /** Rótulo do slide e título; devolve o y onde começa o conteúdo. */
    D.cabecalho = function (slide, rot, tit, corRotulo, corTitulo, w) {
      D.rotulo(slide, rot, M, 0.5, w || (L - 2 * M), corRotulo);
      var h = D.texto(slide, tit, { x: M, y: Y_TITULO, w: w || (L - 2 * M), h: 1.25 }, { max: 36, min: 24, negrito: true, cor: corTitulo, maxLinhas: 2, nome: 'titulo' });
      return Y_TITULO + h + 0.45;
    };

    D.retangulo = function (slide, x, y, w, h, cor, opcoes) {
      opcoes = opcoes || {};
      slide.addShape(opcoes.reto ? pres.ShapeType.rect : pres.ShapeType.roundRect, {
        x: x, y: y, w: w, h: h, rectRadius: 0.08, fill: { color: cor, transparency: opcoes.transparencia || 0 },
        line: { color: opcoes.borda || cor, width: opcoes.borda ? 0.75 : 0 }, objectName: opcoes.nome || 'cartao'
      });
    };

    D.cartao = function (slide, x, y, w, h) { D.retangulo(slide, x, y, w, h, COR.branco, { borda: COR.cinzaMedio }); };

    D.circulo = function (slide, x, y, d, cor, opcoes) {
      opcoes = opcoes || {};
      slide.addShape(pres.ShapeType.ellipse, {
        x: x, y: y, w: d, h: d, fill: opcoes.vazio ? { type: 'none' } : { color: cor },
        line: opcoes.vazio ? { color: cor, width: opcoes.linha || 3 } : { color: cor, width: 0 }, objectName: 'circulo'
      });
    };

    /** Ícone branco num círculo colorido; sem o ícone, o número (n) no círculo. */
    D.marcador = function (slide, chave, n, x, y, d, cor) {
      D.circulo(slide, x, y, d, cor);
      var b64 = icones && chave && icones[chave];
      if (b64) {
        slide.addImage({ data: 'image/png;base64,' + b64, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, altText: '', objectName: 'icone' });
        return;
      }
      if (n === undefined || n === null || n === '') return;
      slide.addText(String(n), {
        x: x, y: y, w: d, h: d, fontFace: FONTE, fontSize: Math.round(d * 30), bold: true, color: COR.branco,
        align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'numero'
      });
    };

    D.foto = function (slide, img, caixa, opcoes) {
      opcoes = opcoes || {};
      var dim = null;
      try { dim = dimensoesDaImagem(bytesDeBase64(img.base64)); } catch (e) { dim = null; }
      // w/h com a proporção real da foto; "sizing" recorta para a caixa, sem esticar nem vazar dela.
      var proporcao = dim ? dim.h / dim.w : caixa.h / caixa.w;
      slide.addImage({
        data: img.tipo_mime + ';base64,' + img.base64, x: caixa.x, y: caixa.y, w: caixa.w, h: caixa.w * proporcao,
        sizing: { type: 'cover', w: caixa.w, h: caixa.h }, altText: img.titulo || '', objectName: 'foto'
      });
      if (opcoes.creditoSobre) {
        // Crédito sobre a foto, numa faixa escura.
        D.retangulo(slide, caixa.x, caixa.y + caixa.h - 0.34, caixa.w, 0.34, '000000', { reto: true, transparencia: 45, nome: 'faixa' });
        D.texto(slide, img.credito, { x: caixa.x + 0.15, y: caixa.y + caixa.h - 0.29, w: caixa.w - 0.3, h: 0.25 },
          { max: 9, min: 7, cor: COR.branco, alinhar: 'right', maxLinhas: 1, nome: 'credito' });
      } else {
        D.texto(slide, img.credito, { x: caixa.x, y: caixa.y + caixa.h + 0.06, w: caixa.w, h: 0.25 },
          { max: 9, min: 7, cor: opcoes.corCredito || COR.textoSuave, alinhar: 'right', maxLinhas: 1, nome: 'credito' });
      }
    };

    /** Bloco com título (negrito) e texto abaixo, ajustados à caixa; devolve a altura usada. */
    D.tituloETexto = function (slide, tit, txt, caixa, e) {
      var y = caixa.y, usado = 0;
      if (texto(tit)) {
        usado = D.texto(slide, tit, { x: caixa.x, y: y, w: caixa.w, h: Math.min(caixa.h * 0.45, 0.9) },
          { max: e.maxTitulo || 19, min: e.minTitulo || 13, negrito: true, cor: e.corTitulo || COR.texto, maxLinhas: 2, maiusculas: e.tituloMaiusculo, espaco: e.tituloMaiusculo ? 1 : 0 });
        y += usado + 0.1;
      }
      var h2 = D.texto(slide, txt, { x: caixa.x, y: y, w: caixa.w, h: caixa.y + caixa.h - y },
        { max: e.max || 17, min: e.min || 11, cor: e.cor || COR.texto });
      return y - caixa.y + h2;
    };

    return D;
  }

  /* ---------------- conteúdo ---------------- */

  /** Ícone válido do catálogo, ou ''. */
  function icone(k) { return ICONES.indexOf(String(k || '')) >= 0 ? String(k) : ''; }

  /**
   * Aceita também respostas do formato anterior (apresentacao-v2) e preenche o que faltar,
   * para que o montador sempre receba o formato atual.
   */
  function slidesNoFormatoAtual(s) {
    s = JSON.parse(JSON.stringify(s || {}));
    var o = function (k) { s[k] = (s[k] && typeof s[k] === 'object') ? s[k] : {}; return s[k]; };
    var pr = o('problema'), po = o('proposta'), re = o('resultados'), al = o('alinhamento');
    o('escala'); o('parcerias_cronograma'); o('proximos_passos');
    if (pr.numero === undefined && pr.destaque_numero) {
      var m = texto(pr.destaque_numero).match(/^([\d.,%+]+)\s*(.*)$/);
      pr.numero = m ? m[1] : texto(pr.destaque_numero);
      pr.unidade = m ? m[2] : '';
      pr.rotulo_numero = pr.destaque_rotulo;
    }
    pr.pontos = (pr.pontos || []).filter(function (p) { return p && texto(p.texto); });
    if (['numero', 'pontos', 'texto'].indexOf(pr.layout) < 0) pr.layout = texto(pr.numero) ? 'numero' : (pr.pontos.length >= 2 ? 'pontos' : 'texto');
    if (pr.layout === 'numero' && !texto(pr.numero)) pr.layout = 'texto';
    if (pr.layout === 'pontos' && pr.pontos.length < 2) pr.layout = 'texto';
    po.objetivos = (po.objetivos || []).map(function (x) { return typeof x === 'string' ? { icone: '', titulo: '', texto: x } : x; })
      .filter(function (x) { return x && texto(x.texto); });
    if (['grade', 'colunas', 'lista'].indexOf(po.layout) < 0) po.layout = po.objetivos.length === 4 ? 'grade' : (po.objetivos.length >= 2 ? 'colunas' : 'lista');
    if (po.layout === 'grade' && po.objetivos.length === 3) po.layout = 'colunas';
    if (po.layout !== 'lista' && po.objetivos.length < 2) po.layout = 'lista';
    re.itens = (re.itens || []).filter(function (c) { return c && texto(c.texto); });
    if (re.layout !== 'numeros' || re.itens.some(function (c) { return !texto(c.numero); })) re.layout = 'cartoes';
    al.itens = (al.itens || []).filter(function (c) { return c && texto(c.texto); });
    return s;
  }

  /** Chaves dos ícones que a apresentação vai usar (para a página baixar só esses). */
  function iconesUsados(slides) {
    var s = slidesNoFormatoAtual(slides), usados = ICONES_FIXOS.slice();
    [s.problema.pontos, s.proposta.objetivos, s.resultados.itens, s.alinhamento.itens].forEach(function (lista) {
      (lista || []).forEach(function (c) { var k = icone(c.icone); if (k && usados.indexOf(k) < 0) usados.push(k); });
    });
    return usados;
  }

  function nomeArquivo(alvoNome) {
    var base = texto(alvoNome).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    return 'Apresentacao_executiva_' + (base || 'Fioconecta') + '.pptx';
  }

  /** Divide uma largura em n colunas com espaço entre elas. */
  function colunas(x, w, n, espaco) {
    var cw = (w - espaco * (n - 1)) / n, r = [];
    for (var i = 0; i < n; i++) r.push({ x: x + i * (cw + espaco), w: cw });
    return r;
  }

  /**
   * @param {Function} PptxGenJS  construtor da biblioteca
   * @param {Object} d  { idioma, demanda, alvo, slides, imagens, logo? (base64 PNG), icones? ({chave: base64 PNG}) }
   * @return {Object} a apresentação (pres); use pres.write(...) para gerar o arquivo
   */
  function montar(PptxGenJS, d) {
    var t = T[IDIOMA_CODIGO[d.idioma] || 'pt'];
    var s = slidesNoFormatoAtual(d.slides);
    var dem = d.demanda || {};
    var alvo = d.alvo || {};
    var imgs = (d.imagens || []).filter(function (i) { return i && i.base64 && /^image\/(jpeg|png)$/.test(i.tipo_mime); });
    var icones = d.icones || {};
    var notas = s.notas || [];
    var unidade = dem.unidade === 'Outra' ? texto(dem.unidadeOutra) : texto(dem.unidade);
    var nomeAlvoCompleto = alvo.tipo === 'financiador' ? texto(alvo.nome) : texto(alvo.financiador || alvo.nome);
    // Nos rótulos em maiúsculas, nome curto (cabe em uma linha).
    var nomeAlvo = nomeAlvoCompleto.length > 40 ? nomeAlvoCompleto.slice(0, 39) + '…' : nomeAlvoCompleto;
    var tituloCurto = texto(s.titulo_capa).length > 70 ? texto(s.titulo_capa).slice(0, 69) + '…' : texto(s.titulo_capa);

    var pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.title = texto(s.titulo_capa);
    pres.author = texto(dem.nome);
    pres.company = 'Fiocruz';
    pres.theme = { headFontFace: FONTE, bodyFontFace: FONTE };
    var D = desenhista(pres, icones);
    var numeroSlide = 0;

    function novoSlide(fundo) {
      var sl = pres.addSlide();
      sl.background = { color: fundo };
      numeroSlide++;
      return sl;
    }

    /** Rodapé discreto (título curto e número do slide) e anotações do apresentador. */
    function fechar(slide, escuro, comRodape) {
      if (comRodape !== false) {
        var cor = escuro ? COR.cinza : COR.textoSuave;
        D.texto(slide, 'FIOCRUZ · ' + tituloCurto, { x: M, y: 7.02, w: 9.0, h: 0.22 }, { max: 9, min: 7, cor: cor, maxLinhas: 1, espaco: 0.5, maiusculas: true, nome: 'rodape' });
        D.texto(slide, t.rodape + ' · ' + numeroSlide + '/9', { x: L - M - 3.0, y: 7.02, w: 3.0, h: 0.22 }, { max: 9, min: 7, cor: cor, alinhar: 'right', maxLinhas: 1, espaco: 0.5, nome: 'rodape' });
      }
      var n = texto(notas[numeroSlide - 1]);
      var cortes = (slide._cortes || []).filter(function (c, i, l) { return l.indexOf(c) === i; });
      var extra = cortes.length ? '\n\n' + t.textoCompleto + '\n' + cortes.join('\n') : '';
      slide.addNotes((n ? n + '\n\n' : '') + t.notaRascunho + extra);
    }

    var iconeTema = icone((s.proposta.objetivos[0] || {}).icone) || icone((s.resultados.itens[0] || {}).icone) || 'saude';

    /* 1. Capa (escura): com foto à direita, ou tipográfica com círculos e o ícone do tema */
    var capa = novoSlide(COR.escuro);
    var fotoCapa = imgs[0] || null;
    var largCapa = fotoCapa ? 6.5 : 7.6;
    if (fotoCapa) {
      D.foto(capa, fotoCapa, { x: 7.55, y: 0, w: L - 7.55, h: A }, { creditoSobre: true });
    } else {
      D.circulo(capa, 8.9, 0.9, 5.2, COR.vinho);
      D.circulo(capa, 8.15, 4.75, 1.9, COR.laranja, { vazio: true, linha: 4 });
      D.circulo(capa, 12.35, 0.55, 0.45, COR.amarelo);
      if (icones[iconeTema]) capa.addImage({ data: 'image/png;base64,' + icones[iconeTema], x: 10.35, y: 2.35, w: 2.3, h: 2.3, altText: '', objectName: 'icone' });
    }
    D.rotulo(capa, 'FIOCRUZ · ' + t.exec + ' · ' + nomeAlvo, M, 0.7, largCapa, COR.amarelo);
    var yCapa = 1.35;
    yCapa += D.texto(capa, s.titulo_capa, { x: M, y: yCapa, w: largCapa, h: 2.9 }, { max: 46, min: 28, negrito: true, cor: COR.branco, nome: 'titulo' }) + 0.35;
    capa.addShape(pres.ShapeType.rect, { x: M, y: yCapa, w: 1.1, h: 0.07, fill: { color: COR.laranja }, line: { color: COR.laranja, width: 0 } });
    yCapa += 0.35;
    D.texto(capa, s.subtitulo_capa, { x: M, y: yCapa, w: largCapa, h: Math.max(0.5, 5.3 - yCapa) }, { max: 22, min: 14, cor: COR.cinza });
    D.texto(capa, [dem.nome, unidade].filter(Boolean).join(' · '), { x: M, y: 5.55, w: largCapa, h: 0.35 },
      { max: 14, min: 10, negrito: true, cor: COR.laranja, espaco: 1, maxLinhas: 1, maiusculas: true });
    if (d.logo) capa.addImage({ data: 'image/png;base64,' + d.logo, x: M, y: 6.25, w: 1.6, h: 0.45, altText: 'Fiocruz' });
    D.texto(capa, t.rascunho, { x: M + 1.9, y: 6.3, w: largCapa - 1.9, h: 0.4 }, { max: 10, min: 8, cor: COR.cinza, valign: 'middle' });
    fechar(capa, true, false);

    /* 2. Tese (vinho), com aspas grandes */
    var tese = novoSlide(COR.vinho);
    D.rotulo(tese, t.tese, M, 0.7, 6, COR.amarelo);
    tese.addText('“', { x: M - 0.1, y: 0.95, w: 2, h: 1.9, fontFace: FONTE, fontSize: 180, bold: true, color: COR.amarelo, margin: 0, valign: 'top', isTextBox: true, objectName: 'aspas' });
    D.texto(tese, s.tese, { x: M + 0.1, y: 2.55, w: L - 2 * M - 1.4, h: 3.5 }, { max: 40, min: 24, negrito: true, cor: COR.branco, nome: 'tese' });
    tese.addShape(pres.ShapeType.rect, { x: M + 0.1, y: 6.45, w: 1.1, h: 0.07, fill: { color: COR.laranja }, line: { color: COR.laranja, width: 0 } });
    fechar(tese, true);

    /* 3. Problema: número em destaque, pontos com ícones ou texto; foto à direita quando houver */
    var prob = novoSlide(COR.claro);
    var p = s.problema;
    var fotoProb = p.layout !== 'numero' ? (imgs[1] || null) : null;
    var temDireita = p.layout === 'numero' || !!fotoProb;
    var largProb = temDireita ? 6.75 : L - 2 * M;
    var y0 = D.cabecalho(prob, t.problema, p.titulo, COR.laranjaEscuro, COR.texto, largProb);
    if (p.layout === 'numero') {
      var px = 7.85, pw = L - M - px, ph = Y_FIM - 1.0;
      D.retangulo(prob, px, 1.0, pw, ph, COR.vinho);
      D.circulo(prob, px + pw - 1.25, 1.0 + ph - 1.25, 0.8, COR.vinhoMedio);
      var iw = pw - 0.7;
      var a1 = ajustarTexto(p.numero, iw, 2.0, { max: 110, min: 40, negrito: true, maxLinhas: 1 });
      var a2 = ajustarTexto(p.unidade, iw, 1.0, { max: 30, min: 18, negrito: true, maxLinhas: 2 });
      var a3 = ajustarTexto(p.rotulo_numero, iw, 1.6, { max: 19, min: 13 });
      var total = a1.altura + (a2.texto ? a2.altura + 0.1 : 0) + (a3.texto ? a3.altura + 0.3 : 0);
      var yn = 1.0 + Math.max(0.4, (ph - total) / 2);
      yn += D.texto(prob, p.numero, { x: px + 0.35, y: yn, w: iw, h: 2.0 }, { max: 110, min: 40, negrito: true, cor: COR.amarelo, maxLinhas: 1, nome: 'numero' }) + 0.1;
      if (a2.texto) yn += D.texto(prob, p.unidade, { x: px + 0.35, y: yn, w: iw, h: 1.0 }, { max: 30, min: 18, negrito: true, cor: COR.branco, maxLinhas: 2 }) + 0.3;
      D.texto(prob, p.rotulo_numero, { x: px + 0.35, y: yn, w: iw, h: 1.6 }, { max: 19, min: 13, cor: COR.rosado });
    } else if (fotoProb) {
      D.foto(prob, fotoProb, { x: 7.85, y: 1.0, w: L - M - 7.85, h: Y_FIM - 1.3 });
    }
    if (p.layout === 'pontos' && !temDireita) {
      // Pontos em colunas (cartões com ícone), texto curto acima.
      var hT = D.texto(prob, p.texto, { x: M, y: y0, w: L - 2 * M, h: 1.3 }, { max: 20, min: 14, cor: COR.textoSuave });
      var yc = y0 + (hT ? hT + 0.4 : 0), cols = colunas(M, L - 2 * M, p.pontos.length, 0.35);
      var tp = tamanhoComum(p.pontos.map(function (x) { return x.texto; }), cols[0].w - 0.7, Y_FIM - yc - 1.75, { max: 22, min: 13 });
      p.pontos.forEach(function (pt, i) {
        var c = cols[i], hc = Y_FIM - yc;
        D.cartao(prob, c.x, yc, c.w, hc);
        D.marcador(prob, icone(pt.icone), i + 1, c.x + 0.35, yc + 0.35, 0.85, i % 2 ? COR.vinhoMedio : COR.laranja);
        D.texto(prob, pt.texto, { x: c.x + 0.35, y: yc + 1.45, w: c.w - 0.7, h: hc - 1.75 }, { max: tp, min: 13 });
      });
    } else if (p.layout === 'pontos') {
      var hT2 = D.texto(prob, p.texto, { x: M, y: y0, w: largProb, h: 1.5 }, { max: 19, min: 13, cor: COR.textoSuave });
      var yp = y0 + (hT2 ? hT2 + 0.35 : 0), alt = Math.min(1.35, (Y_FIM - yp) / p.pontos.length);
      var tp2 = tamanhoComum(p.pontos.map(function (x) { return x.texto; }), largProb - 0.95, alt - 0.2, { max: 19, min: 12 });
      p.pontos.forEach(function (pt, i) {
        var yy = yp + i * alt;
        D.marcador(prob, icone(pt.icone), i + 1, M, yy + 0.05, 0.7, i % 2 ? COR.vinhoMedio : COR.laranja);
        D.texto(prob, pt.texto, { x: M + 0.95, y: yy + 0.05, w: largProb - 0.95, h: alt - 0.2 }, { max: tp2, min: 12, valign: 'middle' });
      });
    } else {
      D.texto(prob, p.texto, { x: M, y: y0, w: largProb, h: Y_FIM - y0 }, { max: temDireita ? 24 : 28, min: 14 });
    }
    fechar(prob, false);

    /* 4. Proposta: texto e objetivos em grade 2 × 2, colunas ou lista */
    var prop = novoSlide(COR.claro);
    var po = s.proposta, objs = po.objetivos;
    var yP = D.cabecalho(prop, t.proposta, po.titulo, COR.laranjaEscuro, COR.texto);
    var hPT = D.texto(prop, po.texto, { x: M, y: yP - 0.1, w: L - 2 * M, h: objs.length ? 1.3 : Y_FIM - yP }, { max: objs.length ? 20 : 28, min: 14, cor: COR.textoSuave });
    yP += hPT + 0.35;
    var corObj = function (i) { return [COR.laranja, COR.vinhoMedio, COR.laranjaEscuro, COR.vinho][i % 4]; };
    /** Tamanhos comuns de título e texto dos objetivos, para caixas de largura w e altura h. */
    var tamanhosObj = function (w, h, e) {
      return {
        maxTitulo: tamanhoComum(objs.map(function (x) { return x.titulo; }), w, Math.min(h * 0.45, 0.9), { max: e.maxTitulo, min: 13, negrito: true, maxLinhas: 2 }),
        max: tamanhoComum(objs.map(function (x) { return x.texto; }), w, h - (objs.some(function (x) { return texto(x.titulo); }) ? Math.min(h * 0.45, 0.9) * 0.6 + 0.1 : 0), { max: e.max, min: 11 }),
        min: 11
      };
    };
    if (po.layout === 'grade') {
      var g = colunas(M, L - 2 * M, 2, 0.35), linhasG = Math.ceil(objs.length / 2), hg = (Y_FIM - yP - 0.3 * (linhasG - 1)) / linhasG;
      var dg = Math.min(0.85, hg - 0.4), tg = tamanhosObj(g[0].w - dg - 0.8, hg - 0.4, { maxTitulo: 19, max: 16 });
      objs.forEach(function (ob, i) {
        var c = g[i % 2], yy = yP + Math.floor(i / 2) * (hg + 0.3);
        D.cartao(prop, c.x, yy, c.w, hg);
        D.marcador(prop, icone(ob.icone), i + 1, c.x + 0.3, yy + (hg - dg) / 2, dg, corObj(i));
        D.tituloETexto(prop, ob.titulo, ob.texto, { x: c.x + dg + 0.55, y: yy + 0.22, w: c.w - dg - 0.8, h: hg - 0.4 }, tg);
      });
    } else if (po.layout === 'colunas') {
      var colsP = colunas(M, L - 2 * M, objs.length, 0.35), tc = tamanhosObj(colsP[0].w - 0.7, Y_FIM - yP - 1.7, { maxTitulo: 20, max: 18 });
      colsP.forEach(function (c, i) {
        var ob = objs[i], hc = Y_FIM - yP;
        D.cartao(prop, c.x, yP, c.w, hc);
        D.marcador(prop, icone(ob.icone), i + 1, c.x + 0.35, yP + 0.35, 0.85, corObj(i));
        D.tituloETexto(prop, ob.titulo, ob.texto, { x: c.x + 0.35, y: yP + 1.45, w: c.w - 0.7, h: hc - 1.7 }, tc);
      });
    } else {
      var hl = objs.length ? Math.min(1.3, (Y_FIM - yP) / objs.length) : 0, dl = Math.min(0.7, hl - 0.25);
      var tl = tamanhosObj(L - 2 * M - dl - 0.3, hl - 0.15, { maxTitulo: 18, max: 17 });
      objs.forEach(function (ob, i) {
        var yy = yP + i * hl;
        D.marcador(prop, icone(ob.icone), i + 1, M, yy + (hl - 0.15 - dl) / 2, dl, corObj(i));
        D.tituloETexto(prop, ob.titulo, ob.texto, { x: M + dl + 0.3, y: yy, w: L - 2 * M - dl - 0.3, h: hl - 0.15 }, tl);
      });
    }
    fechar(prop, false);

    /* 5. Resultados: cartões com ícone ou números em destaque */
    var res = novoSlide(COR.claro);
    var re = s.resultados;
    var yR = D.cabecalho(res, t.resultados, re.titulo, COR.laranjaEscuro, COR.texto);
    var colsR = re.itens.length ? colunas(M, L - 2 * M, re.itens.length, 0.35) : [];
    var textosR = re.itens.map(function (c) { return c.texto; });
    var tR = colsR.length ? tamanhoComum(textosR, colsR[0].w - 0.7, Y_FIM - yR - 2.6, { max: 22, min: 12 }) : 12;
    re.itens.forEach(function (c, i) {
      var k = colsR[i], hc = Y_FIM - yR;
      if (re.layout === 'numeros') {
        if (i > 0) res.addShape(pres.ShapeType.line, { x: k.x - 0.18, y: yR + 0.1, w: 0, h: hc - 0.2, line: { color: COR.cinza, width: 1 } });
        var yy = yR + 0.1;
        yy += D.texto(res, c.numero, { x: k.x + 0.1, y: yy, w: k.w - 0.2, h: 1.5 }, { max: 80, min: 36, negrito: true, cor: COR.vinhoMedio, maxLinhas: 1, nome: 'numero' }) + 0.05;
        if (texto(c.unidade)) yy += D.texto(res, c.unidade, { x: k.x + 0.1, y: yy, w: k.w - 0.2, h: 0.8 }, { max: 22, min: 15, negrito: true, cor: COR.vinho, maxLinhas: 2 }) + 0.25;
        yy += D.rotulo(res, c.rotulo, k.x + 0.1, yy, k.w - 0.2, COR.laranjaEscuro, 13) + 0.15;
        D.texto(res, c.texto, { x: k.x + 0.1, y: yy, w: k.w - 0.2, h: yR + hc - yy }, { max: 18, min: 12, cor: COR.textoSuave });
      } else {
        D.cartao(res, k.x, yR, k.w, hc);
        D.marcador(res, icone(c.icone), i + 1, k.x + 0.35, yR + 0.35, 0.85, i % 2 ? COR.vinhoMedio : COR.laranja);
        var yc = yR + 1.45;
        yc += D.texto(res, c.rotulo, { x: k.x + 0.35, y: yc, w: k.w - 0.7, h: 0.75 }, { max: 15, min: 11, negrito: true, cor: COR.laranjaEscuro, espaco: 1, maxLinhas: 2, maiusculas: true }) + 0.2;
        D.texto(res, c.texto, { x: k.x + 0.35, y: yc, w: k.w - 0.7, h: yR + hc - 0.3 - yc }, { max: tR, min: 12 });
      }
    });
    fechar(res, false);

    /* 6. Alinhamento (escuro): fatos do alvo à esquerda (planilha), razões com ícones à direita */
    var ali = novoSlide(COR.escuro);
    var yA = D.cabecalho(ali, t.alinhamento.replace('{alvo}', nomeAlvo), s.alinhamento.titulo, COR.amarelo, COR.branco);
    var pl = 4.5, phA = Y_FIM - yA;
    D.retangulo(ali, M, yA, pl, phA, COR.vinho);
    var yv = yA + 0.3;
    yv += D.rotulo(ali, alvo.tipo === 'financiador' ? t.alvoFinanciador : t.alvoEdital, M + 0.3, yv, pl - 0.6, COR.amarelo, 12) + 0.15;
    yv += D.texto(ali, alvo.nome, { x: M + 0.3, y: yv, w: pl - 0.6, h: Math.min(1.7, phA * 0.4) }, { max: 24, min: 14, negrito: true, cor: COR.branco }) + 0.2;
    var detalheAlvo = [alvo.tipo === 'financiador' ? '' : alvo.financiador, alvo.detalhe].filter(Boolean).join(' · ');
    D.texto(ali, detalheAlvo, { x: M + 0.3, y: yv, w: pl - 0.6, h: yA + phA - 0.25 - yv }, { max: 15, min: 10, cor: COR.cinza });
    var itensA = s.alinhamento.itens, xa = M + pl + 0.5, wa = L - M - xa;
    var ha = itensA.length ? (Y_FIM - yA) / itensA.length : 0;
    var tA = tamanhoComum(itensA.map(function (c) { return c.texto; }), wa - 1.0, ha - 0.75, { max: 19, min: 12 });
    itensA.forEach(function (c, i) {
      var yy = yA + i * ha;
      D.marcador(ali, icone(c.icone), i + 1, xa, yy + 0.05, 0.75, i % 2 ? COR.vinhoMedio : COR.laranja);
      var hr = D.rotulo(ali, c.rotulo, xa + 1.0, yy + 0.05, wa - 1.0, COR.laranja, 13);
      D.texto(ali, c.texto, { x: xa + 1.0, y: yy + hr + 0.15, w: wa - 1.0, h: ha - hr - 0.35 }, { max: tA, min: 12, cor: COR.branco });
    });
    fechar(ali, true);

    /* 7. Escala: valor do projeto (formulário) e do edital (planilha, como está) + texto; foto à direita */
    var esc = novoSlide(COR.claro);
    var fotoEsc = imgs[2] || null;
    var largEsc = fotoEsc ? 7.0 : L - 2 * M;
    var yE = D.cabecalho(esc, t.escala, s.escala.titulo, COR.laranjaEscuro, COR.texto, largEsc);
    var valoresEdital = alvo.tipo !== 'financiador' ? texto(alvo.valores) : '';
    var valoresLongos = valoresEdital.length > 45;
    var colsE = fotoEsc || valoresLongos ? [{ x: M, w: largEsc }] : colunas(M, largEsc, valoresEdital ? 2 : 1, 0.5);
    var destaque = function (sl, valor, rot, c, y) {
      var h = D.texto(sl, valor, { x: c.x, y: y, w: c.w, h: 1.3 }, { max: 44, min: 24, negrito: true, cor: COR.vinhoMedio, maxLinhas: 2, nome: 'numero' });
      return h + 0.08 + D.texto(sl, rot, { x: c.x, y: y + h + 0.08, w: c.w, h: 0.3 }, { max: 13, min: 10, cor: COR.textoSuave, maxLinhas: 1 });
    };
    var hD = destaque(esc, dem.valorEstimado, t.valorProjeto, colsE[0], yE);
    if (valoresEdital && !valoresLongos && !fotoEsc) hD = Math.max(hD, destaque(esc, valoresEdital, t.valoresEdital, colsE[1], yE));
    yE += hD + 0.35;
    if (valoresEdital && (valoresLongos || fotoEsc)) {
      // Valores longos (várias faixas ou moedas): painel com o texto da planilha ajustado.
      var hPainel = Math.min(2.2, (Y_FIM - yE) * 0.5);
      D.retangulo(esc, M, yE, largEsc, hPainel, COR.branco, { borda: COR.cinzaMedio });
      esc.addShape(pres.ShapeType.rect, { x: M, y: yE, w: 0.08, h: hPainel, fill: { color: COR.laranja }, line: { color: COR.laranja, width: 0 } });
      var hr2 = D.rotulo(esc, t.valoresEdital, M + 0.3, yE + 0.18, largEsc - 0.5, COR.laranjaEscuro, 12);
      D.texto(esc, valoresEdital, { x: M + 0.3, y: yE + 0.28 + hr2, w: largEsc - 0.55, h: hPainel - hr2 - 0.45 }, { max: 15, min: 10 });
      yE += hPainel + 0.35;
    } else {
      esc.addShape(pres.ShapeType.line, { x: M, y: yE - 0.15, w: largEsc, h: 0, line: { color: COR.cinza, width: 1 } });
      yE += 0.1;
    }
    D.texto(esc, s.escala.texto, { x: M, y: yE, w: largEsc, h: Y_FIM - yE }, { max: 22, min: 13 });
    if (fotoEsc) D.foto(esc, fotoEsc, { x: 8.15, y: 1.0, w: L - M - 8.15, h: Y_FIM - 1.3 });
    fechar(esc, false);

    /* 8. Parcerias e cronograma: cartões de parceiros; etapas em cartões (até 2) ou linha do tempo */
    var par = novoSlide(COR.claro);
    var pc = s.parcerias_cronograma, parceiros = pc.parcerias || [], etapas = pc.etapas || [];
    var yC = D.cabecalho(par, t.parcerias, pc.titulo, COR.laranjaEscuro, COR.texto);
    var ambos = parceiros.length && etapas.length;
    var wParc = ambos ? 4.4 : L - 2 * M, xEt = ambos ? M + wParc + 0.5 : M, wEt = L - M - xEt;
    if (parceiros.length) {
      var hrp = D.rotulo(par, t.parceirosTit, M, yC, wParc, COR.laranjaEscuro, 12) + 0.2;
      var yq = yC + hrp, hq = Math.min(2.2, (Y_FIM - yq - 0.25 * (parceiros.length - 1)) / parceiros.length);
      var dq0 = Math.min(0.75, hq - 0.3), tq = tamanhoComum(parceiros, wParc - dq0 - 0.7, hq - 0.3, { max: 20, min: 11, negrito: hq > 1.5 });
      parceiros.forEach(function (nome, i) {
        var yy = yq + i * (hq + 0.25), dq = Math.min(0.75, hq - 0.3);
        D.cartao(par, M, yy, wParc, hq);
        D.marcador(par, 'parceria', '', M + 0.25, yy + (hq - dq) / 2, dq, i % 2 ? COR.vinhoMedio : COR.laranja);
        D.texto(par, nome, { x: M + dq + 0.5, y: yy + 0.15, w: wParc - dq - 0.7, h: hq - 0.3 }, { max: tq, min: 11, valign: 'middle', negrito: hq > 1.5 });
      });
    }
    if (etapas.length) {
      var hre = D.rotulo(par, t.etapasTit, xEt, yC, wEt, COR.laranjaEscuro, 12) + 0.2;
      var ye = yC + hre;
      var largEtapa = etapas.length <= 2 ? (wEt - 0.35 * (etapas.length - 1)) / etapas.length - 0.7 : wEt / etapas.length - 0.25;
      var tE = tamanhoComum(etapas.map(function (e) { return e.texto; }), largEtapa, Y_FIM - ye - (etapas.length <= 2 ? 2.6 : 2.0), { max: etapas.length <= 2 ? 22 : 17, min: 11 });
      var tPer = tamanhoComum(etapas.map(function (e) { return e.periodo; }), largEtapa, etapas.length <= 2 ? 0.9 : 0.75, { max: etapas.length <= 2 ? 26 : 18, min: etapas.length <= 2 ? 16 : 12, negrito: true, maxLinhas: 2 });
      if (etapas.length <= 2) {
        colunas(xEt, wEt, etapas.length, 0.35).forEach(function (c, i) {
          var e = etapas[i], hc = Y_FIM - ye;
          D.cartao(par, c.x, ye, c.w, hc);
          par.addShape(pres.ShapeType.rect, { x: c.x, y: ye, w: c.w, h: 0.1, fill: { color: i % 2 ? COR.vinhoMedio : COR.laranja }, line: { width: 0, color: COR.laranja } });
          D.marcador(par, '', i + 1, c.x + 0.35, ye + 0.4, 0.7, i % 2 ? COR.vinhoMedio : COR.laranja);
          var yy = ye + 1.3;
          yy += D.texto(par, e.periodo, { x: c.x + 0.35, y: yy, w: c.w - 0.7, h: 0.9 }, { max: tPer, min: 16, negrito: true, cor: COR.vinho, maxLinhas: 2 }) + 0.2;
          D.texto(par, e.texto, { x: c.x + 0.35, y: yy, w: c.w - 0.7, h: ye + hc - 0.3 - yy }, { max: tE, min: 11 });
        });
      } else {
        var passo = wEt / etapas.length;
        par.addShape(pres.ShapeType.line, { x: xEt + 0.35, y: ye + 0.35, w: wEt - passo, h: 0, line: { color: COR.cinza, width: 2 } });
        etapas.forEach(function (e, i) {
          var x = xEt + i * passo, yy = ye + 1.0;
          D.marcador(par, '', i + 1, x, ye, 0.7, i % 2 ? COR.vinhoMedio : COR.laranja);
          yy += D.texto(par, e.periodo, { x: x, y: yy, w: passo - 0.25, h: 0.75 }, { max: tPer, min: 12, negrito: true, cor: COR.vinho, maxLinhas: 2 }) + 0.15;
          D.texto(par, e.texto, { x: x, y: yy, w: passo - 0.25, h: Y_FIM - yy }, { max: tE, min: 11 });
        });
      }
    }
    fechar(par, false);

    /* 9. Próximos passos e contato (vinho) */
    var prox = novoSlide(COR.vinho);
    var yX = D.cabecalho(prox, t.proximos, s.proximos_passos.titulo, COR.amarelo, COR.branco);
    var passos = s.proximos_passos.itens || [], wPassos = 7.6;
    var hx = passos.length ? Math.min(1.35, (Y_FIM - yX) / passos.length) : 0;
    var tX = tamanhoComum(passos, wPassos - 0.85, hx - 0.2, { max: 20, min: 12 });
    passos.forEach(function (ptx, i) {
      var yy = yX + i * hx;
      D.marcador(prox, '', i + 1, M, yy + (hx - 0.2 - 0.6) / 2, 0.6, COR.laranja);
      D.texto(prox, ptx, { x: M + 0.85, y: yy, w: wPassos - 0.85, h: hx - 0.2 }, { max: tX, min: 12, cor: COR.branco, valign: 'middle' });
    });
    var xk = M + wPassos + 0.6, wk = L - M - xk, hk = Y_FIM - yX;
    D.retangulo(prox, xk, yX, wk, hk, COR.vinhoEscuro);
    var yk = yX + 0.3;
    yk += D.rotulo(prox, t.contato, xk + 0.3, yk, wk - 0.6, COR.amarelo, 12) + 0.2;
    yk += D.texto(prox, dem.nome, { x: xk + 0.3, y: yk, w: wk - 0.6, h: 0.9 }, { max: 20, min: 13, negrito: true, cor: COR.branco, maxLinhas: 2 }) + 0.12;
    yk += D.texto(prox, unidade, { x: xk + 0.3, y: yk, w: wk - 0.6, h: 0.8 }, { max: 15, min: 11, cor: COR.branco, maxLinhas: 2 }) + 0.08;
    D.texto(prox, dem.email, { x: xk + 0.3, y: yk, w: wk - 0.6, h: 0.35 }, { max: 15, min: 9, cor: COR.amarelo, maxLinhas: 1 });
    D.texto(prox, t.escritorio, { x: xk + 0.3, y: yX + hk - 1.35, w: wk - 0.6, h: 0.6 }, { max: 11, min: 9, cor: COR.cinza });
    if (d.logo) prox.addImage({ data: 'image/png;base64,' + d.logo, x: xk + 0.3, y: yX + hk - 0.7, w: 1.6, h: 0.45, altText: 'Fiocruz' });
    fechar(prox, true);

    return pres;
  }

  var api = {
    montar: montar, nomeArquivo: nomeArquivo, dimensoesDaImagem: dimensoesDaImagem, iconesUsados: iconesUsados,
    ajustarTexto: ajustarTexto, quebrarLinhas: quebrarLinhas, larguraTexto: larguraTexto, slidesNoFormatoAtual: slidesNoFormatoAtual,
    ICONES: ICONES, IDIOMA_CODIGO: IDIOMA_CODIGO, T: T
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ApresentacaoPptx = api;
})(typeof window !== 'undefined' ? window : this);

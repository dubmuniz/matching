/*
 * apresentacao.js — monta a apresentação executiva (.pptx) com o PptxGenJS (docs/lib/pptxgen.bundle.js).
 *
 * Identidade visual do modelo do Escritório (Captação Internacional para OSCs): fonte Archivo,
 * 16:9, capa quase preta, slide de tese em vinho, conteúdo em cinza-claro, rótulo em maiúsculas
 * acima do título, cartões com rótulos, números em destaque. Laranja e amarelo só como destaque.
 *
 * Entrada: textos da IA (servidor), fatos do edital/financiador (planilha, via servidor), fotos do
 * acervo Fiocruz Imagens (com crédito) e os dados do formulário (nome/e-mail ficam só no navegador).
 * Todo texto entra como texto; nada de HTML.
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
      creditoPrefixo: ''
    },
    en: {
      exec: 'EXECUTIVE PRESENTATION', tese: 'THE CASE', problema: 'THE PROBLEM', proposta: 'THE PROPOSAL',
      resultados: 'EXPECTED RESULTS', alinhamento: 'WHY {alvo}', escala: 'SCALE AND INVESTMENT',
      parcerias: 'PARTNERSHIPS AND TIMELINE', proximos: 'NEXT STEPS', objetivos: 'OBJECTIVES',
      valorProjeto: 'Estimated project value', valoresEdital: 'Call amounts', alvoEdital: 'CALL', alvoFinanciador: 'FUNDER',
      parceirosTit: 'PARTNERS', etapasTit: 'MILESTONES', contato: 'CONTACT', escritorio: 'Resource Mobilization Office · Fiocruz Presidency',
      rascunho: 'AI-assisted draft. Review all content before use.',
      notaRascunho: 'AI-ASSISTED DRAFT (Fioconecta). Review all text before use; nothing here has been checked by the Office.',
      creditoPrefixo: ''
    },
    es: {
      exec: 'PRESENTACIÓN EJECUTIVA', tese: 'LA TESIS', problema: 'EL PROBLEMA', proposta: 'LA PROPUESTA',
      resultados: 'RESULTADOS ESPERADOS', alinhamento: 'POR QUÉ {alvo}', escala: 'ESCALA E INVERSIÓN',
      parcerias: 'ALIANZAS Y CRONOGRAMA', proximos: 'PRÓXIMOS PASOS', objetivos: 'OBJETIVOS',
      valorProjeto: 'Valor estimado del proyecto', valoresEdital: 'Montos de la convocatoria', alvoEdital: 'CONVOCATORIA', alvoFinanciador: 'FINANCIADOR',
      parceirosTit: 'SOCIOS', etapasTit: 'ETAPAS', contato: 'CONTACTO', escritorio: 'Oficina de Captación de Recursos · Presidencia de Fiocruz',
      rascunho: 'Borrador generado con apoyo de IA. Revise todo el contenido antes de usarlo.',
      notaRascunho: 'BORRADOR GENERADO CON APOYO DE IA (Fioconecta). Revise todos los textos antes de usarlos.',
      creditoPrefixo: ''
    },
    fr: {
      exec: 'PRÉSENTATION EXÉCUTIVE', tese: 'LA THÈSE', problema: 'LE PROBLÈME', proposta: 'LA PROPOSITION',
      resultados: 'RÉSULTATS ATTENDUS', alinhamento: 'POURQUOI {alvo}', escala: 'ÉCHELLE ET INVESTISSEMENT',
      parcerias: 'PARTENARIATS ET CALENDRIER', proximos: 'PROCHAINES ÉTAPES', objetivos: 'OBJECTIFS',
      valorProjeto: 'Valeur estimée du projet', valoresEdital: "Montants de l'appel", alvoEdital: 'APPEL', alvoFinanciador: 'BAILLEUR',
      parceirosTit: 'PARTENAIRES', etapasTit: 'ÉTAPES', contato: 'CONTACT', escritorio: 'Bureau de mobilisation de ressources · Présidence de la Fiocruz',
      rascunho: "Brouillon généré avec l'aide de l'IA. Vérifiez tout le contenu avant usage.",
      notaRascunho: "BROUILLON GÉNÉRÉ AVEC L'AIDE DE L'IA (Fioconecta). Vérifiez tous les textes avant usage.",
      creditoPrefixo: ''
    }
  };

  function texto(v) { return String(v === null || v === undefined ? '' : v); }

  function maiusculas(s) { return texto(s).toLocaleUpperCase('pt-BR'); }

  /** Rótulo pequeno em maiúsculas acima do título, como no modelo. */
  function rotulo(slide, s, cor, y, w) {
    slide.addText(maiusculas(s), {
      x: M, y: y === undefined ? 0.55 : y, w: w || (L - 2 * M), h: 0.35, fontFace: FONTE, fontSize: 13, bold: true,
      color: cor, charSpacing: 1.5, margin: 0, isTextBox: true, objectName: 'rotulo'
    });
  }

  function titulo(slide, s, cor, opcoes) {
    opcoes = opcoes || {};
    slide.addText(texto(s), {
      x: M, y: opcoes.y || 0.95, w: opcoes.w || (L - 2 * M), h: opcoes.h || 1.0, fontFace: FONTE, fontSize: opcoes.tamanho || 32,
      bold: true, color: cor, margin: 0, valign: 'top', isTextBox: true, objectName: 'titulo'
    });
  }

  function corpo(slide, s, caixa, cor, tamanho) {
    slide.addText(texto(s), Object.assign({
      fontFace: FONTE, fontSize: tamanho || 17, color: cor || COR.texto, margin: 0, valign: 'top',
      paraSpaceAfter: 6, isTextBox: true, objectName: 'texto'
    }, caixa));
  }

  function foto(slide, img, caixa, corCredito) {
    if (!img) return false;
    slide.addImage({
      data: img.tipo_mime + ';base64,' + img.base64, x: caixa.x, y: caixa.y, w: caixa.w, h: caixa.h,
      sizing: { type: 'cover', w: caixa.w, h: caixa.h }, altText: img.titulo || '', objectName: 'foto'
    });
    slide.addText(texto(img.credito), {
      x: caixa.x, y: caixa.y + caixa.h + 0.05, w: caixa.w, h: 0.3, fontFace: FONTE, fontSize: 9,
      color: corCredito || COR.textoSuave, margin: 0, align: 'right', isTextBox: true, objectName: 'credito'
    });
    return true;
  }

  /** Cartão com rótulo (laranja, maiúsculas) e texto, sobre fundo branco. */
  function cartao(pres, slide, x, y, w, h, rot, txt, opcoes) {
    opcoes = opcoes || {};
    slide.addShape(pres.ShapeType.roundRect, {
      x: x, y: y, w: w, h: h, rectRadius: 0.08, fill: { color: opcoes.fundo || COR.branco },
      line: { color: opcoes.fundo || COR.cinzaMedio, width: 0.75 }, objectName: 'cartao'
    });
    slide.addText(maiusculas(rot), {
      x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.35, fontFace: FONTE, fontSize: 12, bold: true,
      color: opcoes.corRotulo || COR.laranjaEscuro, charSpacing: 1, margin: 0, isTextBox: true
    });
    slide.addText(texto(txt), {
      x: x + 0.25, y: y + 0.6, w: w - 0.5, h: h - 0.8, fontFace: FONTE, fontSize: opcoes.tamanho || 15,
      color: opcoes.corTexto || COR.texto, margin: 0, valign: 'top', isTextBox: true
    });
  }

  function numeroEmCirculo(pres, slide, n, x, y, cor) {
    slide.addShape(pres.ShapeType.ellipse, { x: x, y: y, w: 0.5, h: 0.5, fill: { color: cor || COR.laranja }, line: { color: cor || COR.laranja } });
    slide.addText(String(n), {
      x: x, y: y, w: 0.5, h: 0.5, fontFace: FONTE, fontSize: 16, bold: true, color: COR.branco,
      align: 'center', valign: 'middle', margin: 0, isTextBox: true
    });
  }

  function nomeArquivo(alvoNome) {
    var base = texto(alvoNome).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    return 'Apresentacao_executiva_' + (base || 'Fioconecta') + '.pptx';
  }

  /**
   * @param {Function} PptxGenJS  construtor da biblioteca
   * @param {Object} d  { idioma, demanda, alvo, slides, imagens, logo? (base64 PNG) }
   * @return {Object} a apresentação (pres); use pres.write(...) para gerar o arquivo
   */
  function montar(PptxGenJS, d) {
    var t = T[IDIOMA_CODIGO[d.idioma] || 'pt'];
    var s = d.slides;
    var dem = d.demanda || {};
    var alvo = d.alvo || {};
    var imgs = (d.imagens || []).filter(function (i) { return i && i.base64 && /^image\/(jpeg|png)$/.test(i.tipo_mime); });
    var notas = s.notas || [];
    var nota = function (slide, i) {
      var n = texto(notas[i]);
      slide.addNotes((n ? n + '\n\n' : '') + t.notaRascunho);
    };
    var unidade = dem.unidade === 'Outra' ? texto(dem.unidadeOutra) : texto(dem.unidade);
    var nomeAlvo = alvo.tipo === 'financiador' ? texto(alvo.nome) : texto(alvo.financiador || alvo.nome);

    var pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.title = texto(s.titulo_capa);
    pres.author = texto(dem.nome);
    pres.company = 'Fiocruz';
    pres.theme = { headFontFace: FONTE, bodyFontFace: FONTE };

    // 1. Capa (escura), com foto à direita quando houver
    var capa = pres.addSlide();
    capa.background = { color: COR.escuro };
    var temFotoCapa = !!imgs[0];
    var larguraTexto = temFotoCapa ? 6.9 : L - 2 * M;
    if (temFotoCapa) foto(capa, imgs[0], { x: 7.9, y: 0, w: L - 7.9, h: A - 0.4 }, COR.cinza);
    rotulo(capa, 'FIOCRUZ · ' + t.exec + ' · ' + nomeAlvo, COR.amarelo, 0.7, larguraTexto);
    capa.addText(texto(s.titulo_capa), {
      x: M, y: 1.35, w: larguraTexto, h: 2.6, fontFace: FONTE, fontSize: 40, bold: true, color: COR.branco,
      margin: 0, valign: 'top', isTextBox: true, objectName: 'titulo'
    });
    corpo(capa, s.subtitulo_capa, { x: M, y: 4.0, w: larguraTexto, h: 1.1 }, COR.cinza, 20);
    capa.addText(maiusculas([dem.nome, unidade].filter(Boolean).join(' · ')), {
      x: M, y: 5.45, w: larguraTexto, h: 0.4, fontFace: FONTE, fontSize: 14, bold: true, color: COR.laranja,
      charSpacing: 1, margin: 0, isTextBox: true
    });
    if (d.logo) capa.addImage({ data: 'image/png;base64,' + d.logo, x: M, y: 6.05, w: 1.6, h: 0.45, altText: 'Fiocruz' });
    capa.addText(t.rascunho, {
      x: M + 1.9, y: 6.1, w: larguraTexto - 1.9, h: 0.4, fontFace: FONTE, fontSize: 10, color: COR.cinza,
      margin: 0, valign: 'middle', isTextBox: true
    });
    nota(capa, 0);

    // 2. Tese (vinho)
    var tese = pres.addSlide();
    tese.background = { color: COR.vinho };
    rotulo(tese, t.tese, COR.amarelo, 1.6);
    tese.addText(texto(s.tese), {
      x: M, y: 2.15, w: L - 2 * M - 1.0, h: 3.2, fontFace: FONTE, fontSize: 34, bold: true, color: COR.branco,
      margin: 0, valign: 'top', isTextBox: true, objectName: 'tese'
    });
    nota(tese, 1);

    // 3. Problema (claro): texto à esquerda; número em destaque ou foto à direita
    var prob = pres.addSlide();
    prob.background = { color: COR.claro };
    rotulo(prob, t.problema, COR.laranjaEscuro);
    var temNumero = !!texto(s.problema.destaque_numero);
    var fotoProb = !temNumero ? imgs[1] : null;
    var largProb = (temNumero || fotoProb) ? 6.6 : L - 2 * M;
    titulo(prob, s.problema.titulo, COR.texto, { w: largProb });
    corpo(prob, s.problema.texto, { x: M, y: 2.35, w: largProb, h: 3.6 });
    if (temNumero) {
      prob.addShape(pres.ShapeType.roundRect, { x: 7.75, y: 1.6, w: 4.98, h: 3.8, rectRadius: 0.1, fill: { color: COR.vinho }, line: { color: COR.vinho } });
      prob.addText(texto(s.problema.destaque_numero), {
        x: 8.05, y: 2.0, w: 4.4, h: 1.6, fontFace: FONTE, fontSize: 60, bold: true, color: COR.amarelo, margin: 0, valign: 'middle', isTextBox: true
      });
      prob.addText(texto(s.problema.destaque_rotulo), {
        x: 8.05, y: 3.65, w: 4.4, h: 1.5, fontFace: FONTE, fontSize: 18, color: COR.branco, margin: 0, valign: 'top', isTextBox: true
      });
    } else if (fotoProb) {
      foto(prob, fotoProb, { x: 7.75, y: 1.0, w: 4.98, h: 5.3 });
    }
    nota(prob, 2);

    // 4. Proposta: texto + objetivos numerados em grade 2 × 2
    var prop = pres.addSlide();
    prop.background = { color: COR.claro };
    rotulo(prop, t.proposta, COR.laranjaEscuro);
    titulo(prop, s.proposta.titulo, COR.texto);
    corpo(prop, s.proposta.texto, { x: M, y: 2.05, w: L - 2 * M, h: 1.2 });
    var objs = s.proposta.objetivos || [];
    var colW = (L - 2 * M - 0.4) / 2;
    objs.forEach(function (o, i) {
      var x = M + (i % 2) * (colW + 0.4), y = 3.45 + Math.floor(i / 2) * 1.55;
      prop.addShape(pres.ShapeType.roundRect, { x: x, y: y, w: colW, h: 1.35, rectRadius: 0.08, fill: { color: COR.branco }, line: { color: COR.cinzaMedio, width: 0.75 } });
      numeroEmCirculo(pres, prop, i + 1, x + 0.25, y + 0.42);
      prop.addText(texto(o), { x: x + 0.95, y: y + 0.15, w: colW - 1.15, h: 1.05, fontFace: FONTE, fontSize: 15, color: COR.texto, margin: 0, valign: 'middle', isTextBox: true });
    });
    nota(prop, 3);

    // 5. Resultados: três cartões
    var res = pres.addSlide();
    res.background = { color: COR.claro };
    rotulo(res, t.resultados, COR.laranjaEscuro);
    titulo(res, s.resultados.titulo, COR.texto);
    var itensRes = s.resultados.itens || [];
    var cw = itensRes.length ? (L - 2 * M - 0.4 * (itensRes.length - 1)) / itensRes.length : 0;
    itensRes.forEach(function (c, i) { cartao(pres, res, M + i * (cw + 0.4), 2.4, cw, 2.7, c.rotulo, c.texto, { tamanho: 17 }); });
    nota(res, 4);

    // 6. Alinhamento (escuro): fatos do alvo à esquerda (planilha), razões à direita
    var ali = pres.addSlide();
    ali.background = { color: COR.escuro };
    rotulo(ali, t.alinhamento.replace('{alvo}', nomeAlvo), COR.amarelo);
    titulo(ali, s.alinhamento.titulo, COR.branco);
    ali.addShape(pres.ShapeType.roundRect, { x: M, y: 2.35, w: 4.3, h: 3.9, rectRadius: 0.1, fill: { color: COR.vinho }, line: { color: COR.vinho } });
    ali.addText(alvo.tipo === 'financiador' ? t.alvoFinanciador : t.alvoEdital, {
      x: M + 0.3, y: 2.6, w: 3.7, h: 0.35, fontFace: FONTE, fontSize: 12, bold: true, color: COR.amarelo, charSpacing: 1, margin: 0, isTextBox: true
    });
    ali.addText(texto(alvo.nome), { x: M + 0.3, y: 3.0, w: 3.7, h: 1.6, fontFace: FONTE, fontSize: 20, bold: true, color: COR.branco, margin: 0, valign: 'top', isTextBox: true });
    var detalheAlvo = [alvo.tipo === 'financiador' ? '' : alvo.financiador, alvo.detalhe].filter(Boolean).join(' · ');
    ali.addText(texto(detalheAlvo), { x: M + 0.3, y: 4.65, w: 3.7, h: 1.4, fontFace: FONTE, fontSize: 13, color: COR.cinza, margin: 0, valign: 'top', isTextBox: true });
    (s.alinhamento.itens || []).forEach(function (c, i) {
      var y = 2.35 + i * 1.32;
      ali.addText(maiusculas(c.rotulo), { x: 5.5, y: y, w: L - 5.5 - M, h: 0.35, fontFace: FONTE, fontSize: 12, bold: true, color: COR.laranja, charSpacing: 1, margin: 0, isTextBox: true });
      ali.addText(texto(c.texto), { x: 5.5, y: y + 0.38, w: L - 5.5 - M, h: 0.85, fontFace: FONTE, fontSize: 15, color: COR.branco, margin: 0, valign: 'top', isTextBox: true });
    });
    nota(ali, 5);

    // 7. Escala: números em destaque (formulário e planilha) + texto
    var esc = pres.addSlide();
    esc.background = { color: COR.claro };
    rotulo(esc, t.escala, COR.laranjaEscuro);
    titulo(esc, s.escala.titulo, COR.texto);
    var destaques = [{ valor: dem.valorEstimado, rotulo: t.valorProjeto }];
    if (alvo.tipo !== 'financiador' && alvo.valores) destaques.push({ valor: alvo.valores, rotulo: t.valoresEdital });
    destaques.forEach(function (dq, i) {
      var x = M + i * 4.3;
      esc.addText(texto(dq.valor), { x: x, y: 2.3, w: 4.0, h: 1.3, fontFace: FONTE, fontSize: texto(dq.valor).length > 22 ? 22 : 34, bold: true, color: COR.vinhoMedio, margin: 0, valign: 'bottom', isTextBox: true });
      esc.addText(texto(dq.rotulo), { x: x, y: 3.65, w: 4.0, h: 0.4, fontFace: FONTE, fontSize: 13, color: COR.textoSuave, margin: 0, isTextBox: true });
    });
    var fotoEsc = imgs[2] || null;
    corpo(esc, s.escala.texto, { x: M, y: 4.45, w: fotoEsc ? 7.0 : L - 2 * M, h: 2.2 });
    if (fotoEsc) foto(esc, fotoEsc, { x: 8.2, y: 2.3, w: L - 8.2 - M, h: 4.0 });
    nota(esc, 6);

    // 8. Parcerias (lista) e cronograma (etapas em linha do tempo)
    var par = pres.addSlide();
    par.background = { color: COR.claro };
    rotulo(par, t.parcerias, COR.laranjaEscuro);
    titulo(par, s.parcerias_cronograma.titulo, COR.texto);
    par.addText(t.parceirosTit, { x: M, y: 2.3, w: 4.2, h: 0.35, fontFace: FONTE, fontSize: 12, bold: true, color: COR.laranjaEscuro, charSpacing: 1, margin: 0, isTextBox: true });
    (s.parcerias_cronograma.parcerias || []).forEach(function (p, i) {
      par.addShape(pres.ShapeType.roundRect, { x: M, y: 2.75 + i * 0.95, w: 4.2, h: 0.8, rectRadius: 0.08, fill: { color: COR.branco }, line: { color: COR.cinzaMedio, width: 0.75 } });
      par.addText(texto(p), { x: M + 0.2, y: 2.75 + i * 0.95, w: 3.8, h: 0.8, fontFace: FONTE, fontSize: 14, color: COR.texto, margin: 0, valign: 'middle', isTextBox: true });
    });
    var etapas = s.parcerias_cronograma.etapas || [];
    var x0 = 5.4, largEt = L - M - x0;
    par.addText(t.etapasTit, { x: x0, y: 2.3, w: largEt, h: 0.35, fontFace: FONTE, fontSize: 12, bold: true, color: COR.laranjaEscuro, charSpacing: 1, margin: 0, isTextBox: true });
    if (etapas.length) {
      var passo = largEt / etapas.length;
      par.addShape(pres.ShapeType.line, { x: x0 + 0.25, y: 3.25, w: largEt - passo + 0.0001, h: 0, line: { color: COR.cinza, width: 2 } });
      etapas.forEach(function (e, i) {
        var x = x0 + i * passo;
        numeroEmCirculo(pres, par, i + 1, x, 3.0, i % 2 ? COR.vinhoMedio : COR.laranja);
        par.addText(texto(e.periodo), { x: x, y: 3.7, w: passo - 0.2, h: 0.4, fontFace: FONTE, fontSize: 13, bold: true, color: COR.vinho, margin: 0, isTextBox: true });
        par.addText(texto(e.texto), { x: x, y: 4.1, w: passo - 0.2, h: 2.3, fontFace: FONTE, fontSize: 14, color: COR.texto, margin: 0, valign: 'top', isTextBox: true });
      });
    }
    nota(par, 7);

    // 9. Próximos passos e contato (vinho)
    var prox = pres.addSlide();
    prox.background = { color: COR.vinho };
    rotulo(prox, t.proximos, COR.amarelo);
    titulo(prox, s.proximos_passos.titulo, COR.branco);
    (s.proximos_passos.itens || []).forEach(function (p, i) {
      var y = 2.35 + i * 0.95;
      numeroEmCirculo(pres, prox, i + 1, M, y + 0.08, COR.laranja);
      prox.addText(texto(p), { x: M + 0.75, y: y, w: 7.0, h: 0.8, fontFace: FONTE, fontSize: 16, color: COR.branco, margin: 0, valign: 'middle', isTextBox: true });
    });
    prox.addShape(pres.ShapeType.roundRect, { x: 9.0, y: 2.35, w: L - 9.0 - M, h: 2.8, rectRadius: 0.1, fill: { color: COR.vinhoEscuro }, line: { color: COR.vinhoEscuro } });
    prox.addText(t.contato, { x: 9.3, y: 2.6, w: L - 9.6 - M, h: 0.35, fontFace: FONTE, fontSize: 12, bold: true, color: COR.amarelo, charSpacing: 1, margin: 0, isTextBox: true });
    prox.addText([
      { text: texto(dem.nome), options: { bold: true, fontSize: 16, breakLine: true } },
      { text: unidade, options: { fontSize: 13, breakLine: true } },
      { text: texto(dem.email), options: { fontSize: 13, breakLine: true } },
      { text: t.escritorio, options: { fontSize: 11, color: COR.cinza } }
    ], { x: 9.3, y: 3.0, w: L - 9.6 - M, h: 2.5, fontFace: FONTE, color: COR.branco, margin: 0, valign: 'top', paraSpaceAfter: 6, isTextBox: true });
    if (d.logo) prox.addImage({ data: 'image/png;base64,' + d.logo, x: M, y: 6.45, w: 1.6, h: 0.45, altText: 'Fiocruz' });
    nota(prox, 8);

    return pres;
  }

  var api = { montar: montar, nomeArquivo: nomeArquivo, IDIOMA_CODIGO: IDIOMA_CODIGO, T: T };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ApresentacaoPptx = api;
})(typeof window !== 'undefined' ? window : this);

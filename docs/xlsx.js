/*
 * xlsx.js — gerador mínimo de planilhas .xlsx (SpreadsheetML), sem dependências.
 *
 * Suporta: várias abas, texto, números, fórmulas, larguras de coluna, células mescladas,
 * painel congelado e um conjunto fixo de estilos (ESTILOS). Texto entra como "inline string".
 * O zip é gravado sem compressão (método 0), com CRC-32.
 *
 * Uso:
 *   var bytes = XlsxSimples.criar([{ nome: 'Aba', colunas: [20, 40], linhas: [[{ v: 'A1' }, { v: 2, e: 'numero' }]],
 *                                    mesclar: ['A1:B1'], congelar: { linhas: 1, colunas: 0 } }]);
 * Célula: { v: texto|número, e: nomeDoEstilo, f: 'FÓRMULA sem =' }   (ou null para vazia)
 *
 * Funciona no navegador (window.XlsxSimples) e no Node (module.exports), para os testes.
 */
(function (raiz) {
  'use strict';

  // Ordem = índice em cellXfs. Fontes, preenchimentos e bordas definidos em estilosXml().
  var ESTILOS = {
    padrao: 0,
    titulo: 1,        // grande, negrito
    subtitulo: 2,     // itálico, cinza
    cabecalho: 3,     // negrito branco sobre azul, com borda, quebra de linha
    texto: 4,         // quebra de linha, alinhado ao topo, com borda
    rotulo: 5,        // negrito sobre cinza-claro, com borda, quebra de linha
    numero: 6,        // #,##0.00 com borda
    total: 7,         // negrito, #,##0.00, fundo cinza
    gantt: 8,         // preenchido (barra do Gantt)
    marco: 9,         // preenchido escuro, ◆ centralizado
    aviso: 10,        // fundo amarelo, negrito, quebra de linha
    nivel: 11,        // negrito sobre azul-claro (níveis do marco lógico)
    mes: 12,          // cabeçalho estreito centralizado
    vazioBorda: 13,   // célula vazia com borda (grade do Gantt)
    totalRotulo: 14   // negrito, fundo cinza, alinhado à direita
  };

  function escaparXml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      // caracteres de controle não são permitidos em XML 1.0 (exceto tab, LF, CR)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  }

  /** 0 → 'A', 25 → 'Z', 26 → 'AA' */
  function letraColuna(i) {
    var s = '';
    i += 1;
    while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function ref(linha, coluna) { return letraColuna(coluna) + (linha + 1); }

  function celulaXml(c, r) {
    if (c === null || c === undefined) return '';
    var estilo = c.e && ESTILOS[c.e] !== undefined ? ESTILOS[c.e] : 0;
    var atrS = estilo ? ' s="' + estilo + '"' : '';
    if (c.f) return '<c r="' + r + '"' + atrS + '><f>' + escaparXml(c.f) + '</f></c>';
    if (typeof c.v === 'number' && isFinite(c.v)) return '<c r="' + r + '"' + atrS + '><v>' + c.v + '</v></c>';
    if (c.v === undefined || c.v === null || c.v === '') return estilo ? '<c r="' + r + '"' + atrS + '/>' : '';
    return '<c r="' + r + '"' + atrS + ' t="inlineStr"><is><t xml:space="preserve">' + escaparXml(c.v) + '</t></is></c>';
  }

  function abaXml(aba) {
    var partes = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    var cong = aba.congelar;
    if (cong && (cong.linhas || cong.colunas)) {
      var topo = ref(cong.linhas || 0, cong.colunas || 0);
      var painel = cong.linhas && cong.colunas ? 'bottomRight' : (cong.linhas ? 'bottomLeft' : 'topRight');
      partes.push('<sheetViews><sheetView workbookViewId="0"><pane' +
        (cong.colunas ? ' xSplit="' + cong.colunas + '"' : '') + (cong.linhas ? ' ySplit="' + cong.linhas + '"' : '') +
        ' topLeftCell="' + topo + '" activePane="' + painel + '" state="frozen"/></sheetView></sheetViews>');
    }
    if (aba.colunas && aba.colunas.length) {
      partes.push('<cols>' + aba.colunas.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (w || 10) + '" customWidth="1"/>';
      }).join('') + '</cols>');
    }
    partes.push('<sheetData>');
    (aba.linhas || []).forEach(function (linha, i) {
      var celulas = (linha || []).map(function (c, j) { return celulaXml(c, ref(i, j)); }).join('');
      var altura = aba.alturas && aba.alturas[i] ? ' ht="' + aba.alturas[i] + '" customHeight="1"' : '';
      if (celulas || altura) partes.push('<row r="' + (i + 1) + '"' + altura + '>' + celulas + '</row>');
    });
    partes.push('</sheetData>');
    if (aba.mesclar && aba.mesclar.length) {
      partes.push('<mergeCells count="' + aba.mesclar.length + '">' +
        aba.mesclar.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
    }
    partes.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
    partes.push('<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
    partes.push('</worksheet>');
    return partes.join('');
  }

  function estilosXml() {
    var borda = '<border><left style="thin"><color rgb="FFB7C2CC"/></left><right style="thin"><color rgb="FFB7C2CC"/></right>' +
      '<top style="thin"><color rgb="FFB7C2CC"/></top><bottom style="thin"><color rgb="FFB7C2CC"/></bottom><diagonal/></border>';
    var fill = function (rgb) { return '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>'; };
    var topoQuebra = '<alignment vertical="top" wrapText="1"/>';
    var centro = '<alignment horizontal="center" vertical="center" wrapText="1"/>';
    // xf: numFmtId fontId fillId borderId alinhamento
    var xf = function (num, font, fil, brd, alin) {
      return '<xf numFmtId="' + num + '" fontId="' + font + '" fillId="' + fil + '" borderId="' + brd + '" xfId="0"' +
        (num ? ' applyNumberFormat="1"' : '') + (font ? ' applyFont="1"' : '') + (fil ? ' applyFill="1"' : '') +
        (brd ? ' applyBorder="1"' : '') + (alin ? ' applyAlignment="1">' + alin + '</xf>' : '/>');
    };
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
      '<fonts count="6">' +
        '<font><sz val="10"/><name val="Arial"/><family val="2"/></font>' +                          // 0 normal
        '<font><b/><sz val="14"/><color rgb="FF083753"/><name val="Arial"/><family val="2"/></font>' + // 1 título
        '<font><i/><sz val="9"/><color rgb="FF4A5560"/><name val="Arial"/><family val="2"/></font>' +  // 2 subtítulo
        '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>' + // 3 cabeçalho
        '<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>' +                       // 4 negrito
        '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>' + // 5 marco
      '</fonts>' +
      '<fills count="9">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        fill('FF0B4A6F') +   // 2 azul escuro (cabeçalho)
        fill('FFEEF2F5') +   // 3 cinza claro (rótulo)
        fill('FFDCE3E9') +   // 4 cinza (total)
        fill('FF7FB3D5') +   // 5 azul médio (barra Gantt)
        fill('FF083753') +   // 6 azul muito escuro (marco)
        fill('FFFFF2CC') +   // 7 amarelo (aviso)
        fill('FFE1ECF5') +   // 8 azul claro (nível)
      '</fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' + borda + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="15">' +
        xf(0, 0, 0, 0, '') +                                  // 0 padrão
        xf(0, 1, 0, 0, '<alignment vertical="center"/>') +   // 1 título
        xf(0, 2, 0, 0, '<alignment vertical="top" wrapText="1"/>') + // 2 subtítulo
        xf(0, 3, 2, 1, centro) +                              // 3 cabeçalho
        xf(0, 0, 0, 1, topoQuebra) +                          // 4 texto
        xf(0, 4, 3, 1, topoQuebra) +                          // 5 rótulo
        xf(164, 0, 0, 1, '<alignment vertical="top"/>') +     // 6 número
        xf(164, 4, 4, 1, '<alignment vertical="top"/>') +     // 7 total
        xf(0, 0, 5, 1, '') +                                  // 8 gantt
        xf(0, 5, 6, 1, centro) +                              // 9 marco
        xf(0, 4, 7, 1, topoQuebra) +                          // 10 aviso
        xf(0, 4, 8, 1, topoQuebra) +                          // 11 nível
        xf(0, 3, 2, 1, centro) +                              // 12 mês
        xf(0, 0, 0, 1, '') +                                  // 13 vazio com borda
        xf(0, 4, 4, 1, '<alignment horizontal="right" vertical="top"/>') + // 14 rótulo do total
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /** Nome de aba válido: até 31 caracteres, sem []:*?/\ e sem repetir. */
  function nomeDeAbaValido(nome, usados) {
    var base = String(nome || 'Aba').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Aba';
    var n = base, k = 2;
    while (usados[n.toLowerCase()]) { var suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
    usados[n.toLowerCase()] = true;
    return n;
  }

  function arquivos(abas) {
    var usados = {};
    var nomes = abas.map(function (a) { return nomeDeAbaValido(a.nome, usados); });
    var lista = [];
    lista.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      abas.map(function (_, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>']);
    lista.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>']);
    lista.push(['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:creator>Fioconecta</dc:creator></cp:coreProperties>']);
    lista.push(['docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Fioconecta</Application></Properties>']);
    lista.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView/></bookViews><sheets>' +
      nomes.map(function (n, i) { return '<sheet name="' + escaparXml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>']);
    lista.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      abas.map(function (_, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>']);
    lista.push(['xl/styles.xml', estilosXml()]);
    abas.forEach(function (a, i) { lista.push(['xl/worksheets/sheet' + (i + 1) + '.xml', abaXml(a)]); });
    return lista;
  }

  /* ---------- zip (sem compressão) ---------- */

  var TABELA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(entradas) {
    var enc = new TextEncoder();
    var locais = [], centrais = [], deslocamento = 0;
    entradas.forEach(function (e) {
      var nome = enc.encode(e[0]);
      var dados = typeof e[1] === 'string' ? enc.encode(e[1]) : e[1];
      var crc = crc32(dados);
      var cab = new Uint8Array(30 + nome.length);
      var dv = new DataView(cab.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); // UTF-8
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, dados.length, true); dv.setUint32(22, dados.length, true);
      dv.setUint16(26, nome.length, true); dv.setUint16(28, 0, true);
      cab.set(nome, 30);
      var cen = new Uint8Array(46 + nome.length);
      var dc = new DataView(cen.buffer);
      dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true); dc.setUint16(8, 0x0800, true);
      dc.setUint16(10, 0, true); dc.setUint16(12, 0, true); dc.setUint16(14, 0x21, true);
      dc.setUint32(16, crc, true); dc.setUint32(20, dados.length, true); dc.setUint32(24, dados.length, true);
      dc.setUint16(28, nome.length, true); dc.setUint32(42, deslocamento, true);
      cen.set(nome, 46);
      locais.push(cab, dados);
      centrais.push(cen);
      deslocamento += cab.length + dados.length;
    });
    var tamCentral = centrais.reduce(function (s, c) { return s + c.length; }, 0);
    var fim = new Uint8Array(22);
    var df = new DataView(fim.buffer);
    df.setUint32(0, 0x06054b50, true);
    df.setUint16(8, entradas.length, true); df.setUint16(10, entradas.length, true);
    df.setUint32(12, tamCentral, true); df.setUint32(16, deslocamento, true);
    var partes = locais.concat(centrais, [fim]);
    var total = partes.reduce(function (s, p) { return s + p.length; }, 0);
    var saida = new Uint8Array(total), pos = 0;
    partes.forEach(function (p) { saida.set(p, pos); pos += p.length; });
    return saida;
  }

  /** Gera o .xlsx. @return {Uint8Array} */
  function criar(abas) {
    if (!abas || !abas.length) throw new Error('É preciso ao menos uma aba.');
    return zip(arquivos(abas));
  }

  var api = { criar: criar, ESTILOS: ESTILOS, letraColuna: letraColuna, ref: ref, crc32: crc32, nomeDeAbaValido: nomeDeAbaValido };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.XlsxSimples = api;
})(this);

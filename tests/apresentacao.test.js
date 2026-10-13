// Apresentação executiva (.pptx): servidor (IA + acervo Fiocruz Imagens) e montagem no navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AP = require('../apps-script/Apresentacao.gs');
const { criarContexto, respostaClaude, montarPlanilha, envioValido } = require('./ambiente');

const DOCS = path.join(__dirname, '..', 'docs');
const ACERVO = 'https://www.fiocruzimagens.fiocruz.br';
const MOCK = JSON.parse(fs.readFileSync(path.join(DOCS, 'mock', 'apresentacao-exemplo.json'), 'utf8'));
const SLIDES_IA = MOCK.slides;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

function postar(ctx, corpo) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(corpo) } }).conteudo);
}

function demanda(extra = {}) {
  const d = envioValido(extra);
  delete d.site; delete d.turnstileToken;
  return d;
}

function pedido(alvo, extra = {}) {
  return Object.assign({ acao: 'apresentacao', demanda: demanda(), alvo, idioma: 'Português', site: '', turnstileToken: '' }, extra);
}

function itemAcervo(id, titulo, assuntos, extra = {}) {
  return Object.assign({
    'o:id': id, 'o:is_public': true, 'o:title': titulo,
    'dcterms:subject': assuntos.map(a => ({ '@value': a })),
    'dcterms:creator': [{ '@value': 'Fulano de Tal' }],
    thumbnail_display_urls: { large: `${ACERVO}/files/large/${id}.jpg`, medium: `${ACERVO}/files/medium/${id}.jpg` }
  }, extra);
}

const BUSCA = [
  itemAcervo(1, 'Aedes aegypti', ['mosquito', 'dengue']),
  itemAcervo(2, 'Paisagem da Amazônia', ['Amazônia', 'clima']),
  itemAcervo(3, 'Privado', ['dengue'], { 'o:is_public': false }),
  itemAcervo(4, 'Sem relação', ['arquitetura']),
  itemAcervo(5, 'De outro site', ['dengue'], { thumbnail_display_urls: { large: 'https://malicioso.example/x.jpg' } })
];
const IMG = { codigo: 200, bytes: JPEG, cabecalhos: { 'Content-Type': 'image/jpeg' } };

// ---------------- funções puras ----------------

test('normalizarApresentacao: limites de tamanho, listas e campos obrigatórios', () => {
  const objetivo = (t) => ({ icone: 'dados', titulo: 'T', texto: t });
  const r = AP.normalizarApresentacao(Object.assign({}, SLIDES_IA, {
    tese: 'x'.repeat(500),
    proposta: Object.assign({}, SLIDES_IA.proposta, { objetivos: ['a', 'b', 'c', 'd', 'e', ''].map(objetivo).concat(['solto']) }),
    fotos: ['7', 'inventada', '7', 8, '9', '10'], extra: 'ignorado'
  }), ['7', '8', '9', '10']);
  assert.equal(r.ok, true);
  assert.equal(r.dados.tese.length, 220);
  assert.deepEqual(r.dados.proposta.objetivos.map(o => o.texto), ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.dados.fotos, ['7', '8', '9'], 'só IDs enviados, sem repetir, até 3');
  assert.deepEqual(AP.normalizarApresentacao(Object.assign({}, SLIDES_IA, { fotos: ['7'] })).dados.fotos, [], 'sem candidatos, sem fotos');
  assert.ok(!('extra' in r.dados));
  assert.equal(AP.normalizarApresentacao({}).ok, false);
  assert.equal(AP.normalizarApresentacao([]).ok, false);
  assert.equal(AP.normalizarApresentacao(Object.assign({}, SLIDES_IA, { tese: '' })).ok, false);
});

test('normalizarApresentacao: catálogo de layouts e ícones, com queda para a variante que cabe', () => {
  const com = (bloco, extra) => AP.normalizarApresentacao(Object.assign({}, SLIDES_IA, { [bloco]: Object.assign({}, SLIDES_IA[bloco], extra) })).dados[bloco];
  assert.equal(com('problema', { layout: 'mosaico' }).layout, 'numero', 'layout fora do catálogo: escolhe pelo conteúdo');
  assert.equal(com('problema', { layout: 'numero', numero: '' }).layout, 'pontos', 'sem número: pontos');
  assert.equal(com('problema', { layout: 'numero', numero: '', pontos: [] }).layout, 'texto');
  assert.equal(com('problema', { layout: 'pontos', pontos: [{ icone: 'x', texto: 'só um' }] }).layout, 'numero');
  assert.equal(com('problema', { numero: '' }).rotulo_numero, '', 'sem número, sem rótulo');
  const ob = SLIDES_IA.proposta.objetivos;
  assert.equal(com('proposta', { layout: 'grade', objetivos: ob.slice(0, 3) }).layout, 'colunas');
  assert.equal(com('proposta', { layout: 'colunas', objetivos: ob.slice(0, 1) }).layout, 'lista');
  assert.equal(com('proposta', { layout: '?' }).layout, 'grade');
  const icones = com('proposta', { objetivos: [{ icone: '../../x', titulo: '', texto: 'a' }, { icone: 'agua', titulo: '', texto: 'b' }] }).objetivos.map(o => o.icone);
  assert.deepEqual(icones, ['', 'agua'], 'ícone fora do catálogo vira vazio');
  assert.equal(com('resultados', { layout: 'numeros' }).layout, 'cartoes', 'itens sem número: cartões');
  assert.equal(com('resultados', { layout: 'outro' }).layout, 'cartoes');
});

test('normalizarApresentacao: número em destaque só se estiver escrito na demanda', () => {
  const fonte = JSON.stringify({ problema: 'Fase 1 deixou 25 municípios de fora; 2.000 agentes; 47 de 62 municípios' });
  const b = (problema, itens, layout) => Object.assign({}, SLIDES_IA, {
    problema: Object.assign({}, SLIDES_IA.problema, problema),
    resultados: { layout: layout || 'numeros', titulo: 'R', itens }
  });
  const item = (numero, unidade) => ({ icone: 'meta', numero, unidade, rotulo: 'r', texto: 't' });
  let r = AP.normalizarApresentacao(b({ numero: '25', unidade: 'municípios' }, [item('2000', 'agentes'), item('47', 'de 62 municípios')]), [], fonte).dados;
  assert.equal(r.problema.numero, '25');
  assert.equal(r.problema.layout, 'numero');
  assert.equal(r.resultados.layout, 'numeros', '"2000" casa com "2.000"');
  r = AP.normalizarApresentacao(b({ numero: '30', unidade: 'municípios' }, [item('47', 'de 63 municípios'), item('2.000', '')]), [], fonte).dados;
  assert.equal(r.problema.numero, '', 'número inventado é descartado');
  assert.notEqual(r.problema.layout, 'numero');
  assert.equal(r.resultados.itens[0].numero, '', 'número na unidade também é conferido');
  assert.equal(r.resultados.itens[1].numero, '2.000');
  assert.equal(r.resultados.layout, 'cartoes');
  r = AP.normalizarApresentacao(b({ numero: 'muitos', unidade: '' }, []), [], fonte).dados;
  assert.equal(r.problema.numero, '', 'sem dígitos não é número');
});

test('schema da apresentação: layouts e ícones em listas fechadas, iguais às da página', () => {
  const { ctx } = criarContexto(montarPlanilha(), []);
  const schema = JSON.parse(JSON.stringify(ctx.schemaApresentacao_())); // vm: arrays de outro contexto
  assert.deepEqual(schema.properties.problema.properties.layout.enum, ['numero', 'pontos', 'texto']);
  assert.deepEqual(schema.properties.proposta.properties.layout.enum, ['grade', 'colunas', 'lista']);
  assert.deepEqual(schema.properties.resultados.properties.layout.enum, ['cartoes', 'numeros']);
  assert.equal(schema.properties.proposta.properties.objetivos.items.properties.icone.type, 'string');
  assert.ok(!JSON.stringify(schema).includes('"comunicacao"'), 'lista de ícones fora do schema (complexidade)');
  const prompt = ctx.systemPromptApresentacao_('Português', 'oportunidade');
  for (const k of AP.ICONES_APRESENTACAO) assert.ok(prompt.includes(k), 'ícone no prompt: ' + k);
  const A = require('../docs/apresentacao.js');
  assert.deepEqual(A.ICONES, AP.ICONES_APRESENTACAO);
  for (const k of A.ICONES) assert.ok(fs.existsSync(path.join(DOCS, 'img', 'icones', k + '.png')), k);
  assert.match(ctx.systemPromptApresentacao_('Português', 'oportunidade'), /proposta\.layout/);
});

test('dadosDoItemAcervo: só itens públicos, com imagem do próprio acervo, e com crédito', () => {
  const d = AP.dadosDoItemAcervo(BUSCA[0], ACERVO);
  assert.equal(d.credito, 'Foto: Fulano de Tal / Fiocruz Imagens');
  assert.equal(d.url_imagem, `${ACERVO}/files/large/1.jpg`);
  assert.equal(d.url_item, `${ACERVO}/s/fiocruzimagens/item/1`);
  assert.deepEqual(d.assuntos, ['mosquito', 'dengue']);
  assert.equal(AP.dadosDoItemAcervo(BUSCA[2], ACERVO), null, 'não público');
  assert.equal(AP.dadosDoItemAcervo(BUSCA[4], ACERVO), null, 'outro domínio');
  assert.equal(AP.dadosDoItemAcervo(itemAcervo(9, 'x', [], { thumbnail_display_urls: {} }), ACERVO), null, 'sem imagem');
  assert.equal(AP.dadosDoItemAcervo(itemAcervo(9, 'x', [], { thumbnail_display_urls: { large: ACERVO + '.evil.com/a.jpg' } }), ACERVO), null);
});

test('pontuarItemAcervo: termo inteiro vale mais que palavra solta; acentos não importam', () => {
  const termos = ['Aedes aegypti', 'Amazonia'];
  const p = (i) => AP.pontuarItemAcervo(AP.dadosDoItemAcervo(BUSCA[i], ACERVO), termos);
  assert.ok(p(0) > p(3));
  assert.ok(p(1) > 0, 'Amazônia casa com Amazonia');
  assert.equal(p(3), 0);
});

test('termosDeBuscaFoto: vocabulário das áreas do projeto, alternando entre as áreas', () => {
  const S = require('../apps-script/Seguranca.gs');
  for (const area of S.AREAS_TEMATICAS) assert.ok(AP.VOCABULARIO_ACERVO_[area] && AP.VOCABULARIO_ACERVO_[area].length >= 2, area);
  assert.deepEqual(AP.termosDeBuscaFoto({ areas: ['Arboviroses e vetores', 'Clima e saúde'] }),
    ['Aedes aegypti', 'mudanças climáticas', 'dengue', 'clima']);
  assert.equal(AP.termosDeBuscaFoto({ areas: S.AREAS_TEMATICAS.slice(0, 3) }).length, 6);
  assert.deepEqual(AP.termosDeBuscaFoto({ areas: [] }), ['pesquisa em saúde', 'Fiocruz']);
});

// ---------------- servidor ----------------

// envioValido() tem as áreas "Arboviroses e vetores" e "Clima e saúde": 4 buscas no acervo antes da IA.
const BUSCAS_VAZIAS = [{ codigo: 200, corpo: [] }, { codigo: 200, corpo: [] }, { codigo: 200, corpo: [] }];
function iaEscolhe(fotos) { return respostaClaude(Object.assign({}, SLIDES_IA, { fotos })); }

test('apresentação para um edital: só o edital e a demanda vão para a IA; fotos do acervo com crédito', () => {
  const abas = montarPlanilha();
  const { ctx, requisicoes } = criarContexto(abas, [
    { codigo: 200, corpo: BUSCA }, ...BUSCAS_VAZIAS,
    iaEscolhe(['2', '1', '99']),
    IMG, IMG
  ]);
  const r = postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' }));
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.alvo.nome, 'Climate and Health');
  assert.equal(r.alvo.financiador, 'Wellcome Trust');
  assert.equal(r.alvo.valores, 'US$ 1M');
  assert.equal(r.slides.titulo_capa, SLIDES_IA.titulo_capa);
  assert.equal(r.imagens.length, 2);
  assert.equal(r.imagens[0].titulo, 'Paisagem da Amazônia', 'na ordem escolhida pela IA');
  assert.equal(r.imagens[1].credito, 'Foto: Fulano de Tal / Fiocruz Imagens');
  assert.equal(r.imagens[0].base64, JPEG.toString('base64'));

  const ia = requisicoes[4].corpo;
  const msg = JSON.stringify(ia);
  assert.match(ia.system, /relação CLARA/);
  // A IA só vê candidatos públicos, do acervo e com termo no título ou nos assuntos.
  const fotos = JSON.parse(ia.messages[0].content.split('<fotos_disponiveis>\n')[1].split('\n</fotos_disponiveis>')[0]);
  assert.deepEqual(fotos.map(f => f.id).sort(), ['1', '2']);
  for (const proibido of ['Maria Pesquisadora', 'maria@fiocruz.br', 'SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org']) {
    assert.ok(!msg.includes(proibido), proibido);
  }
  // Buscas só no acervo; imagens só do acervo (nunca do item de outro domínio).
  for (const req of [...requisicoes.slice(0, 4), ...requisicoes.slice(5)]) assert.ok(req.url.startsWith(ACERVO + '/'), req.url);
  assert.match(requisicoes[0].url, /\/api\/items\?per_page=10&fulltext_search=Aedes%20aegypti$/);
  assert.match(requisicoes[1].url, /fulltext_search=mudan%C3%A7as%20clim%C3%A1ticas$/);
  assert.deepEqual(requisicoes.slice(5).map(q => q.url), [`${ACERVO}/files/large/2.jpg`, `${ACERVO}/files/large/1.jpg`]);
});

test('apresentação para um financiador; vedado ou inexistente não chama a IA', () => {
  const fora = { codigo: 500, corpo: 'x' };
  let { ctx, requisicoes } = criarContexto(montarPlanilha(), [fora, fora, fora, fora, iaEscolhe(['1'])]);
  const r = postar(ctx, pedido({ tipo: 'financiador', organizacao: 'Wellcome Trust' }));
  assert.equal(r.ok, true);
  assert.equal(r.alvo.tipo, 'financiador');
  assert.equal(r.alvo.detalhe, 'UK');
  assert.deepEqual(r.imagens, [], 'acervo fora do ar: sai sem foto (e a escolha da IA sem candidato é ignorada)');
  assert.ok(!JSON.stringify(requisicoes[4].corpo).includes('CONTATO-INTERNO'));
  assert.equal(requisicoes.length, 5);

  for (const alvo of [{ tipo: 'financiador', organizacao: 'Vedada Foundation' }, { tipo: 'financiador', organizacao: 'Inexistente' },
    { tipo: 'oportunidade', id: 'LINHA-6' }, { tipo: 'oportunidade', id: 'OPP-9999' }]) {
    ({ ctx, requisicoes } = criarContexto(montarPlanilha(), []));
    const f = postar(ctx, pedido(alvo));
    assert.equal(f.ok, false, JSON.stringify(alvo));
    assert.match(f.erro, /não está mais disponível/);
    assert.equal(requisicoes.length, 0);
  }
});

test('apresentação: entradas malformadas são recusadas antes da IA', () => {
  const casos = [
    pedido({ tipo: 'outro', id: 'x' }), pedido({ tipo: 'oportunidade' }), pedido({ tipo: 'oportunidade', id: 'OPP-0001', x: 1 }),
    pedido({ tipo: 'financiador', organizacao: 'x'.repeat(201) }), pedido('OPP-0001'),
    pedido({ tipo: 'oportunidade', id: 'OPP-0001' }, { idioma: 'Alemão' }),
    pedido({ tipo: 'oportunidade', id: 'OPP-0001' }, { extra: true }),
    pedido({ tipo: 'oportunidade', id: 'OPP-0001' }, { demanda: demanda({ resumo: 'curto' }) })
  ];
  for (const c of casos) {
    const { ctx, requisicoes } = criarContexto(montarPlanilha(), []);
    assert.equal(postar(ctx, c).ok, false, JSON.stringify(c).slice(0, 120));
    assert.equal(requisicoes.length, 0);
  }
});

test('apresentação: imagem com tipo errado é ignorada; resposta grande é guardada sem fotos', () => {
  const grande = { codigo: 200, bytes: Buffer.alloc(80000, 1), cabecalhos: { 'Content-Type': 'image/jpeg' } };
  const { ctx, cache } = criarContexto(montarPlanilha(), [
    { codigo: 200, corpo: BUSCA }, ...BUSCAS_VAZIAS,
    iaEscolhe(['1', '2']),
    { codigo: 200, corpo: '<html>', cabecalhos: { 'Content-Type': 'text/html' } }, grande
  ]);
  const r = postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' }, { idPedido: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' }));
  assert.equal(r.ok, true);
  assert.equal(r.imagens.length, 1);
  const guardado = JSON.parse(Object.entries(cache).find(([k]) => k.startsWith('PEDIDO_'))[1]);
  assert.deepEqual(guardado.imagens, []);
  assert.equal(guardado.imagens_omitidas, true);
  assert.equal(guardado.slides.titulo_capa, SLIDES_IA.titulo_capa);
});

test('apresentação: limite de 8 por e-mail em 24 h', () => {
  const respostas = [];
  for (let i = 0; i < 8; i++) respostas.push({ codigo: 500, corpo: '' }, { codigo: 500, corpo: '' }, { codigo: 500, corpo: '' }, { codigo: 500, corpo: '' }, respostaClaude(SLIDES_IA));
  const { ctx } = criarContexto(montarPlanilha(), respostas);
  for (let i = 0; i < 8; i++) assert.equal(postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' })).ok, true, 'apresentação ' + (i + 1));
  assert.match(postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' })).erro, /limite de 8 apresentações/);
});

test('apresentação com login: e-mail do passe e registro em Acessos', () => {
  const abas = montarPlanilha();
  const { ctx } = criarContexto(abas, [...BUSCAS_VAZIAS, { codigo: 200, corpo: [] }, respostaClaude(SLIDES_IA)],
    { props: { LOGIN_ATIVO: 'sim' } });
  assert.equal(postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' })).codigo, 'login');
  const passe = ctx.emitirPasse_('maria@fiocruz.br', Date.now()).passe;
  assert.equal(postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' }, { passe })).ok, true);
  const linha = abas.Acessos.matriz[abas.Acessos.matriz.length - 1];
  assert.deepEqual([linha[1], linha[2], linha[3]], ['maria@fiocruz.br', 'Apresentação executiva', 'Edital: Climate and Health']);
});

// ---------------- montagem no navegador ----------------

function carregarPptxGenJS() {
  const ctx = vm.createContext({
    navigator: { userAgent: 'node' }, console, setTimeout, clearTimeout, setImmediate, Promise, Uint8Array, ArrayBuffer,
    Blob: global.Blob, TextEncoder, TextDecoder, atob: global.atob, btoa: global.btoa, URL
  });
  ctx.window = ctx; ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'lib', 'pptxgen.bundle.js'), 'utf8'), ctx);
  return ctx.PptxGenJS;
}

function arquivosDoZip(bytes) {
  // Lê o diretório central do zip (mesma técnica do leitor de DOCX da página).
  const b = Buffer.from(bytes);
  let fim = b.length - 22;
  while (fim >= 0 && b.readUInt32LE(fim) !== 0x06054b50) fim--;
  const total = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  const nomes = [];
  for (let i = 0; i < total; i++) {
    const n = b.readUInt16LE(p + 28), x = b.readUInt16LE(p + 30), c = b.readUInt16LE(p + 32);
    nomes.push(b.toString('utf8', p + 46, p + 46 + n));
    p += 46 + n + x + c;
  }
  return nomes;
}

test('montar(): 9 slides com anotações e fotos; nome de arquivo seguro', async () => {
  const A = require('../docs/apresentacao.js');
  const PptxGenJS = carregarPptxGenJS();
  const imagem = { tipo_mime: 'image/png', base64: fs.readFileSync(path.join(DOCS, 'img', 'logo-fiocruz-branco.png')).toString('base64'), credito: 'Foto: X / Fiocruz Imagens', titulo: 't' };
  const dem = demanda();
  const icones = {};
  for (const k of A.iconesUsados(MOCK.slides)) icones[k] = fs.readFileSync(path.join(DOCS, 'img', 'icones', k + '.png')).toString('base64');
  assert.ok(icones.dados && icones.parceria, 'ícones da IA e fixos');
  const pres = A.montar(PptxGenJS, { idioma: 'Inglês', demanda: dem, alvo: MOCK.alvo, slides: MOCK.slides, imagens: [imagem], logo: imagem.base64, icones });
  const bytes = await pres.write({ outputType: 'uint8array' });
  const nomes = arquivosDoZip(bytes);
  assert.equal(nomes.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 9);
  assert.equal(nomes.filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length, 9);
  assert.ok(nomes.some(n => n.startsWith('ppt/media/')));
  assert.equal(A.nomeArquivo('Chamada contínua: clima & saúde!'), 'Apresentacao_executiva_Chamada_continua_clima_saude.pptx');
  assert.equal(A.nomeArquivo(''), 'Apresentacao_executiva_Fioconecta.pptx');
});

test('mock da apresentação segue o formato do servidor', () => {
  const n = AP.normalizarApresentacao(MOCK.slides, []);
  assert.equal(n.ok, true);
  assert.deepEqual(Object.keys(MOCK.slides).sort(), Object.keys(n.dados).sort());
  assert.deepEqual(Object.keys(MOCK).sort(), ['alvo', 'idioma', 'imagens', 'ok', 'slides', 'versao']);
});

test('index.html carrega a biblioteca e o montador antes do app.js', () => {
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  const pos = (s) => html.indexOf(s);
  assert.ok(pos('lib/pptxgen.bundle.js') > 0 && pos('lib/pptxgen.bundle.js') < pos('apresentacao.js') && pos('apresentacao.js') < pos('app.js?'));
  assert.ok(fs.existsSync(path.join(DOCS, 'lib', 'LICENCAS.txt')));
  const lib = fs.readFileSync(path.join(DOCS, 'lib', 'pptxgen.bundle.js'), 'utf8');
  assert.ok(!/\beval\(|new Function\(/.test(lib), 'a política de segurança da página não permite eval');
});

test('testarAcervo() (editor) mostra candidatos e assuntos frequentes', () => {
  // DEMANDA_EXEMPLO_ tem 3 áreas → 6 buscas; depois, 3 páginas da amostra de assuntos.
  const { ctx, logs } = criarContexto(montarPlanilha(), [{ codigo: 200, corpo: BUSCA }, ...BUSCAS_VAZIAS, ...BUSCAS_VAZIAS.slice(0, 2),
    { codigo: 200, corpo: BUSCA }, { codigo: 404, corpo: '' }]);
  ctx.testarAcervo();
  const log = logs.join('\n');
  assert.match(log, /Termos \(áreas Arboviroses e vetores, Clima e saúde, Vigilância em saúde\): Aedes aegypti \| mudanças climáticas \| vigilância em saúde/);
  assert.match(log, /candidatos: 2/);
  assert.match(log, /Assuntos mais frequentes.*dengue \(3\)/);
});

test('dimensoesDaImagem: lê largura e altura de PNG e JPEG (para recortar a foto sem esticar)', () => {
  const A = require('../docs/apresentacao.js');
  const png = fs.readFileSync(path.join(DOCS, 'img', 'logo-fiocruz-branco.png'));
  assert.deepEqual(A.dimensoesDaImagem(png), { w: 600, h: 169 });
  // JPEG mínimo: SOI, APP0 curto, SOF0 com altura 300 e largura 500.
  const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x2C, 0x01, 0xF4, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(A.dimensoesDaImagem(jpeg), { w: 500, h: 300 });
  assert.equal(A.dimensoesDaImagem(Buffer.from('não é imagem')), null);
});

test('ajustarTexto: maior fonte que cabe; corta com "…" quando nem o mínimo cabe', () => {
  const A = require('../docs/apresentacao.js');
  const curto = A.ajustarTexto('Municípios remotos', 6, 1, { max: 36, min: 20, negrito: true });
  assert.equal(curto.tamanho, 36);
  assert.equal(curto.cortado, false);
  const medio = A.ajustarTexto('palavra '.repeat(30), 6, 1.2, { max: 36, min: 12 });
  assert.ok(medio.tamanho < 36 && medio.tamanho >= 12 && !medio.cortado);
  assert.ok(medio.altura <= 1.2);
  const longo = A.ajustarTexto('palavra '.repeat(300), 4, 1, { max: 20, min: 12 });
  assert.equal(longo.cortado, true);
  assert.equal(longo.tamanho, 12);
  assert.ok(longo.texto.endsWith('…'));
  assert.ok(A.quebrarLinhas(longo.texto, 12, 4).length <= Math.floor(1 / (12 * 1.18 / 72)));
  assert.equal(A.ajustarTexto('x', 4, 1, { max: 80, min: 40, maxLinhas: 1 }).linhas, 1);
  // Largura: maiúsculas e negrito ocupam mais; acentos medem como a letra base.
  assert.ok(A.larguraTexto('MMMM', 20, false) > A.larguraTexto('iiii', 20, false));
  assert.ok(A.larguraTexto('abc', 20, true) > A.larguraTexto('abc', 20, false));
  assert.equal(A.larguraTexto('ção', 20), A.larguraTexto('cao', 20));
});

test('montar(): textos cortados vão inteiros para as anotações; resposta no formato antigo ainda monta', async () => {
  const A = require('../docs/apresentacao.js');
  const PptxGenJS = carregarPptxGenJS();
  const longo = 'Sete estágios de financiamento com valores em várias moedas. '.repeat(30);
  const pres = A.montar(PptxGenJS, { idioma: 'Português', demanda: demanda(), alvo: Object.assign({}, MOCK.alvo, { detalhe: longo }), slides: MOCK.slides, imagens: [] });
  const bytes = Buffer.from(await pres.write({ outputType: 'uint8array' }));
  assert.ok(bytes.includes(Buffer.from('Texto completo (cortado no slide):')), 'anotação com o texto completo');

  const antigo = JSON.parse(JSON.stringify(MOCK.slides));
  antigo.problema = { titulo: 'P', texto: 't', destaque_numero: '25 municípios', destaque_rotulo: 'fora da fase 1' };
  antigo.proposta.objetivos = ['a', 'b', 'c'];
  antigo.resultados.itens = [{ rotulo: 'r', texto: 't' }];
  const atual = A.slidesNoFormatoAtual(antigo);
  assert.deepEqual([atual.problema.layout, atual.problema.numero, atual.problema.unidade], ['numero', '25', 'municípios']);
  assert.equal(atual.proposta.layout, 'colunas');
  assert.equal(atual.proposta.objetivos[0].texto, 'a');
  assert.equal(atual.resultados.layout, 'cartoes');
  const p2 = A.montar(PptxGenJS, { idioma: 'Português', demanda: demanda(), alvo: MOCK.alvo, slides: antigo, imagens: [] });
  assert.ok((await p2.write({ outputType: 'uint8array' })).length > 1000);
  assert.deepEqual(A.iconesUsados({ proposta: { objetivos: [{ icone: '../segredo', texto: 'x' }] } }), ['parceria', 'saude'], 'só chaves do catálogo');
});

test('apresentação: API recusa o schema (HTTP 400) → repete sem saída estruturada', () => {
  const { ctx, requisicoes } = criarContexto(montarPlanilha(), [...BUSCAS_VAZIAS, { codigo: 200, corpo: [] },
    { codigo: 400, corpo: { type: 'error', error: { type: 'invalid_request_error', message: 'Schema is too complex' } } },
    respostaClaude(SLIDES_IA)]);
  const r = postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' }));
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  assert.ok(requisicoes[4].corpo.output_config.format, '1ª chamada com schema');
  assert.ok(!requisicoes[5].corpo.output_config.format, '2ª chamada sem schema');
});

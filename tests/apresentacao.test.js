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
  itemAcervo(2, 'Paisagem da Amazônia', ['Amazônia', 'rio']),
  itemAcervo(3, 'Privado', ['dengue'], { 'o:is_public': false }),
  itemAcervo(4, 'Sem relação', ['arquitetura']),
  itemAcervo(5, 'De outro site', ['dengue'], { thumbnail_display_urls: { large: 'https://malicioso.example/x.jpg' } })
];
const IMG = { codigo: 200, bytes: JPEG, cabecalhos: { 'Content-Type': 'image/jpeg' } };

// ---------------- funções puras ----------------

test('normalizarApresentacao: limites de tamanho, listas e campos obrigatórios', () => {
  const r = AP.normalizarApresentacao(Object.assign({}, SLIDES_IA, {
    tese: 'x'.repeat(500), proposta: Object.assign({}, SLIDES_IA.proposta, { objetivos: ['a', 'b', 'c', 'd', 'e', ''] }),
    termos_imagem: ['um', 'dois', 'três', 'quatro'], extra: 'ignorado'
  }));
  assert.equal(r.ok, true);
  assert.equal(r.dados.tese.length, 220);
  assert.deepEqual(r.dados.proposta.objetivos, ['a', 'b', 'c', 'd']);
  assert.equal(r.dados.termos_imagem.length, 3);
  assert.ok(!('extra' in r.dados));
  assert.equal(AP.normalizarApresentacao({}).ok, false);
  assert.equal(AP.normalizarApresentacao([]).ok, false);
  assert.equal(AP.normalizarApresentacao(Object.assign({}, SLIDES_IA, { tese: '' })).ok, false);
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

// ---------------- servidor ----------------

test('apresentação para um edital: só o edital e a demanda vão para a IA; fotos do acervo com crédito', () => {
  const abas = montarPlanilha();
  const { ctx, requisicoes } = criarContexto(abas, [
    respostaClaude(SLIDES_IA),
    { codigo: 200, corpo: BUSCA }, { codigo: 200, corpo: [] }, { codigo: 200, corpo: [] },
    IMG, IMG
  ]);
  const r = postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' }));
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.alvo.nome, 'Climate and Health');
  assert.equal(r.alvo.financiador, 'Wellcome Trust');
  assert.equal(r.alvo.valores, 'US$ 1M');
  assert.equal(r.slides.titulo_capa, SLIDES_IA.titulo_capa);
  assert.equal(r.imagens.length, 2);
  assert.equal(r.imagens[0].credito, 'Foto: Fulano de Tal / Fiocruz Imagens');
  assert.equal(r.imagens[0].base64, JPEG.toString('base64'));

  const ia = requisicoes[0].corpo;
  const msg = JSON.stringify(ia);
  assert.match(ia.system, /acervo Fiocruz Imagens/);
  for (const proibido of ['Maria Pesquisadora', 'maria@fiocruz.br', 'SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org']) {
    assert.ok(!msg.includes(proibido), proibido);
  }
  // Buscas só no acervo; imagens só do acervo (nunca do item de outro domínio).
  for (const req of requisicoes.slice(1)) assert.ok(req.url.startsWith(ACERVO + '/'), req.url);
  assert.match(requisicoes[1].url, /\/api\/items\?per_page=12&fulltext_search=Aedes%20aegypti$/);
  assert.deepEqual(requisicoes.slice(4).map(q => q.url), [`${ACERVO}/files/large/1.jpg`, `${ACERVO}/files/large/2.jpg`]);
});

test('apresentação para um financiador; vedado ou inexistente não chama a IA', () => {
  let { ctx, requisicoes } = criarContexto(montarPlanilha(), [respostaClaude(SLIDES_IA), { codigo: 500, corpo: 'x' }, { codigo: 500, corpo: 'x' }, { codigo: 500, corpo: 'x' }]);
  const r = postar(ctx, pedido({ tipo: 'financiador', organizacao: 'Wellcome Trust' }));
  assert.equal(r.ok, true);
  assert.equal(r.alvo.tipo, 'financiador');
  assert.equal(r.alvo.detalhe, 'UK');
  assert.deepEqual(r.imagens, [], 'acervo fora do ar: sai sem foto');
  assert.ok(!JSON.stringify(requisicoes[0].corpo).includes('CONTATO-INTERNO'));

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
    respostaClaude(SLIDES_IA),
    { codigo: 200, corpo: BUSCA }, { codigo: 200, corpo: [] }, { codigo: 200, corpo: [] },
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
  for (let i = 0; i < 8; i++) respostas.push(respostaClaude(SLIDES_IA), { codigo: 500, corpo: '' }, { codigo: 500, corpo: '' }, { codigo: 500, corpo: '' });
  const { ctx } = criarContexto(montarPlanilha(), respostas);
  for (let i = 0; i < 8; i++) assert.equal(postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' })).ok, true, 'apresentação ' + (i + 1));
  assert.match(postar(ctx, pedido({ tipo: 'oportunidade', id: 'OPP-0001' })).erro, /limite de 8 apresentações/);
});

test('apresentação com login: e-mail do passe e registro em Acessos', () => {
  const abas = montarPlanilha();
  const { ctx } = criarContexto(abas, [respostaClaude(SLIDES_IA), { codigo: 500, corpo: '' }, { codigo: 500, corpo: '' }, { codigo: 500, corpo: '' }],
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
  const pres = A.montar(PptxGenJS, { idioma: 'Inglês', demanda: dem, alvo: MOCK.alvo, slides: MOCK.slides, imagens: [imagem], logo: imagem.base64 });
  const bytes = await pres.write({ outputType: 'uint8array' });
  const nomes = arquivosDoZip(bytes);
  assert.equal(nomes.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 9);
  assert.equal(nomes.filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length, 9);
  assert.ok(nomes.some(n => n.startsWith('ppt/media/')));
  assert.equal(A.nomeArquivo('Chamada contínua: clima & saúde!'), 'Apresentacao_executiva_Chamada_continua_clima_saude.pptx');
  assert.equal(A.nomeArquivo(''), 'Apresentacao_executiva_Fioconecta.pptx');
});

test('mock da apresentação segue o formato do servidor', () => {
  const n = AP.normalizarApresentacao(MOCK.slides);
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

test('testarAcervo() (editor) mostra as imagens encontradas', () => {
  const { ctx, logs } = criarContexto(montarPlanilha(), [{ codigo: 200, corpo: BUSCA }, { codigo: 200, corpo: [] }, { codigo: 200, corpo: [] }, IMG, IMG]);
  ctx.testarAcervo();
  assert.match(logs.join('\n'), /imagens: 2/);
  assert.match(logs.join('\n'), /Aedes aegypti \| Foto: Fulano de Tal \/ Fiocruz Imagens/);
});

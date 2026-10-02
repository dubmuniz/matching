// Testes do frontend (docs/) — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../docs/app.js');
const S = require('../apps-script/Seguranca.gs');

const DOCS = path.join(__dirname, '..', 'docs');

test('listas do formulário iguais às do servidor', () => {
  assert.deepEqual(F.LISTAS.unidades, S.UNIDADES_FIOCRUZ);
  assert.deepEqual(F.LISTAS.areas, S.AREAS_TEMATICAS);
  assert.deepEqual(F.LISTAS.maturidade, S.ESTAGIOS_MATURIDADE);
  assert.deepEqual(F.LISTAS.valorEstimado, S.FAIXAS_VALOR);
  assert.deepEqual(F.LISTAS.horizonte, S.HORIZONTES_INICIO);
  assert.deepEqual(F.LISTAS.idiomas, S.IDIOMAS_SUBMISSAO);
});

function valido(extra = {}) {
  return Object.assign({
    nome: 'Maria', email: 'maria@fiocruz.br', unidade: 'IOC', unidadeOutra: '',
    titulo: 'Projeto X', resumo: 'r'.repeat(100), problema: 'p'.repeat(50), objetivos: 'o'.repeat(50),
    areas: ['Clima e saúde'], abrangencia: 'Brasil', maturidade: 'Ideia inicial', valorEstimado: 'Não sei',
    horizonte: 'Até 6 meses', parceiros: '', idiomas: ['Português'], consentimento: true, site: '', turnstileToken: ''
  }, extra);
}

test('validação do navegador concorda com a do servidor', () => {
  const casos = [
    {}, { nome: 'Ma' }, { nome: '  Mar ' }, { email: 'x@y' }, { email: ' Maria@Fiocruz.br ' },
    { unidade: 'Outra' }, { unidade: 'Outra', unidadeOutra: 'N' }, { unidade: 'Outra', unidadeOutra: 'Núcleo' },
    { titulo: 'a'.repeat(201) }, { resumo: 'r'.repeat(99) }, { resumo: 'r'.repeat(99) + '\r\n' },
    { resumo: ' '.repeat(10) + 'r'.repeat(100) }, { resumo: 'r'.repeat(1501) }, { problema: 'p'.repeat(1000) },
    { areas: [] }, { areas: S.AREAS_TEMATICAS.slice(0, 3) }, { areas: S.AREAS_TEMATICAS.slice(0, 4) },
    { maturidade: '' }, { valorEstimado: 'Muito' }, { parceiros: 'x'.repeat(500) }, { parceiros: 'x'.repeat(501) },
    { idiomas: [] }, { idiomas: ['Alemão'] }, { consentimento: false }
  ];
  for (const extra of casos) {
    const d = valido(extra);
    const navegador = Object.keys(F.validarFormulario(d)).length === 0;
    const servidor = S.validarDemanda(d).ok;
    assert.equal(navegador, servidor, JSON.stringify(extra));
  }
});

test('linkSeguro só aceita http(s)', () => {
  assert.equal(F.linkSeguro('https://example.org/a'), 'https://example.org/a');
  assert.equal(F.linkSeguro('javascript:alert(1)'), '');
  assert.equal(F.linkSeguro('data:text/html,x'), '');
  assert.equal(F.linkSeguro('/relativo'), '');
  assert.equal(F.linkSeguro(''), '');
  assert.equal(F.linkSeguro(null), '');
});

test('app.js nunca usa innerHTML nem equivalentes', () => {
  const codigo = fs.readFileSync(path.join(DOCS, 'app.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // sem comentários
  for (const proibido of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.ok(!codigo.includes(proibido), proibido);
  }
});

test('config.js só tem a URL do web app e a site key pública', () => {
  const codigo = fs.readFileSync(path.join(DOCS, 'config.js'), 'utf8');
  const janela = {};
  require('node:vm').runInNewContext(codigo, { window: janela });
  assert.deepEqual(Object.keys(janela.FIOCONECTA_CONFIG).sort(), ['turnstileSiteKey', 'webAppUrl']);
  assert.ok(!/sk-ant/.test(codigo));
});

test('index.html: todo campo tem label, e todos os ids referenciados existem', () => {
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*\sid="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${m[2]}"`), `campo sem label: ${m[2]}`);
  }
  for (const m of html.matchAll(/aria-(?:describedby|labelledby|controls)="([^"]+)"/g)) {
    for (const id of m[1].split(/\s+/)) assert.ok(ids.has(id), `id inexistente: ${id}`);
  }
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /Content-Security-Policy/);
});

test('mock segue o formato da resposta do servidor', () => {
  const mock = JSON.parse(fs.readFileSync(path.join(DOCS, 'mock', 'resultado-exemplo.json'), 'utf8'));
  assert.equal(mock.ok, true);
  const r = mock.resultado;
  for (const k of ['resumo_demanda', 'lacunas_da_demanda', 'abertas', 'monitorar', 'financiadores', 'vazio', 'mensagem_vazio']) {
    assert.ok(k in r, k);
  }
  const camposOpp = ['tipo', 'id', 'financiador', 'edital', 'nota', 'selo', 'prazo_status', 'prazo_texto', 'valores', 'duracao',
    'por_que_combina', 'lacunas_e_riscos', 'requisitos_criticos', 'proximo_passo', 'criterios', 'integridade',
    'integridade_aviso', 'via_governanca', 'link_edital'];
  [...r.abertas, ...r.monitorar].forEach(c => assert.deepEqual(Object.keys(c).sort(), [...camposOpp].sort()));
  const camposFin = ['tipo', 'organizacao', 'nota', 'selo', 'pais', 'por_que_combina', 'como_abordar', 'integridade',
    'integridade_aviso', 'website'];
  r.financiadores.forEach(c => assert.deepEqual(Object.keys(c).sort(), [...camposFin].sort()));
});

// ---------------- Fase 2A: leitura de arquivos no navegador ----------------

test('tipoDoArquivo', () => {
  assert.equal(F.tipoDoArquivo('Projeto.PDF', ''), 'pdf');
  assert.equal(F.tipoDoArquivo('p.docx', ''), 'docx');
  assert.equal(F.tipoDoArquivo('notas.txt', ''), 'txt');
  assert.equal(F.tipoDoArquivo('x', 'application/pdf'), 'pdf');
  assert.equal(F.tipoDoArquivo('p.doc', 'application/msword'), '');
  assert.equal(F.tipoDoArquivo('virus.exe', ''), '');
});

const TEXTO_ESPERADO = 'Vigilância de arboviroses\nObjetivo: alertas precoces & integração <dados>.\nCélula A\tB';

for (const arquivo of ['exemplo.docx', 'exemplo-sem-compressao.docx']) {
  test('textoDeDocx lê ' + arquivo, async () => {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', arquivo));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    assert.equal(await F.textoDeDocx(ab), TEXTO_ESPERADO);
  });
}

test('textoDeDocx recusa arquivo que não é zip', async () => {
  await assert.rejects(F.textoDeDocx(new TextEncoder().encode('não sou um docx').buffer));
});

test('index.html: área de upload com label, autorização e botão', () => {
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  assert.match(html, /id="arquivo"[^>]*type="file"/);
  assert.match(html, /for="consentimentoArquivo"/);
  assert.match(html, /id="botao-ler-arquivo"/);
});

// Testes do gerador de XLSX (docs/xlsx.js) e das abas da proposta (docs/proposta.js) — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../docs/xlsx.js');
const P = require('../docs/proposta.js');
const F = require('../docs/app.js');
const mock = require('../docs/mock/proposta-exemplo.json');

/** Lê um arquivo (sem compressão) de dentro do zip gerado. */
function lerDoZip(bytes, nome) {
  const e = F.localizarNoZip(bytes, nome);
  assert.ok(e, 'arquivo ausente no zip: ' + nome);
  assert.equal(e.metodo, 0);
  return new TextDecoder().decode(e.dados);
}

test('letraColuna e ref', () => {
  assert.equal(X.letraColuna(0), 'A');
  assert.equal(X.letraColuna(25), 'Z');
  assert.equal(X.letraColuna(26), 'AA');
  assert.equal(X.letraColuna(42), 'AQ');
  assert.equal(X.ref(4, 2), 'C5');
});

test('crc32 confere com o valor de referência', () => {
  assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('nomes de aba: sem caracteres proibidos, até 31 caracteres, sem repetir', () => {
  const usados = {};
  assert.equal(X.nomeDeAbaValido('Orçamento: [ano]/total?', usados), 'Orçamento   ano  total');
  assert.equal(X.nomeDeAbaValido('x'.repeat(40), usados).length, 31);
  assert.equal(X.nomeDeAbaValido('orçamento   ano  total', usados), 'orçamento   ano  total (2)');
});

test('criar: estrutura do pacote, texto escapado, fórmulas e mesclagens', () => {
  const bytes = X.criar([{
    nome: 'Aba 1', colunas: [10, 20], mesclar: ['A1:B1'], congelar: { linhas: 1, colunas: 0 },
    linhas: [[{ v: 'A & <B> "c"', e: 'titulo' }], [{ v: 2, e: 'numero' }, { f: 'A2*3', e: 'numero' }], [{ v: '=SOMA(1)' }]]
  }]);
  for (const parte of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    lerDoZip(bytes, parte);
  }
  const aba = lerDoZip(bytes, 'xl/worksheets/sheet1.xml');
  assert.match(aba, /A &amp; &lt;B&gt; &quot;c&quot;/);
  assert.match(aba, /<c r="B2" s="6"><f>A2\*3<\/f><\/c>/);
  assert.match(aba, /<mergeCell ref="A1:B1"\/>/);
  assert.match(aba, /state="frozen"/);
  // texto que começa com "=" continua texto (inline string), nunca fórmula
  assert.match(aba, /<c r="A3" t="inlineStr"><is><t xml:space="preserve">=SOMA\(1\)<\/t><\/is><\/c>/);
  assert.match(lerDoZip(bytes, 'xl/workbook.xml'), /fullCalcOnLoad="1"/);
});

const DEMANDA = {
  nome: 'Maria Pesquisadora', email: 'maria@fiocruz.br', unidade: 'Outra', unidadeOutra: 'Núcleo X',
  titulo: 'T', resumo: 'R', problema: 'P', objetivos: 'O', areas: ['Clima e saúde'], abrangencia: 'AM',
  maturidade: 'Ideia inicial', valorEstimado: 'Não sei', horizonte: 'Até 6 meses', parceiros: '', idiomas: ['Português']
};

function dados(idioma, extra = {}) {
  return Object.assign({ idioma, geradoEm: '02/10/2026', demanda: DEMANDA, edital: mock.parte1.edital,
    duracao: mock.parte1.duracao, parte1: mock.parte1, parte2: mock.parte2 }, extra);
}

test('proposta: 4 abas no idioma pedido, com opções traduzidas', () => {
  const nomes = { 'Português': 'Orçamento', 'Inglês': 'Budget', 'Espanhol': 'Presupuesto', 'Francês': 'Budget' };
  for (const idioma of Object.keys(nomes)) {
    const abas = P.montarAbasProposta(dados(idioma));
    assert.equal(abas.length, 4);
    assert.equal(abas[2].nome, nomes[idioma]);
  }
  const ficha = JSON.stringify(P.montarAbasProposta(dados('Inglês'))[0].linhas);
  assert.match(ficha, /Climate and health/);
  assert.match(ficha, /Initial idea/);
  assert.match(ficha, /Other: Núcleo X/);
  assert.match(ficha, /maria@fiocruz\.br/);       // fica só no arquivo do próprio pesquisador
});

test('proposta: orçamento com fórmulas de total e colunas por ano', () => {
  const orc = P.montarAbasProposta(dados('Português'))[2];
  const cab = orc.linhas[4].map(c => c.v);
  assert.deepEqual(cab.slice(-3), ['Ano 1 (USD)', 'Ano 2 (USD)', 'Ano 3 (USD)']);     // 36 meses = 3 anos
  assert.equal(orc.linhas[5][5].f, 'D6*E6');
  const n = mock.parte2.orcamento.linhas.length;
  const total = orc.linhas[5 + n];
  assert.equal(total[5].f, 'SUM(F6:F' + (5 + n) + ')');
  assert.equal(total[8].f, 'SUM(I6:I' + (5 + n) + ')');
  assert.ok(orc.linhas.some(l => l[1] && /^SUMIF\(/.test(l[1].f || '')), 'resumo por rubrica com SUMIF');
});

test('proposta: Gantt com barras, marcos e aviso quando a duração é padrão', () => {
  const g = P.montarAbasProposta(dados('Português'))[3];
  const cab = g.linhas[4];
  assert.equal(cab.length, 7 + 36);
  const a11 = g.linhas[5];                        // A1.1: M1–M9, marco em M9
  assert.equal(a11[7].e, 'gantt');               // M1
  assert.equal(a11[7 + 8].v, '◆');               // M9
  assert.equal(a11[7 + 9].e, 'vazioBorda');      // M10
  assert.equal(g.linhas[2].length, 0, 'sem aviso quando a duração vem do edital');

  const padrao = P.montarAbasProposta(dados('Português', { duracao: { meses: 24, origem: 'padrao' } }))[3];
  assert.match(padrao.linhas[2][0].v, /não informa a duração/);
});

test('proposta: arquivo completo é gerado e o nome é seguro', () => {
  const bytes = X.criar(P.montarAbasProposta(dados('Francês')));
  assert.match(lerDoZip(bytes, 'xl/workbook.xml'), /name="Fiche d&apos;identification"|name="Fiche d'identification"/);
  assert.equal(P.nomeArquivoProposta('Chamada: Clima & Saúde / 2026!'), 'Rascunho_proposta_Chamada_Clima_Saude_2026.xlsx');
});

test('outputsDoMarco: um por número de output', () => {
  assert.deepEqual(P.outputsDoMarco(mock.parte1.marco).map(o => o.codigo), ['O1', 'O2', 'O3']);
  assert.deepEqual(P.outputsDoMarco([{ nivel: 'OUTPUT', codigo: '1.1', logica: 'A' }, { nivel: 'OUTPUT', codigo: '1.2', logica: 'A' }]),
    [{ codigo: 'O1', descricao: 'A' }]);
});

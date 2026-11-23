// Filtros da lista de oportunidades (docs/filtros.js): área temática, valor, moeda e via de governança.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../docs/filtros.js');
const S = require('../apps-script/Seguranca.gs');

test('as áreas do filtro são as mesmas do formulário (menos "Outra")', () => {
  assert.deepEqual(Object.keys(F.PALAVRAS_AREAS), S.AREAS_TEMATICAS.filter(a => a !== 'Outra'));
});

test('areasDoEdital: português e inglês, sem acento, início de palavra; "!" exige a palavra inteira', () => {
  const areas = (t) => F.areasDoEdital({ tema: t });
  assert.ok(areas('Vacinação contra o HPV').includes('Vacinas, biofármacos e insumos'));
  assert.ok(areas('Climate change and health').includes('Clima e saúde'));
  assert.ok(areas('Fortalecimento do SUS').includes('Sistemas e políticas de saúde'));
  assert.ok(!areas('Sustentabilidade de cadeias produtivas').includes('Sistemas e políticas de saúde'));
  assert.ok(!areas('Aguardando o resultado').includes('Biodiversidade e ambiente'));
  assert.ok(F.areasDoEdital({ edital: 'Grand Challenges', resumo: 'Maternal and newborn health' }).includes('Saúde materno-infantil'));
  assert.deepEqual(areas(''), []);
});

test('numeroDoTexto: separadores brasileiros e americanos', () => {
  assert.equal(F.numeroDoTexto('1.500.000,00'), 1500000);
  assert.equal(F.numeroDoTexto('2,000,000'), 2000000);
  assert.equal(F.numeroDoTexto('500.000'), 500000);
  assert.equal(F.numeroDoTexto('1.5'), 1.5);
  assert.equal(F.numeroDoTexto('2,5'), 2.5);
  assert.equal(F.numeroDoTexto('150.000.'), 150000);
});

test('valorMaximo e faixaDeValor: maior valor na primeira moeda citada, sem converter', () => {
  const casos = [
    ['Até US$ 500 mil', 'USD', 500000, '100mil-1mi'],
    ['€ 150.000 por projeto', 'EUR', 150000, '100mil-1mi'],
    ['US$ 20 mil a 50 mil', 'USD', 50000, 'ate100mil'],
    ['R$ 1.500.000 (€ 250.000)', 'BRL', 1500000, 'acima1mi'],
    ['Preparation grant: até R$ 275.000,00 (Up to €50,000); Stage 3: até R$ 22.000.000,00 (Up to €4 million)', 'BRL', 22000000, 'acima1mi'],
    ['Up to £2.5m', 'GBP', 2500000, 'acima1mi'],
    ['50,000 USD', 'USD', 50000, 'ate100mil'],
    ['US$ 10 mil para 30 mil pessoas', 'USD', 10000, 'ate100mil']
  ];
  for (const [texto, moeda, valor, faixa] of casos) {
    assert.deepEqual(F.valorMaximo(texto), { moeda, valor }, texto);
    assert.equal(F.faixaDeValor(texto), faixa, texto);
  }
  for (const t of ['', 'a definir', 'Varia conforme a chamada', '36 meses']) {
    assert.equal(F.valorMaximo(t), null, t);
    assert.equal(F.faixaDeValor(t), 'nao_informado');
  }
});

test('viaDoEdital e passaNosFiltros', () => {
  assert.equal(F.viaDoEdital('Orientação institucional'), 'presidencia');
  assert.equal(F.viaDoEdital('Captação direta'), 'unidades');
  assert.equal(F.viaDoEdital(''), 'a_definir');
  const d = F.dadosDeFiltro({ tema: 'Clima e saúde', valores: 'US$ 20 mil a 50 mil', via_governanca: 'Captação direta' });
  assert.deepEqual(d, { areas: ['Clima e saúde'], faixa: 'ate100mil', moeda: 'USD', via: 'unidades' });
  assert.equal(F.passaNosFiltros(d, { area: '', valor: '', moeda: '', via: '' }), true);
  assert.equal(F.passaNosFiltros(d, { area: 'Clima e saúde', valor: 'ate100mil', moeda: 'USD', via: 'unidades' }), true);
  assert.equal(F.passaNosFiltros(d, { area: 'Diagnósticos', valor: '', moeda: '', via: '' }), false);
  assert.equal(F.passaNosFiltros(d, { area: '', valor: 'acima1mi', moeda: '', via: '' }), false);
  assert.equal(F.passaNosFiltros(d, { area: '', valor: '', moeda: 'EUR', via: '' }), false);
  assert.equal(F.passaNosFiltros(F.dadosDeFiltro({ valores: 'a definir' }), { area: '', valor: '', moeda: 'sem', via: '' }), true);
});

test('opcoesDosFiltros: só o que existe na lista, com contagem', () => {
  const dados = [
    { tema: 'Clima e saúde', valores: 'US$ 1 milhão', via_governanca: 'Captação direta' },
    { tema: 'Climate and health', valores: '€ 150.000', via_governanca: 'Orientação institucional' },
    { tema: 'Vacinas', valores: '', via_governanca: '' }
  ].map(F.dadosDeFiltro);
  const op = F.opcoesDosFiltros(dados);
  assert.deepEqual(op.areas.map(o => [o.valor, o.total]), [['Vacinas, biofármacos e insumos', 1], ['Clima e saúde', 2]]);
  assert.deepEqual(op.valores.map(o => [o.valor, o.total]), [['100mil-1mi', 2], ['nao_informado', 1]]);
  assert.deepEqual(op.moedas.map(o => o.valor), ['USD', 'EUR', 'sem']);
  assert.deepEqual(op.vias.map(o => o.valor), ['presidencia', 'unidades', 'a_definir']);
});

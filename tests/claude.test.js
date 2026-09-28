// Testes da validação da resposta da IA (Claude.gs) — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { textoDaRespostaClaude, extrairJsonMatching, validarRespostaMatching } = require('../apps-script/Claude.gs');

test('textoDaRespostaClaude ignora blocos thinking', () => {
  assert.equal(textoDaRespostaClaude({
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }]
  }), '{"a":1}');
  assert.equal(textoDaRespostaClaude({}), '');
});

test('extrairJsonMatching remove cercas de código e texto ao redor', () => {
  assert.deepEqual(extrairJsonMatching('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extrairJsonMatching('Aqui está: {"a":1} fim'), { a: 1 });
  assert.throws(() => extrairJsonMatching('nada'));
});

const IDS = ['OPP-0001', 'OPP-0002'];
const ORGS = ['Wellcome Trust', 'Unitaid'];

function resposta(parcial) {
  return JSON.stringify(Object.assign({
    resumo_demanda: 'Resumo.',
    lacunas_da_demanda: [],
    oportunidades: [],
    financiadores: []
  }, parcial));
}

test('rejeita respostas fora do formato', () => {
  assert.equal(validarRespostaMatching('não é json', IDS, ORGS).ok, false);
  assert.equal(validarRespostaMatching('[]', IDS, ORGS).ok, false);
  assert.equal(validarRespostaMatching('{"resumo_demanda":"x"}', IDS, ORGS).ok, false);
  assert.equal(validarRespostaMatching(resposta({}), IDS, ORGS).ok, true);
});

test('descarta ids e organizações que não foram enviados, e repetidos', () => {
  const r = validarRespostaMatching(resposta({
    oportunidades: [
      { id: 'OPP-0001', nota: 50 },
      { id: 'OPP-0001', nota: 60 },
      { id: 'OPP-0003', nota: 99 },
      { id: 'opp-0002', nota: 70 },
      { nota: 80 }
    ],
    financiadores: [
      { organizacao: 'Wellcome Trust', nota: 70 },
      { organizacao: 'Wellcome', nota: 90 },
      { organizacao: 'Fundação Inventada', nota: 95 }
    ]
  }), IDS, ORGS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados.oportunidades.map(o => o.id), ['OPP-0001']);
  assert.deepEqual(r.dados.financiadores.map(f => f.organizacao), ['Wellcome Trust']);
  assert.equal(r.descartados.length, 6);
});

test('limita notas, critérios, listas e textos', () => {
  const longo = 'x'.repeat(1000);
  const r = validarRespostaMatching(resposta({
    resumo_demanda: longo,
    lacunas_da_demanda: ['a', 'b', 'c', 'd', 'e', ''],
    oportunidades: [{
      id: 'OPP-0002', nota: 150.4,
      criterios: { tematica: 55, elegibilidade: -3, porte: '12', maturidade: 7.6, viabilidade: 'x' },
      por_que_combina: longo, lacunas_e_riscos: null, requisitos_criticos: ['r1', longo], proximo_passo: 42
    }, { id: 'OPP-0001', nota: 'abc' }],
    financiadores: [{ organizacao: 'Unitaid', nota: -5, por_que_combina: 'ok', como_abordar: 'ok' }]
  }), IDS, ORGS);

  const [o1, o2] = r.dados.oportunidades;
  assert.equal(o1.nota, 100);
  assert.deepEqual(o1.criterios, { tematica: 40, elegibilidade: 0, porte: 12, maturidade: 8, viabilidade: 0 });
  assert.equal(o1.por_que_combina.length, 400);
  assert.equal(o1.lacunas_e_riscos, '');
  assert.equal(o1.requisitos_criticos[1].length, 400);
  assert.equal(o1.proximo_passo, '42');
  assert.equal(o2.nota, 0);
  assert.equal(r.dados.resumo_demanda.length, 400);
  assert.deepEqual(r.dados.lacunas_da_demanda, ['a', 'b', 'c', 'd']);
  assert.equal(r.dados.financiadores[0].nota, 0);
});

test('ordena por nota e limita a 12 oportunidades e 6 financiadores', () => {
  const ids = Array.from({ length: 20 }, (_, i) => 'OPP-' + i);
  const orgs = Array.from({ length: 10 }, (_, i) => 'Org ' + i);
  const r = validarRespostaMatching(resposta({
    oportunidades: ids.map((id, i) => ({ id, nota: i * 3 })),
    financiadores: orgs.map((organizacao, i) => ({ organizacao, nota: 60 + i }))
  }), ids, orgs);
  assert.equal(r.dados.oportunidades.length, 12);
  assert.equal(r.dados.oportunidades[0].id, 'OPP-19');
  assert.equal(r.dados.financiadores.length, 6);
  assert.equal(r.dados.financiadores[0].organizacao, 'Org 9');
});

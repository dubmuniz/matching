// Testes de Resultados.gs — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../apps-script/Resultados.gs');

function opp(id, status, extra = {}) {
  return Object.assign({
    id, financiador: 'Fin ' + id, edital: 'Edital ' + id, valores: 'US$ 1', duracao: '12 meses',
    prazo: { status, texto: 'texto ' + status }, integridade: 'Permitido', via: 'A definir', linkEdital: 'https://x.org/' + id,
    linha: 99, sinergia: 'interno?'
  }, extra);
}
function item(id, nota) {
  return { id, nota, criterios: {}, por_que_combina: 'p', lacunas_e_riscos: 'l', requisitos_criticos: [], proximo_passo: 'n' };
}

test('selos de nota', () => {
  assert.equal(R.seloAderencia(75), 'Alta aderência');
  assert.equal(R.seloAderencia(74), 'Boa aderência');
  assert.equal(R.seloAderencia(60), 'Boa aderência');
  assert.equal(R.seloAderencia(59), 'Aderência parcial');
  assert.equal(R.seloAderencia(40), 'Aderência parcial');
});

test('distribui nas seções com as notas mínimas e os limites', () => {
  const opps = [
    opp('A', 'aberto'), opp('B', 'prazo_curto'), opp('C', 'continuo'), opp('D', 'encerrado'),
    opp('E', 'encerrado'), opp('F', 'a_confirmar'), opp('G', 'ciclos')
  ];
  const r = R.montarResultado({
    resumo_demanda: 'r', lacunas_da_demanda: ['x'],
    oportunidades: [item('A', 70), item('B', 70), item('C', 39), item('D', 65), item('E', 59), item('F', 40), item('G', 90)],
    financiadores: [{ organizacao: 'Org1', nota: 59, por_que_combina: '', como_abordar: '' },
      { organizacao: 'Org2', nota: 80, por_que_combina: 'p', como_abordar: 'c' }]
  }, opps, [{ organizacao: 'Org1', integridade: 'Permitido' }, { organizacao: 'Org2', pais: 'UK', integridade: 'Não avaliado', website: 'https://o.org' }]);

  assert.deepEqual(r.abertas.map(c => c.id), ['G', 'B', 'A', 'F']);   // empate 70: prazo_curto primeiro
  assert.deepEqual(r.monitorar.map(c => c.id), ['D']);
  assert.deepEqual(r.financiadores.map(c => c.organizacao), ['Org2']);
  assert.equal(r.financiadores[0].integridade_aviso, true);
  assert.equal(r.abertas[0].integridade_aviso, false);
  assert.equal(r.vazio, false);

  const card = r.abertas[0];
  assert.equal(card.prazo_texto, 'texto ciclos');
  assert.equal(card.link_edital, 'https://x.org/G');
  assert.ok(!('linha' in card) && !('sinergia' in card), 'só campos do card');
});

test('limites de cards por seção', () => {
  const opps = Array.from({ length: 20 }, (_, i) => opp('O' + i, i < 10 ? 'aberto' : 'encerrado'));
  const r = R.montarResultado({
    oportunidades: opps.map((o, i) => item(o.id, 60 + i)),
    financiadores: Array.from({ length: 8 }, (_, i) => ({ organizacao: 'G' + i, nota: 70 }))
  }, opps, Array.from({ length: 8 }, (_, i) => ({ organizacao: 'G' + i, integridade: 'Permitido' })));
  assert.equal(r.abertas.length, 8);
  assert.equal(r.monitorar.length, 5);
  assert.equal(r.financiadores.length, 5);
});

test('vedados nunca viram card, mesmo que a IA os devolva', () => {
  const r = R.montarResultado({
    oportunidades: [item('V', 95)],
    financiadores: [{ organizacao: 'Ved', nota: 95 }]
  }, [opp('V', 'aberto', { integridade: 'Vedado' })], [{ organizacao: 'Ved', integridade: 'Vedado' }]);
  assert.equal(r.vazio, true);
  assert.equal(r.mensagem_vazio, R.MENSAGEM_SEM_RESULTADOS);
});

test('top 3 em texto', () => {
  const opps = [opp('A', 'aberto'), opp('B', 'encerrado')];
  const r = R.montarResultado({
    oportunidades: [item('A', 50), item('B', 80)],
    financiadores: [{ organizacao: 'Org', nota: 65 }]
  }, opps, [{ organizacao: 'Org', integridade: 'Permitido' }]);
  assert.equal(R.top3Texto(r), '1. [80] Edital B — Fin B (B)\n2. [65] Org\n3. [50] Edital A — Fin A (A)');
  assert.equal(R.top3Texto(R.montarResultado({ oportunidades: [], financiadores: [] }, [], [])), 'Sem correspondências fortes');
});

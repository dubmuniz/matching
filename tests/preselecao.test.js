// Testes de Preselecao.gs — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenizarPreselecao, preselecionarCandidatos } = require('../apps-script/Preselecao.gs');

test('tokenização: minúsculas, sem acentos, sem stopwords em PT/EN/ES/FR', () => {
  assert.deepEqual(tokenizarPreselecao('A Vigilância das Arboviroses e o Clima'), ['vigilancia', 'arbovirose', 'clima']);
  assert.deepEqual(tokenizarPreselecao('The impact of climate on health'), ['impact', 'climate', 'health']);
  assert.deepEqual(tokenizarPreselecao('La salud y el clima'), ['salud', 'clima']);
  assert.deepEqual(tokenizarPreselecao('La santé et le climat 2026'), ['sante', 'climat']);
});

const DEMANDA = {
  titulo: 'Vigilância de arboviroses',
  resumo: 'Dengue e clima na Amazônia',
  objetivos: 'Alertas precoces',
  areas: ['Clima e saúde']
};

function candidatos(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'OPP-' + i, tema: 'Tema genérico', resumo: 'Sem relação' }));
}

test('com 40 ou menos candidatos, nada muda', () => {
  const lista = candidatos(40);
  assert.deepEqual(preselecionarCandidatos(DEMANDA, lista, 40), lista);
});

test('com mais de 40, fica com os 40 de maior sobreposição', () => {
  const lista = candidatos(50);
  lista[45] = { id: 'OPP-45', tema: 'Clima e saúde', resumo: 'Dengue, arboviroses e vigilância na Amazônia' };
  lista[48] = { id: 'OPP-48', tema: 'Clima', resumo: 'Health' };
  const r = preselecionarCandidatos(DEMANDA, lista, 40);
  assert.equal(r.length, 40);
  assert.equal(r[0].id, 'OPP-45');
  assert.equal(r[1].id, 'OPP-48');
  assert.equal(r[2].id, 'OPP-0'); // empates mantêm a ordem da planilha
  assert.ok(!r.some(o => o.id === 'OPP-49'));
});

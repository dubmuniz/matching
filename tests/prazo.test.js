// Testes de classificarPrazo() — rodar com: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { classificarPrazo } = require('../apps-script/Prazo.gs');

// "Hoje" fixo: 25/09/2026 (setembro de 2026, como no briefing). MIN_DIAS_PRAZO padrão = 21.
const HOJE = '2026-09-25';
const c = (v, min) => classificarPrazo(v, HOJE, min === undefined ? 21 : min);

test('casos reais da planilha (coluna E de Oportunidades)', () => {
  // E2: data nativa 01/03/2026 (já convertida para texto pelo Planilha.gs)
  assert.deepEqual(c('01/03/2026'), {
    status: 'encerrado',
    texto: 'Último prazo conhecido: 01/03/2026 — verifique o próximo ciclo',
    data: '01/03/2026'
  });
  // E6: data que já passou
  assert.equal(c('10/12/2025').status, 'encerrado');
  // E4: texto com ponto final
  assert.deepEqual(c('Não encontrado.'), { status: 'a_confirmar', texto: 'Prazo a confirmar', data: null });
  // E5: vários prazos por ano, em inglês
  assert.deepEqual(c('March 1 • July 1 • October 1'), {
    status: 'ciclos',
    texto: 'Ciclos recorrentes: March 1 • July 1 • October 1',
    data: null
  });
});

test('exemplos da seção 4.4 do briefing', () => {
  assert.equal(c('Aplicações contínuas').status, 'continuo');
  assert.equal(c('Aplicações contínuas').texto, 'Fluxo contínuo');
  const unitaid = c('09/04/2026 (12:00 CET) (Unitaid)');
  assert.equal(unitaid.status, 'encerrado');
  assert.equal(unitaid.data, '09/04/2026');
});

test('limites de aberto / prazo curto / encerrado', () => {
  assert.equal(c('25/09/2026').status, 'prazo_curto');             // hoje
  assert.equal(c('24/09/2026').status, 'encerrado');               // ontem
  assert.equal(c('15/10/2026').status, 'prazo_curto');             // hoje + 20
  assert.equal(c('16/10/2026').status, 'aberto');                  // hoje + 21
  assert.equal(c('16/10/2026').texto, 'Prazo: 16/10/2026');
  assert.equal(c('30/09/2026').texto, 'Prazo curto: 30/09/2026');
  assert.equal(c('30/09/2026', 0).status, 'aberto');               // MIN_DIAS_PRAZO = 0
  assert.equal(c('30/09/2026', 10).status, 'prazo_curto');
});

test('data nativa (Date) e "hoje" como Date', () => {
  assert.equal(c(new Date(2026, 11, 31)).status, 'aberto');
  assert.equal(c(new Date(2026, 0, 31)).status, 'encerrado');
  assert.equal(classificarPrazo('01/10/2026', new Date(2026, 8, 25), 21).status, 'prazo_curto');
  assert.equal(c(new Date('inválida')).status, 'a_confirmar');
});

test('formatos gravados pelo script existente e variações de data', () => {
  assert.equal(c('01/03/2027').status, 'aberto');                   // DD/MM/AAAA em texto
  assert.equal(c('1/3/2027').data, '01/03/2027');                   // sem zeros à esquerda
  assert.equal(c('Deadline: 31.12.2026').data, '31/12/2026');
  assert.equal(c('2026-12-31').data, '31/12/2026');                 // ISO
  assert.equal(c('March 1, 2027').data, '01/03/2027');              // por extenso com ano
  assert.equal(c('1 de março de 2027').data, '01/03/2027');
  assert.equal(c('15 octobre 2027').data, '15/10/2027');
  assert.equal(c('31/02/2027 ou 15/03/2027').data, '15/03/2027');   // ignora data inválida
});

test('textos de fluxo contínuo', () => {
  for (const v of ['Fluxo contínuo', 'Rolling basis', 'Open call', 'Ongoing', 'Continuous submissions']) {
    assert.equal(c(v).status, 'continuo', v);
  }
});

test('ciclos recorrentes', () => {
  assert.equal(c('Anual, em março').status, 'ciclos');
  assert.equal(c('Feb 15 and Aug 15').status, 'ciclos');
  assert.equal(c('1/3 • 1/7 • 1/10').status, 'ciclos');
  assert.equal(c('Chamadas em mayo y noviembre').status, 'ciclos');
});

test('não confunde palavras comuns com meses', () => {
  assert.equal(c('Applicants may apply later').status, 'a_confirmar');
  assert.equal(c('Verificar').status, 'a_confirmar');
  assert.equal(c('A definir pelo financiador').status, 'a_confirmar');
});

test('valores vazios', () => {
  for (const v of ['', '   ', null, undefined]) {
    assert.equal(c(v).status, 'a_confirmar');
  }
});

test('valida "hoje"', () => {
  assert.throws(() => classificarPrazo('01/01/2027', '25/09/2026', 21));
});

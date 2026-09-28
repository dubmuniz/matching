// Testes das funções puras de Seguranca.gs — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../apps-script/Seguranca.gs');

function valido(extra = {}) {
  return Object.assign({
    nome: 'Maria', email: 'maria@fiocruz.br', unidade: 'IOC', unidadeOutra: '',
    titulo: 'Projeto X', resumo: 'r'.repeat(100), problema: 'p'.repeat(50), objetivos: 'o'.repeat(50),
    areas: ['Clima e saúde'], abrangencia: 'Brasil', maturidade: 'Ideia inicial', valorEstimado: 'Não sei',
    horizonte: 'Até 6 meses', parceiros: '', idiomas: ['Português'], consentimento: true, site: '', turnstileToken: ''
  }, extra);
}

test('aceita um envio válido e limpa os textos', () => {
  const r = S.validarDemanda(valido({ nome: '  Maria\tda  Silva ', email: ' Maria@Fiocruz.BR ', resumo: 'linha 1\r\nlinha 2 ' + 'r'.repeat(100) }));
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.demanda.nome, 'Maria da Silva');
  assert.equal(r.demanda.email, 'maria@fiocruz.br');
  assert.match(r.demanda.resumo, /^linha 1\nlinha 2 /);
  assert.ok(!('site' in r.demanda) && !('turnstileToken' in r.demanda) && !('consentimento' in r.demanda));
});

test('limites de tamanho do briefing', () => {
  const erro = (extra) => S.validarDemanda(valido(extra)).erros;
  assert.ok(erro({ nome: 'Ma' }).nome);
  assert.ok(erro({ nome: 'x'.repeat(121) }).nome);
  assert.ok(erro({ titulo: 'abcd' }).titulo);
  assert.ok(erro({ titulo: 'x'.repeat(201) }).titulo);
  assert.ok(erro({ resumo: 'x'.repeat(99) }).resumo);
  assert.ok(erro({ resumo: 'x'.repeat(1501) }).resumo);
  assert.ok(erro({ problema: 'x'.repeat(49) }).problema);
  assert.ok(erro({ objetivos: 'x'.repeat(1001) }).objetivos);
  assert.ok(erro({ abrangencia: 'BR' }).abrangencia);
  assert.ok(erro({ parceiros: 'x'.repeat(501) }).parceiros);
  assert.equal(S.validarDemanda(valido({ resumo: 'x'.repeat(1500), parceiros: 'x'.repeat(500) })).ok, true);
});

test('listas fechadas, múltipla escolha e tipos', () => {
  const erro = (extra) => S.validarDemanda(valido(extra)).erros;
  assert.ok(erro({ unidade: 'IOC ' }).unidade);
  assert.ok(erro({ maturidade: 'Outro' }).maturidade);
  assert.ok(erro({ areas: [] }).areas);
  assert.ok(erro({ areas: S.AREAS_TEMATICAS.slice(0, 4) }).areas);
  assert.ok(erro({ areas: ['Inventada'] }).areas);
  assert.ok(erro({ areas: 'Clima e saúde' }).areas);
  assert.ok(erro({ idiomas: [] }).idiomas);
  assert.ok(erro({ titulo: 123 }).titulo);
  assert.ok(erro({ consentimento: 'true' }).consentimento);
  assert.deepEqual(S.validarDemanda(valido({ areas: ['Clima e saúde', 'Clima e saúde'] })).demanda.areas, ['Clima e saúde']);
});

test('unidade "Outra" exige o nome; outras unidades descartam o texto extra', () => {
  assert.ok(S.validarDemanda(valido({ unidade: 'Outra', unidadeOutra: '' })).erros.unidadeOutra);
  assert.equal(S.validarDemanda(valido({ unidade: 'Outra', unidadeOutra: 'Núcleo X' })).demanda.unidadeOutra, 'Núcleo X');
  assert.equal(S.validarDemanda(valido({ unidadeOutra: 'ignorado' })).demanda.unidadeOutra, '');
});

test('rejeita campos desconhecidos e corpos que não são objeto', () => {
  assert.ok(S.validarDemanda(valido({ __proto__x: 1 })).erros._geral);
  assert.equal(S.validarDemanda(null).ok, false);
  assert.equal(S.validarDemanda([]).ok, false);
  assert.equal(S.validarDemanda('texto').ok, false);
});

test('e-mail', () => {
  for (const e of ['a@b', 'sem-arroba', 'a@@b.com', 'a b@c.com', 'a@b..com', '']) {
    assert.ok(S.validarDemanda(valido({ email: e })).erros.email, e);
  }
  assert.equal(S.validarDemanda(valido({ email: 'nome.sobrenome+tag@ensp.fiocruz.br' })).ok, true);
});

test('honeypot', () => {
  assert.equal(S.honeypotPreenchido(valido()), false);
  assert.equal(S.honeypotPreenchido(valido({ site: ' ' })), false);
  assert.equal(S.honeypotPreenchido(valido({ site: 'x' })), true);
});

test('janela de limite de taxa', () => {
  const agora = 1_000_000_000;
  const hora = 3600_000;
  let r = S.aplicarJanelaDeLimite([], agora, hora, 2);
  assert.deepEqual(r, { permitido: true, registros: [agora] });
  r = S.aplicarJanelaDeLimite([agora - 10, agora - 20], agora, hora, 2);
  assert.equal(r.permitido, false);
  r = S.aplicarJanelaDeLimite([agora - hora - 1, agora - 20], agora, hora, 2);   // um já venceu
  assert.equal(r.permitido, true);
  assert.equal(r.registros.length, 2);
  assert.equal(S.aplicarJanelaDeLimite('lixo', agora, hora, 2).permitido, true);
});

test('cópia só para domínio exato', () => {
  assert.equal(S.dominioPermitidoParaCopia('a@fiocruz.br', ['fiocruz.br']), true);
  assert.equal(S.dominioPermitidoParaCopia('a@FIOCRUZ.BR', ['fiocruz.br']), true);
  assert.equal(S.dominioPermitidoParaCopia('a@ensp.fiocruz.br', ['fiocruz.br']), false);
  assert.equal(S.dominioPermitidoParaCopia('a@fiocruz.br.evil.com', ['fiocruz.br']), false);
  assert.equal(S.dominioPermitidoParaCopia('a@b@fiocruz.br', ['fiocruz.br']), false);
  assert.equal(S.dominioPermitidoParaCopia('a@fiocruz.br', []), false);
});

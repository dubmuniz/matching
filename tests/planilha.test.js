// Testes das funções puras de Planilha.gs — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../apps-script/Planilha.gs');

test('normalizarNomeOrganizacao: acentos, pontuação e palavras ignoradas', () => {
  const n = P.normalizarNomeOrganizacao;
  assert.equal(n('The Bill & Melinda Gates Foundation'), 'bill melinda gates');
  assert.equal(n('Fundação Bill & Melinda Gates'), 'bill melinda gates');
  assert.equal(n('Fondation Mérieux'), 'merieux');
  assert.equal(n('Novo Nordisk Fonden'), 'novo nordisk');
  assert.equal(n('  Wellcome   Trust. '), 'wellcome trust');
  assert.equal(n('Unitaid'), n('UNITAID'));
  assert.equal(n(''), '');
});

test('cabeçalhos: tolera espaços, maiúsculas e acentos', () => {
  const mapa = P.mapearCabecalhos(['Nome do parceiro', ' ID ', 'Via de governança', 'Via de governanca']);
  assert.equal(mapa[P.normalizarCabecalho('ID')], 2);
  assert.equal(mapa[P.normalizarCabecalho('Via de governança')], 3); // repetido: vale o primeiro
  assert.equal(mapa[P.normalizarCabecalho('nome do PARCEIRO')], 1);
});

test('status de integridade e via de governança com padrões', () => {
  assert.deepEqual(P.normalizarIntegridade(''), { valor: 'Não avaliado', desconhecido: false });
  assert.deepEqual(P.normalizarIntegridade('vedado'), { valor: 'Vedado', desconhecido: false });
  assert.deepEqual(P.normalizarIntegridade('Analise reforcada'), { valor: 'Análise reforçada', desconhecido: false });
  assert.deepEqual(P.normalizarIntegridade('talvez'), { valor: 'Não avaliado', desconhecido: true });
  assert.deepEqual(P.normalizarVia(''), { valor: 'A definir', desconhecido: false });
  assert.deepEqual(P.normalizarVia('Captação direta'), { valor: 'Captação direta', desconhecido: false });
});

test('ativo no matching: vazio conta como Sim', () => {
  assert.equal(P.normalizarAtivo('').ativo, true);
  assert.equal(P.normalizarAtivo('Sim').ativo, true);
  assert.equal(P.normalizarAtivo('Não').ativo, false);
  assert.equal(P.normalizarAtivo('nao').ativo, false);
  assert.deepEqual(P.normalizarAtivo('talvez'), { ativo: true, desconhecido: true });
});

test('linkSeguro: só http(s)', () => {
  assert.equal(P.linkSeguro('https://wellcome.org/grants'), 'https://wellcome.org/grants');
  assert.equal(P.linkSeguro('http://example.org'), 'http://example.org');
  assert.equal(P.linkSeguro('www.gatesfoundation.org'), 'https://www.gatesfoundation.org');
  assert.equal(P.linkSeguro('javascript:alert(1)'), '');
  assert.equal(P.linkSeguro('ftp://x.org'), '');
  assert.equal(P.linkSeguro('Ver resumo executivo'), '');
  assert.equal(P.linkSeguro('https://x.org/"onmouseover=1'), '');
  assert.equal(P.linkSeguro(''), '');
});

test('prepararOportunidades: ignora linhas vazias, IDs temporários e duplicados', () => {
  const r = P.prepararOportunidades([
    { linha: 2, financiador: 'Wellcome Trust', edital: 'Climate & Health', id: 'OPP-0001', ativo: '', linkEdital: 'https://wellcome.org' },
    { linha: 3, financiador: '', edital: '', id: '', ativo: '' },
    { linha: 4, financiador: '', edital: 'Edital sem parceiro', id: '', ativo: 'Não', linkEdital: 'Documento interno' },
    { linha: 5, financiador: 'Unitaid', edital: 'Call X', id: 'OPP-0001', ativo: 'Sim' }
  ]);
  assert.equal(r.oportunidades.length, 3);
  assert.deepEqual(r.ignoradas, [3]);
  assert.deepEqual(r.incompletas, [4]);
  assert.deepEqual(r.idsTemporarios, [4]);
  assert.equal(r.oportunidades[1].id, 'LINHA-4');
  assert.equal(r.oportunidades[1].ativo, false);
  assert.deepEqual(r.idsDuplicados, ['OPP-0001']);
  assert.deepEqual(r.linksInvalidos, [4]);
});

test('junção e filtros: sem correspondência herda padrões; vedado e inativo saem', () => {
  const orgs = P.prepararOrganizacoes([
    { linha: 2, organizacao: 'Wellcome Trust', integridade: 'Permitido', via: 'Captação direta', website: 'https://wellcome.org' },
    { linha: 3, organizacao: 'Fundação Exemplo', integridade: 'Vedado', via: '' },
    { linha: 4, organizacao: '', integridade: '' }
  ]).organizacoes;
  assert.equal(orgs.length, 2);

  const opps = P.prepararOportunidades([
    { linha: 2, financiador: 'The Wellcome Trust', edital: 'A', id: 'OPP-0001' },
    { linha: 3, financiador: 'Exemplo Foundation', edital: 'B', id: 'OPP-0002' },
    { linha: 4, financiador: 'Desconhecido', edital: 'C', id: 'OPP-0003' },
    { linha: 5, financiador: 'Wellcome Trust', edital: 'D', id: 'OPP-0004', ativo: 'Não' }
  ]).oportunidades;

  const j = P.juntarOportunidadesOrganizacoes(opps, orgs);
  assert.equal(j.oportunidades[0].integridade, 'Permitido');
  assert.equal(j.oportunidades[0].via, 'Captação direta');
  assert.equal(j.oportunidades[1].integridade, 'Vedado');
  assert.equal(j.oportunidades[2].integridade, 'Não avaliado');
  assert.equal(j.oportunidades[2].via, 'A definir');
  assert.deepEqual(j.semCorrespondencia.map(s => s.id), ['OPP-0003']);

  const f = P.filtrarCandidatos(j.oportunidades);
  assert.deepEqual(f.candidatos.map(o => o.id), ['OPP-0001', 'OPP-0003']);
  assert.deepEqual(f.vedadas, ['OPP-0002']);
  assert.deepEqual(f.inativas, ['OPP-0004']);
});

test('preencherIdsVazios: continua a numeração e pula linhas vazias', () => {
  const r = P.preencherIdsVazios(
    ['OPP-0001', '', 'OPP-0007', '', ''],
    ['A', 'B', 'C', '', 'E'],
    ['x', 'y', 'z', '', '']
  );
  assert.deepEqual(r.novos, [{ indice: 1, id: 'OPP-0008' }, { indice: 4, id: 'OPP-0009' }]);
  assert.deepEqual(P.preencherIdsVazios(['', ''], ['A', 'B'], ['', '']).novos.map(n => n.id), ['OPP-0001', 'OPP-0002']);
});

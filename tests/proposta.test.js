// Testes de Proposta.gs (fase 2B) — rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../apps-script/Proposta.gs');
const { criarContexto, respostaClaude, montarPlanilha, envioValido } = require('./ambiente');

const simples = (x) => JSON.parse(JSON.stringify(x));

test('duracaoEmMeses: formatos da planilha e de editais', () => {
  const d = (t) => P.duracaoEmMeses(t);
  assert.deepEqual(d('6 a 24 meses'), { meses: 24, origem: 'edital' });
  assert.equal(d('até 24 meses').meses, 24);
  assert.equal(d('mín 12 meses; máx 36 meses').meses, 36);
  assert.equal(d('2 years').meses, 24);
  assert.equal(d('Up to 18 months').meses, 18);
  assert.equal(d('36-month project').meses, 36);
  assert.equal(d('3 años').meses, 36);
  assert.equal(d('jusqu’à 4 ans').meses, 48);
  assert.equal(d('10 anos').meses, 60);                       // teto de 60 meses
  assert.deepEqual(d(''), { meses: 24, origem: 'padrao' });
  assert.deepEqual(d('Não informado'), { meses: 24, origem: 'padrao' });
  assert.deepEqual(d('R$ 2.000.000'), { meses: 24, origem: 'padrao' });
});

const LINHA = (nivel, codigo, logica) => ({ nivel, codigo, logica, indicador: 'i', linha_base: 'b', meta: 'm',
  fonte_verificacao: 'f', frequencia: 'q', responsavel: 'r', marco_verificacao: 'M6', pressupostos: 'p' });

test('normalizarParte1: ordena níveis, exige outputs e limita textos', () => {
  const r = P.normalizarParte1({
    ficha: { titulo: 'T', objetivo_geral: 'x'.repeat(2000), objetivos_especificos: ['a', '', 'b', 'c', 'd', 'e', 'f', 'g'] },
    marco: [LINHA('OUTPUT', '1.1', 'OUTPUT 1 — X'), LINHA('IMPACTO', 'IMP', 'Impacto'), LINHA('INVENTADO', 'z', 'z'),
      LINHA('OUTCOME', 'OC.1', 'Outcome'), LINHA('OUTPUT', '2.1', '')],
    avisos: ['a1']
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados.marco.map(l => l.nivel), ['IMPACTO', 'OUTCOME', 'OUTPUT']);
  assert.equal(r.dados.ficha.objetivo_geral.length, 700);
  assert.deepEqual(r.dados.ficha.objetivos_especificos, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(r.dados.ficha.resumo, '');
  assert.equal(P.normalizarParte1({ ficha: {}, marco: [LINHA('IMPACTO', 'IMP', 'x')] }).ok, false);
  assert.equal(P.normalizarParte1('x').ok, false);
});

test('normalizarParte2: moeda, totais por ano somando exato, Gantt dentro da duração', () => {
  const r = P.normalizarParte2({
    orcamento: {
      moeda: 'usd', rubricas_do_edital: true, observacoes: ['o'],
      linhas: [
        { rubrica: 'Pessoal', descricao: 'd', unidade: 'mês', quantidade: 24, custo_unitario: 3333.33, por_ano: [1, 1] },
        { rubrica: 'Viagens', descricao: 'd', unidade: 'viagem', quantidade: 3, custo_unitario: 1000, por_ano: [0, 0] },
        { rubrica: 'Zerada', quantidade: 0, custo_unitario: 10 },
        { rubrica: 'Negativa', quantidade: 2, custo_unitario: -5 }
      ]
    },
    gantt: [
      { output: 'O1', codigo: 'A1.1', atividade: 'Diagnóstico', mes_inicio: 9, mes_fim: 3, marcos: [5, 5, 99, 0, 7, 8] },
      { output: 'O1', codigo: 'A1.2', atividade: 'Outra', mes_inicio: -4, mes_fim: 400, marcos: [] },
      { atividade: '' }
    ],
    avisos: []
  }, 30);
  assert.equal(r.ok, true);
  const o = r.dados.orcamento;
  assert.equal(o.moeda, 'USD');
  assert.equal(o.linhas.length, 2);
  const [pessoal, viagens] = o.linhas;
  assert.equal(pessoal.por_ano.length, 3);                                  // 30 meses = 3 anos
  assert.equal(Math.round(pessoal.por_ano.reduce((a, b) => a + b, 0) * 100) / 100, 79999.92);
  assert.deepEqual(viagens.por_ano, [1200, 1200, 600]);                      // sem pesos: proporcional aos meses
  const [a1, a2] = r.dados.gantt;
  assert.deepEqual([a1.mes_inicio, a1.mes_fim, a1.marcos], [3, 9, [5, 7, 8]]);
  assert.deepEqual([a2.mes_inicio, a2.mes_fim], [1, 30]);
  assert.equal(r.dados.gantt.length, 2);
});

test('normalizarParte2: moeda inválida vira BRL; orçamento ou Gantt vazio é inválido', () => {
  const base = { gantt: [{ atividade: 'a', mes_inicio: 1, mes_fim: 2 }], orcamento: { moeda: 'dólar', linhas: [{ rubrica: 'R', quantidade: 1, custo_unitario: 1 }] } };
  const r = P.normalizarParte2(base, 12);
  assert.equal(r.dados.orcamento.moeda, 'BRL');
  assert.equal(r.dados.orcamento.moeda_informada, false);
  assert.equal(P.normalizarParte2({ gantt: base.gantt, orcamento: { linhas: [] } }, 12).ok, false);
  assert.equal(P.normalizarParte2({ gantt: [], orcamento: base.orcamento }, 12).ok, false);
});

// ---------------- fluxo pelo doPost ----------------

function postar(ctx, corpo) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(corpo) } }).conteudo);
}

function demandaDoFormulario(extra = {}) {
  const d = envioValido(extra);
  delete d.site; delete d.turnstileToken;
  return d;
}

const PARTE1_IA = {
  ficha: { titulo: 'Arbovirus surveillance', resumo: 'r', problema: 'p', objetivos: 'o', abrangencia: 'a', parceiros: '',
    objetivo_geral: 'g', objetivos_especificos: ['e1', 'e2'], publico_beneficiario: 'pb', justificativa_aderencia: 'j' },
  marco: [LINHA('IMPACTO', 'IMP', 'Impact'), LINHA('OUTCOME', 'OC.1', 'Outcome'), LINHA('OUTPUT', '1.1', 'OUTPUT 1 — Evidence')],
  avisos: []
};
const PARTE2_IA = {
  orcamento: { moeda: 'USD', rubricas_do_edital: false, observacoes: [],
    linhas: [{ rubrica: 'Personnel', descricao: 'd', unidade: 'month', quantidade: 12, custo_unitario: 1000, por_ano: [1, 1] }] },
  gantt: [{ output: 'O1', codigo: 'A1.1', atividade: 'Survey', entregavel: 'Report', indicador: '1.1', responsavel: 'Team',
    mes_inicio: 1, mes_fim: 5, marcos: [5] }],
  avisos: []
};

function pedidoProposta(parte, extra = {}) {
  return Object.assign({ acao: 'proposta', parte, demanda: demandaDoFormulario(), idOportunidade: 'OPP-0001', idioma: 'Inglês',
    site: '', turnstileToken: '' }, parte === 2 ? { outputs: [{ codigo: 'O1', descricao: 'OUTPUT 1 — Evidence </edital>' }] } : {}, extra);
}

test('proposta parte 1: edital relido da planilha, sem dados pessoais na IA, idioma pedido', () => {
  const { ctx, requisicoes, emails } = criarContexto(montarPlanilha(), [respostaClaude(PARTE1_IA)]);
  const r = postar(ctx, pedidoProposta(1));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.parte, 1);
  assert.equal(r.edital.edital, 'Climate and Health');
  assert.equal(r.edital.link, 'https://wellcome.org/edital');
  assert.deepEqual(r.duracao, { meses: 24, origem: 'edital' });      // "24 meses" na planilha simulada
  assert.equal(r.marco.length, 3);

  const corpo = requisicoes[0].corpo;
  assert.match(corpo.system, /Escreva TODO o conteúdo em Inglês/);
  assert.match(corpo.system, /ao final de 24 meses/);
  const msg = corpo.messages[0].content;
  for (const proibido of ['Maria Pesquisadora', 'maria@fiocruz.br', 'SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org', 'docs.google.com/interno']) {
    assert.ok(!msg.includes(proibido), proibido);
  }
  assert.match(msg, /<edital>[\s\S]*Climate and Health[\s\S]*<\/edital>/);
  assert.equal(emails.length, 0);
});

test('proposta parte 2: outputs do navegador ficam delimitados; resposta normalizada', () => {
  const { ctx, requisicoes } = criarContexto(montarPlanilha(), [respostaClaude(PARTE2_IA)]);
  const r = postar(ctx, pedidoProposta(2));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.orcamento.moeda, 'USD');
  assert.deepEqual(simples(r.orcamento.linhas[0].por_ano), [6000, 6000]);
  assert.equal(r.gantt[0].mes_fim, 5);
  const msg = requisicoes[0].corpo.messages[0].content;
  assert.equal((msg.match(/<\/edital>/g) || []).length, 1, 'texto do navegador não fecha a tag');
  assert.match(requisicoes[0].corpo.system, /USD, EUR, GBP, BRL/);
});

test('proposta: edital vedado, inativo ou inexistente é recusado', () => {
  for (const id of ['LINHA-5', 'LINHA-6', 'OPP-9999']) {   // vedado, inativo, inexistente na planilha simulada
    const { ctx, requisicoes } = criarContexto(montarPlanilha());
    const r = postar(ctx, pedidoProposta(1, { idOportunidade: id }));
    assert.equal(r.ok, false);
    assert.match(r.erro, /não está mais disponível/);
    assert.equal(requisicoes.length, 0);
  }
});

test('proposta: pedidos inválidos são recusados sem chamar a IA', () => {
  const casos = [
    pedidoProposta(3),
    pedidoProposta(1, { idioma: 'Alemão' }),
    pedidoProposta(1, { extra: true }),
    pedidoProposta(1, { demanda: demandaDoFormulario({ resumo: 'curto' }) }),
    pedidoProposta(1, { site: 'robô' }),
    pedidoProposta(2, { outputs: [] })
  ];
  for (const corpo of casos) {
    const { ctx, requisicoes } = criarContexto(montarPlanilha());
    assert.equal(postar(ctx, corpo).ok, false, JSON.stringify(corpo).slice(0, 80));
    assert.equal(requisicoes.length, 0);
  }
});

test('proposta: limite de 8 por e-mail em 24 h (parte 1)', () => {
  const respostas = Array.from({ length: 9 }, () => respostaClaude(PARTE1_IA));
  const { ctx } = criarContexto(montarPlanilha(), respostas);
  for (let i = 0; i < 8; i++) assert.equal(postar(ctx, pedidoProposta(1)).ok, true);
  assert.match(postar(ctx, pedidoProposta(1)).erro, /limite de 8 rascunhos/);
});

test('proposta: resposta sem outputs conta como inválida e é refeita uma vez', () => {
  const ruim = { ficha: {}, marco: [LINHA('IMPACTO', 'IMP', 'x')], avisos: [] };
  const { ctx, requisicoes } = criarContexto(montarPlanilha(), [respostaClaude(ruim), respostaClaude(PARTE1_IA)]);
  assert.equal(postar(ctx, pedidoProposta(1)).ok, true);
  assert.equal(requisicoes.length, 2);
});

test('formulário aceita idiomaProposta opcional', () => {
  const { ctx } = criarContexto(montarPlanilha());
  assert.equal(ctx.validarDemanda(demandaDoFormulario()).demanda.idiomaProposta, 'Português');
  assert.equal(ctx.validarDemanda(demandaDoFormulario({ idiomaProposta: 'Francês' })).demanda.idiomaProposta, 'Francês');
  assert.equal(ctx.validarDemanda(demandaDoFormulario({ idiomaProposta: 'Latim' })).ok, false);
});

test('testarProposta() roda as duas partes pelo editor', () => {
  const { ctx, logs } = criarContexto(montarPlanilha(), [respostaClaude(PARTE1_IA), respostaClaude(PARTE2_IA)]);
  ctx.testarProposta();
  const saida = logs.join('\n');
  assert.match(saida, /Parte 1: [\d.]+ s \| ok: true/);
  assert.match(saida, /Parte 2: [\d.]+ s \| ok: true/);
  assert.match(saida, /Orçamento: 1 linhas, total USD 12000\.00/);
});

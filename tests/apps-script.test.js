// Carrega todos os .gs num contexto único (como o Apps Script faz) com serviços simulados.
// Confere: nomes globais sem colisão com o script existente, diagnosticoBase() e gerarIdsOportunidades().
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'apps-script');
const REF = path.join(__dirname, '..', 'referencia', 'codigo-apps-script-existente.gs');

function nomesGlobais(codigo) {
  const nomes = [];
  const re = /^(?:function\s+([A-Za-z_$][\w$]*)|(?:var|const|let)\s+([A-Za-z_$][\w$]*))/gm;
  let m;
  while ((m = re.exec(codigo)) !== null) nomes.push(m[1] || m[2]);
  return nomes;
}

function arquivosGs() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.gs')).sort();
}

test('nomes globais: sem repetição entre arquivos e sem colisão com o script existente', () => {
  const existentes = new Set(nomesGlobais(fs.readFileSync(REF, 'utf8')));
  const vistos = {};
  for (const f of arquivosGs()) {
    for (const n of nomesGlobais(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
      assert.ok(!vistos[n], `"${n}" definido em ${vistos[n]} e em ${f}`);
      vistos[n] = f;
      assert.ok(!existentes.has(n), `"${n}" (${f}) colide com o script existente`);
    }
  }
});

// ---------- Planilha simulada ----------
function criarAba(nome, matriz, opcoes = {}) {
  const links = opcoes.links || {}; // "linha,coluna" (1-based) → url
  return {
    nome,
    matriz,
    getLastRow: () => matriz.length,
    getLastColumn: () => Math.max(0, ...matriz.map(l => l.length)),
    getParent: () => planilhaAtual,
    getRange(linha, col, nLinhas = 1, nCols = 1) {
      const celulas = (fn) => Array.from({ length: nLinhas }, (_, i) =>
        Array.from({ length: nCols }, (_, j) => fn(linha + i, col + j)));
      const valor = (l, c) => (matriz[l - 1] && matriz[l - 1][c - 1] !== undefined) ? matriz[l - 1][c - 1] : '';
      return {
        getValues: () => celulas(valor),
        getDisplayValues: () => celulas((l, c) => {
          const v = valor(l, c);
          return v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v);
        }),
        getRichTextValues: () => celulas((l, c) => ({
          getLinkUrl: () => links[`${l},${c}`] || null,
          getRuns: () => []
        })),
        setValue: (v) => {
          while (matriz.length < linha) matriz.push([]);
          matriz[linha - 1][col - 1] = v;
        }
      };
    }
  };
}

let planilhaAtual;

function criarContexto(abas) {
  planilhaAtual = {
    getSheetByName: (n) => abas[n] || null,
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
    getSpreadsheetLocale: () => 'pt_BR'
  };
  const logs = [];
  const props = { SPREADSHEET_ID: 'planilha-teste', MIN_DIAS_PRAZO: '21' };
  const ctx = {
    console: { log: (s) => logs.push(String(s)), error: (s) => logs.push('ERRO ' + s) },
    SpreadsheetApp: { openById: () => planilhaAtual },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ ...props }),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    Utilities: {
      formatDate: (d, _tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return '2026-09-25'; // "hoje" fixo
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(ctx);
  for (const f of arquivosGs()) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, logs };
}

const CAB_OPP = ['Nome do parceiro', 'Nome do edital', 'Tema central', 'Resumo da chamada', 'Prazo', 'Valores',
  'Tempo de duração', 'Projeto FIOCRUZ com sinergia', 'Ponto focal no time do Escritório', 'Pesquisador parceiro',
  'Email de contato', 'Valor enviado', 'Valor captado', 'Link do edital', 'Link do resumo executivo', 'ID', 'Ativo no matching'];
const CAB_ORG = ['Organização', 'Sinergia', 'Prioridades programáticas', 'Acesso por', 'Tipo de projeto apoiado',
  'Região de Financiamento', 'Porte de financiamento', 'Contato/ Cargo', 'Endereço de contato', 'País de origem', 'Website',
  'Status de integridade', 'Via de governança'];

function montarPlanilha() {
  const opp = [
    [...CAB_OPP],
    ['Wellcome Trust', 'Climate and Health', 'Clima', 'Resumo', new Date(2026, 2, 1), 'US$ 1M', '24 meses', '', 'SEGREDO-PONTO-FOCAL', 'x', 'pessoa@exemplo.org', '', '', 'Ver edital', 'https://docs.google.com/interno', 'OPP-0001', ''],
    ['Unitaid', 'Call X', 'Tema', 'Resumo', 'Aplicações contínuas', '', '', '', '', '', '', '', '', 'https://unitaid.org', '', '', 'Sim'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Fundação Vedada', 'Edital V', 'Tema', 'Resumo', 'Não encontrado.', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Gates Foundation', 'Grand Challenges', 'Tema', 'Resumo', 'March 1 • July 1 • October 1', '', '', '', '', '', '', '', '', '', '', '', 'Não']
  ];
  const org = [
    [...CAB_ORG],
    ['Wellcome Trust', 's', 'p', 'a', 't', 'r', 'porte', 'CONTATO-INTERNO', 'rua interna', 'UK', 'https://wellcome.org', 'Permitido', 'Captação direta'],
    ['Vedada Foundation', '', '', '', '', '', '', '', '', '', '', 'Vedado', ''],
    ['The Gates Foundation', '', '', '', '', '', '', '', '', 'EUA', 'www.gatesfoundation.org', '', '']
  ];
  return {
    Oportunidades: criarAba('Oportunidades', opp, { links: { '2,14': 'https://wellcome.org/edital' } }),
    'Organizações': criarAba('Organizações', org)
  };
}

test('carregarBaseMatching_: junção, filtros, prazos e nenhuma coluna interna lida', () => {
  const abas = montarPlanilha();
  const { ctx } = criarContexto(abas);
  const base = ctx.carregarBaseMatching_(ctx.obterConfigMatching_(), '2026-09-25');

  assert.equal(base.oportunidades.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(base.candidatos.map(o => o.id))), ['OPP-0001', 'LINHA-3']);
  assert.deepEqual(JSON.parse(JSON.stringify(base.diagnostico.vedadas)), ['LINHA-5']);
  assert.deepEqual(JSON.parse(JSON.stringify(base.diagnostico.inativas)), ['LINHA-6']);
  assert.deepEqual(JSON.parse(JSON.stringify(base.diagnostico.linhasIgnoradas)), [4]);
  assert.deepEqual(JSON.parse(JSON.stringify(base.diagnostico.semFinanciador.map(s => s.financiador))), ['Unitaid']);

  const [w, u, , g] = base.oportunidades;
  assert.equal(w.prazo.status, 'encerrado');
  assert.equal(w.prazo.data, '01/03/2026');
  assert.equal(w.linkEdital, 'https://wellcome.org/edital');     // link vindo do RichText
  assert.equal(w.integridade, 'Permitido');
  assert.equal(u.prazo.status, 'continuo');
  assert.equal(g.prazo.status, 'ciclos');

  assert.equal(base.organizacoesParaIA.length, 2);
  assert.equal(base.organizacoes[2].website, 'https://www.gatesfoundation.org');

  const serializado = JSON.stringify(base);
  for (const interno of ['SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org', 'docs.google.com/interno', 'CONTATO-INTERNO', 'rua interna']) {
    assert.ok(!serializado.includes(interno), `coluna interna vazou: ${interno}`);
  }
});

test('carregarBaseMatching_: tolera ausência das colunas novas', () => {
  const abas = montarPlanilha();
  abas.Oportunidades.matriz.forEach(l => l.splice(15, 2));
  abas['Organizações'].matriz.forEach(l => l.splice(11, 2));
  const { ctx } = criarContexto(abas);
  const base = ctx.carregarBaseMatching_(ctx.obterConfigMatching_(), '2026-09-25');
  assert.deepEqual(JSON.parse(JSON.stringify(base.diagnostico.colunasAusentesOportunidades)), ['ID', 'Ativo no matching']);
  assert.deepEqual(JSON.parse(JSON.stringify(base.diagnostico.colunasAusentesOrganizacoes)), ['Status de integridade', 'Via de governança']);
  assert.equal(base.candidatos.length, 4); // sem colunas novas, nada é vedado nem inativo
  assert.ok(base.oportunidades.every(o => o.integridade === 'Não avaliado' && o.via === 'A definir'));
});

test('diagnosticoBase() roda e mostra o resumo', () => {
  const { ctx, logs } = criarContexto(montarPlanilha());
  ctx.diagnosticoBase();
  const saida = logs.join('\n');
  assert.match(saida, /encerrado: 1/);
  assert.match(saida, /continuo: 1/);
  assert.match(saida, /ciclos: 1/);
  assert.match(saida, /a_confirmar: 1/);
  assert.match(saida, /"Unitaid"/);
});

test('gerarIdsOportunidades() preenche só os vazios', () => {
  const abas = montarPlanilha();
  const { ctx } = criarContexto(abas);
  ctx.gerarIdsOportunidades();
  const ids = abas.Oportunidades.matriz.slice(1).map(l => l[15]);
  assert.deepEqual(ids, ['OPP-0001', 'OPP-0002', '', 'OPP-0003', 'OPP-0004']);
});

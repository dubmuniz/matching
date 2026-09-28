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
        },
        setValues: (valores) => {
          valores.forEach((l, i) => {
            while (matriz.length < linha + i) matriz.push([]);
            l.forEach((v, j) => { matriz[linha - 1 + i][col - 1 + j] = v; });
          });
        }
      };
    },
    appendRow: (l) => { matriz.push([...l]); },
    setFrozenRows: () => {}
  };
}

let planilhaAtual;

// respostasApi: lista de { codigo, corpo } devolvidos em ordem pelo UrlFetchApp simulado.
function criarContexto(abas, respostasApi = [], opcoes = {}) {
  planilhaAtual = {
    getSheetByName: (n) => abas[n] || null,
    insertSheet: (n) => { abas[n] = criarAba(n, []); return abas[n]; },
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo',
    getSpreadsheetLocale: () => 'pt_BR'
  };
  const logs = [];
  const requisicoes = [];
  const props = Object.assign({
    SPREADSHEET_ID: 'planilha-teste', MIN_DIAS_PRAZO: '21', ANTHROPIC_API_KEY: 'chave-de-teste',
    ESCRITORIO_EMAIL: 'escritorio@fiocruz.br', DOMINIOS_COPIA: 'fiocruz.br'
  }, opcoes.props || {});
  const propsUsuario = {};
  const cache = {};
  const emails = [];
  const armazem = (obj) => ({
    getProperties: () => ({ ...obj }),
    getProperty: (k) => (k in obj ? obj[k] : null),
    setProperty: (k, v) => { obj[k] = String(v); },
    deleteProperty: (k) => { delete obj[k]; }
  });
  const ctx = {
    console: {
      log: (s) => logs.push(String(s)),
      warn: (s) => logs.push('AVISO ' + s),
      error: (s) => logs.push('ERRO ' + s)
    },
    UrlFetchApp: {
      fetch: (url, opcoes) => {
        const corpo = typeof opcoes.payload === 'string' ? JSON.parse(opcoes.payload) : opcoes.payload;
        requisicoes.push({ url, opcoes, corpo });
        const r = respostasApi.shift();
        if (!r) throw new Error('sem resposta simulada');
        if (r.excecao) throw new Error(r.excecao);
        return {
          getResponseCode: () => r.codigo,
          getContentText: () => typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo),
          getHeaders: () => r.cabecalhos || {}
        };
      }
    },
    SpreadsheetApp: { openById: () => planilhaAtual },
    PropertiesService: {
      getScriptProperties: () => armazem(props),
      getUserProperties: () => armazem(propsUsuario)
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; },
        remove: (k) => { delete cache[k]; }
      })
    },
    MailApp: {
      sendEmail: (m) => {
        if (opcoes.falharEmail) throw new Error('cota de e-mail esgotada');
        emails.push(m);
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (t) => ({ conteudo: t, setMimeType(m) { this.mime = m; return this; } })
    },
    Utilities: {
      formatDate: (d, _tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return '2026-09-25'; // "hoje" fixo
        if (fmt === 'yyyyMMdd') return '20260925';
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
      },
      sleep: () => {},
      newBlob: (t) => ({ getBytes: () => Buffer.from(String(t), 'utf8') }),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg, t) => [...require('node:crypto').createHash('sha256').update(t).digest()],
      base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'),
      getUuid: () => require('node:crypto').randomUUID()
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(ctx);
  for (const f of arquivosGs()) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, logs, requisicoes, emails, propsUsuario, cache };
}

// Resposta simulada da API: um bloco thinking (vazio) seguido do JSON no bloco text.
function respostaClaude(json, extra = {}) {
  return {
    codigo: 200,
    corpo: {
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }
      ],
      stop_reason: extra.stop_reason || 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 500 }
    }
  };
}

const RESULTADO_IA = {
  resumo_demanda: 'Vigilância de arboviroses com dados climáticos.',
  lacunas_da_demanda: ['Orçamento detalhado'],
  oportunidades: [
    { id: 'OPP-0001', nota: 82, criterios: { tematica: 38, elegibilidade: 20, porte: 12, maturidade: 7, viabilidade: 5 },
      por_que_combina: 'Clima e saúde.', lacunas_e_riscos: 'Nenhuma.', requisitos_criticos: [], proximo_passo: 'Contatar.' },
    { id: 'OPP-9999', nota: 90, criterios: {}, por_que_combina: 'inventado', lacunas_e_riscos: '', requisitos_criticos: [], proximo_passo: '' }
  ],
  financiadores: [
    { organizacao: 'Wellcome Trust', nota: 70, por_que_combina: 'Clima.', como_abordar: 'E-mail.' },
    { organizacao: 'Vedada Foundation', nota: 99, por_que_combina: 'x', como_abordar: 'x' }
  ]
};

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

test('testarMatching(): requisição correta, sem dados internos, e cards no log', () => {
  const { ctx, logs, requisicoes } = criarContexto(montarPlanilha(), [respostaClaude(RESULTADO_IA)]);
  ctx.testarMatching();

  assert.equal(requisicoes.length, 1);
  const { url, opcoes, corpo } = requisicoes[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(opcoes.headers['anthropic-version'], '2023-06-01');
  assert.equal(opcoes.headers['x-api-key'], 'chave-de-teste');
  assert.equal(corpo.model, 'claude-sonnet-5');
  assert.ok(!('temperature' in corpo), 'Sonnet 5 rejeita temperature');
  assert.equal(corpo.output_config.format.type, 'json_schema');
  assert.equal(corpo.system, ctx.SYSTEM_PROMPT_MATCHING);

  const msg = corpo.messages[0].content;
  // Vedados não vão para a IA; nome/e-mail do pesquisador e colunas internas também não.
  for (const proibido of ['Vedada', 'Edital V', 'Pesquisador(a) de teste', 'teste@fiocruz.br',
    'SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org', 'docs.google.com/interno', 'CONTATO-INTERNO', 'rua interna']) {
    assert.ok(!msg.includes(proibido), `não deveria ir para a IA: ${proibido}`);
  }
  assert.match(msg, /<demanda>[\s\S]*<\/demanda>[\s\S]*<oportunidades>[\s\S]*<\/oportunidades>[\s\S]*<financiadores>/);
  assert.match(msg, /"id":"OPP-0001"/);
  assert.match(msg, /"status_prazo":"encerrado"/);

  const saida = logs.join('\n');
  assert.match(saida, /\[82 · Alta aderência\] Climate and Health — Wellcome Trust \(OPP-0001\)/);
  assert.match(saida, /Último prazo conhecido: 01\/03\/2026/);         // prazo vem da planilha
  assert.ok(!saida.includes('(OPP-9999)'), 'id inventado pela IA não pode virar card');
  assert.match(saida, /AVISO Itens descartados na validação: .*OPP-9999/);
  assert.ok(!/\[99 ·/.test(saida), 'financiador não enviado deve ser descartado');
  assert.match(saida, /\[70 · Boa aderência\] Wellcome Trust \(UK\)/);
});

test('imprimirEmBlocos_: nenhum console.log passa de 6.000 caracteres e nada se perde', () => {
  const { ctx, logs } = criarContexto(montarPlanilha());
  const linhas = Array.from({ length: 300 }, (_, i) => `linha ${i} ` + 'x'.repeat(100));
  linhas.push('y'.repeat(15000));
  ctx.imprimirEmBlocos_(linhas);
  assert.ok(logs.length > 1);
  assert.ok(logs.every(l => l.length <= 6000));
  assert.equal(logs.join('\n').replace(/\n/g, ''), linhas.join('').replace(/\n/g, ''));
});

test('matching: repete uma vez se o JSON vier inválido e lê só blocos de texto', () => {
  const { ctx, requisicoes } = criarContexto(montarPlanilha(), [
    respostaClaude('isto não é JSON'),
    respostaClaude('```json\n' + JSON.stringify(RESULTADO_IA) + '\n```')
  ]);
  ctx.testarMatching();
  assert.equal(requisicoes.length, 2);
  assert.match(requisicoes[1].corpo.messages[0].content, /Sua resposta anterior não era JSON válido\. Responda apenas com o JSON\.$/);
});

test('matching: erro após duas respostas inválidas', () => {
  const { ctx } = criarContexto(montarPlanilha(), [respostaClaude('{'), respostaClaude('[]')]);
  assert.throws(() => ctx.testarMatching(), /Resposta da IA inválida após 2 tentativas/);
});

test('matching: novas tentativas em 529 e falha de rede; 400 não repete', () => {
  let { ctx, requisicoes } = criarContexto(montarPlanilha(), [
    { codigo: 529, corpo: { error: { type: 'overloaded_error' } } },
    { excecao: 'Timeout' },
    respostaClaude(RESULTADO_IA)
  ]);
  ctx.testarMatching();
  assert.equal(requisicoes.length, 3);

  ({ ctx, requisicoes } = criarContexto(montarPlanilha(), [
    { codigo: 400, corpo: { error: { type: 'invalid_request_error', message: 'bad' } } }
  ]));
  assert.throws(() => ctx.testarMatching(), /HTTP 400/);
  assert.equal(requisicoes.length, 1);
});

test('matching: resposta cortada (max_tokens) conta como inválida', () => {
  const { ctx, requisicoes } = criarContexto(montarPlanilha(), [
    respostaClaude('{"resumo', { stop_reason: 'max_tokens' }),
    respostaClaude(RESULTADO_IA)
  ]);
  ctx.testarMatching();
  assert.equal(requisicoes.length, 2);
});

// ---------------- Etapa 3: doPost ----------------

function envioValido(extra = {}) {
  return Object.assign({
    nome: 'Maria Pesquisadora',
    email: 'maria@fiocruz.br',
    unidade: 'ILMD – Fiocruz Amazônia',
    unidadeOutra: '',
    titulo: 'Vigilância de arboviroses e clima',
    resumo: 'R'.repeat(120),
    problema: 'P'.repeat(60),
    objetivos: 'O'.repeat(60),
    areas: ['Arboviroses e vetores', 'Clima e saúde'],
    abrangencia: 'Amazonas',
    maturidade: 'Projeto estruturado',
    valorEstimado: 'R$ 1–5 milhões',
    horizonte: '6–12 meses',
    parceiros: '',
    idiomas: ['Português', 'Inglês'],
    consentimento: true,
    site: '',
    turnstileToken: ''
  }, extra);
}

function postar(ctx, corpo) {
  const saida = ctx.doPost({ postData: { contents: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) } });
  assert.equal(saida.mime, 'application/json');
  return JSON.parse(saida.conteudo);
}

test('doGet responde { ok: true }', () => {
  const { ctx } = criarContexto(montarPlanilha());
  assert.deepEqual(JSON.parse(ctx.doGet().conteudo), { ok: true });
});

test('doPost: envio válido grava em Demandas, envia e-mails e devolve só os campos dos cards', () => {
  const abas = montarPlanilha();
  const { ctx, emails, requisicoes } = criarContexto(abas, [respostaClaude(RESULTADO_IA)]);
  const r = postar(ctx, envioValido());

  assert.equal(r.ok, true);
  assert.match(r.id_demanda, /^DEM-20260925-[A-Z0-9]{4}$/);
  assert.equal(requisicoes.length, 1);

  // Seções: OPP-0001 está encerrado com nota 82 → "monitorar"; financiador Wellcome 70.
  const res = r.resultado;
  assert.equal(res.abertas.length, 0);
  assert.equal(res.monitorar.length, 1);
  assert.equal(res.monitorar[0].id, 'OPP-0001');
  assert.equal(res.monitorar[0].prazo_texto, 'Último prazo conhecido: 01/03/2026 — verifique o próximo ciclo');
  assert.equal(res.monitorar[0].link_edital, 'https://wellcome.org/edital');
  assert.equal(res.financiadores[0].organizacao, 'Wellcome Trust');
  assert.equal(res.vazio, false);
  const json = JSON.stringify(r);
  for (const proibido of ['SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org', 'docs.google.com', 'CONTATO-INTERNO', 'Vedada', '"linha"']) {
    assert.ok(!json.includes(proibido), `não deveria ir ao navegador: ${proibido}`);
  }

  // Aba Demandas criada com o cabeçalho e uma linha
  const dem = abas.Demandas.matriz;
  assert.equal(dem[0][1], 'ID demanda');
  assert.equal(dem.length, 2);
  assert.equal(dem[1][1], r.id_demanda);
  assert.equal(dem[1][2], 'Maria Pesquisadora');
  assert.equal(dem[1][18], 'matching-v1');
  assert.equal(dem[1][19], 'Nova');
  assert.match(dem[1][17], /^1\. \[82\] Climate and Health — Wellcome Trust \(OPP-0001\)/);

  // E-mails: Escritório (com link da planilha) e cópia ao pesquisador (sem link)
  assert.equal(emails.length, 2);
  assert.equal(emails[0].to, 'escritorio@fiocruz.br');
  assert.equal(emails[0].subject, '[Fioconecta] Nova demanda: Vigilância de arboviroses e clima — ILMD – Fiocruz Amazônia');
  assert.equal(emails[0].replyTo, 'maria@fiocruz.br');
  assert.match(emails[0].htmlBody, /docs\.google\.com\/spreadsheets\/d\/planilha-teste\/edit/);
  assert.equal(emails[1].to, 'maria@fiocruz.br');
  assert.ok(!emails[1].htmlBody.includes('docs.google.com'));
});

test('doPost: sem cópia para domínio fora de DOMINIOS_COPIA (nem subdomínio)', () => {
  for (const email of ['alguem@gmail.com', 'alguem@ensp.fiocruz.br']) {
    const { ctx, emails } = criarContexto(montarPlanilha(), [respostaClaude(RESULTADO_IA)]);
    assert.equal(postar(ctx, envioValido({ email })).ok, true);
    assert.deepEqual(emails.map(e => e.to), ['escritorio@fiocruz.br'], email);
  }
});

test('doPost: texto do usuário é escapado no e-mail e não vira fórmula na planilha', () => {
  const abas = montarPlanilha();
  const { ctx, emails } = criarContexto(abas, [respostaClaude(RESULTADO_IA)]);
  const r = postar(ctx, envioValido({
    nome: '=HYPERLINK("http://x","clique")',
    titulo: '<img src=x onerror=alert(1)> Projeto'
  }));
  assert.equal(r.ok, true);
  assert.equal(abas.Demandas.matriz[1][2], `'=HYPERLINK("http://x","clique")`);
  assert.ok(!emails[0].htmlBody.includes('<img'));
  assert.match(emails[0].htmlBody, /&lt;img src=x onerror=alert\(1\)&gt; Projeto/);
});

test('doPost: entradas inválidas são rejeitadas antes de chamar a IA', () => {
  const casos = [
    ['', /Não foi possível ler/],
    ['{quebrado', /Não foi possível ler/],
    [JSON.stringify(envioValido({ resumo: 'x'.repeat(21000) })), /grande demais/],
    [envioValido({ site: 'spam' }), /Não foi possível confirmar/],
    [envioValido({ extra: 1 }), /Revise os campos/],
    [envioValido({ email: 'invalido' }), /Revise os campos/],
    [envioValido({ consentimento: 'sim' }), /Revise os campos/],
    [[1, 2], /Revise os campos/]
  ];
  for (const [corpo, esperado] of casos) {
    const { ctx, requisicoes, emails } = criarContexto(montarPlanilha());
    const r = postar(ctx, corpo);
    assert.equal(r.ok, false);
    assert.match(r.erro, esperado);
    assert.equal(requisicoes.length, 0);
    assert.equal(emails.length, 0);
  }
  const { ctx } = criarContexto(montarPlanilha());
  const r = postar(ctx, envioValido({ titulo: 'abc', areas: [] }));
  assert.ok(r.campos.titulo && r.campos.areas);
});

test('doPost: limite de 3 envios por e-mail em 24 h', () => {
  const respostas = Array.from({ length: 4 }, () => respostaClaude(RESULTADO_IA));
  const { ctx, requisicoes, propsUsuario } = criarContexto(montarPlanilha(), respostas);
  for (let i = 0; i < 3; i++) assert.equal(postar(ctx, envioValido({ email: 'MARIA@fiocruz.br' })).ok, true);
  const r = postar(ctx, envioValido({ email: 'maria@fiocruz.br' }));
  assert.equal(r.ok, false);
  assert.match(r.erro, /limite de 3 envios/);
  assert.equal(requisicoes.length, 3);
  assert.ok(!JSON.stringify(propsUsuario).includes('maria'), 'o e-mail não é guardado em claro');
  assert.equal(postar(ctx, envioValido({ email: 'outra@fiocruz.br' })).ok, true);
});

test('doPost: limite global de 30 envios por hora', () => {
  const { ctx, cache } = criarContexto(montarPlanilha(), [respostaClaude(RESULTADO_IA)]);
  cache.LIMITE_GLOBAL = JSON.stringify(Array.from({ length: 30 }, () => Date.now()));
  const r = postar(ctx, envioValido());
  assert.equal(r.ok, false);
  assert.match(r.erro, /muitos envios/);
});

test('doPost: Turnstile ligado exige token válido', () => {
  const props = { TURNSTILE_ATIVO: 'sim', TURNSTILE_SECRET: 'segredo' };
  let { ctx, requisicoes } = criarContexto(montarPlanilha(), [{ codigo: 200, corpo: { success: false } }], { props });
  let r = postar(ctx, envioValido({ turnstileToken: 'falso' }));
  assert.match(r.erro, /Não foi possível confirmar/);
  assert.equal(requisicoes.length, 1);

  ({ ctx, requisicoes } = criarContexto(montarPlanilha(), [], { props }));
  r = postar(ctx, envioValido({ turnstileToken: '' }));
  assert.match(r.erro, /Não foi possível confirmar/);
  assert.equal(requisicoes.length, 0);
});

test('doPost: falha da IA registra a demanda, avisa o Escritório e devolve mensagem amigável', () => {
  const abas = montarPlanilha();
  const { ctx, emails } = criarContexto(abas, [{ codigo: 400, corpo: { error: { message: 'x' } } }]);
  const r = postar(ctx, envioValido());
  assert.equal(r.ok, false);
  assert.match(r.erro, /Sua demanda foi registrada/);
  assert.match(r.id_demanda, /^DEM-/);
  assert.ok(!/HTTP|400|stack/i.test(r.erro), 'sem detalhes técnicos para o usuário');
  assert.match(abas.Demandas.matriz[1][16], /^ERRO NA IA/);
  assert.match(emails[0].htmlBody, /análise por IA falhou/);
});

test('doPost: falha no e-mail não impede a resposta', () => {
  const { ctx, logs } = criarContexto(montarPlanilha(), [respostaClaude(RESULTADO_IA)], { falharEmail: true });
  const r = postar(ctx, envioValido());
  assert.equal(r.ok, true);
  assert.ok(logs.some(l => /Falha ao enviar e-mail/.test(l)));
});

test('doPost: erro inesperado devolve mensagem genérica, sem stack trace', () => {
  const { ctx } = criarContexto(montarPlanilha(), [], { props: { SPREADSHEET_ID: '' } });
  const r = postar(ctx, envioValido());
  assert.deepEqual(r, { ok: false, erro: 'Ocorreu um erro inesperado. Tente novamente em alguns minutos.' });
});

test('testarValidacao(): todas as entradas inválidas são rejeitadas', () => {
  const { ctx, logs } = criarContexto(montarPlanilha());
  ctx.testarValidacao();
  const saida = logs.join('\n');
  assert.ok(!saida.includes('ACEITO'), saida);
  assert.equal((saida.match(/✓ rejeitado/g) || []).length, 10);
});

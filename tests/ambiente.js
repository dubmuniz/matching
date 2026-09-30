// Ambiente simulado do Apps Script (planilha, serviços, API do Claude) usado pelos testes.
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


module.exports = { DIR, REF, nomesGlobais, arquivosGs, criarAba, criarContexto, respostaClaude, RESULTADO_IA,
  CAB_OPP, CAB_ORG, montarPlanilha, envioValido };

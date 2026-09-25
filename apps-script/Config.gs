/**
 * Config.gs — configurações fixas e leitura das Propriedades do script.
 *
 * Segredos e dados de implantação ficam SOMENTE em Propriedades do script
 * (Editor do Apps Script → Configurações do projeto → Propriedades do script).
 * Nada disso vai para o repositório.
 */

var CONFIG_MATCHING = {
  // Planilha
  ABA_OPORTUNIDADES: 'Oportunidades',
  ABA_ORGANIZACOES: 'Organizações',
  ABA_DEMANDAS: 'Demandas',
  LINHA_CABECALHO: 1,

  // Claude
  ANTHROPIC_URL: 'https://api.anthropic.com/v1/messages',
  ANTHROPIC_VERSAO: '2023-06-01',
  MODELO_PADRAO: 'claude-sonnet-5',
  MAX_TOKENS: 6000,
  TIMEOUT_MS: 120000,
  TENTATIVAS_MAX: 4,
  ESPERA_BASE_MS: 1500,

  // Matching
  MIN_DIAS_PRAZO_PADRAO: 21,
  MAX_CANDIDATOS: 40,
  MAX_CARACTERES_CAMPO_IA: 1200,
  MAX_CARACTERES_TEXTO_IA_SAIDA: 400,

  // Fuso
  FUSO: 'America/Sao_Paulo'
};

// Nomes das propriedades usadas pelo projeto.
var PROPRIEDADES_MATCHING = [
  'ANTHROPIC_API_KEY',
  'SPREADSHEET_ID',
  'ESCRITORIO_EMAIL',
  'DOMINIOS_COPIA',
  'TURNSTILE_ATIVO',
  'TURNSTILE_SECRET',
  'MIN_DIAS_PRAZO',
  'MODELO_CLAUDE'
];

var VALOR_EXEMPLO_ = 'COLE_AQUI';

/**
 * Rode UMA VEZ pelo editor, depois de trocar os valores COLE_AQUI.
 * Valores que continuarem como COLE_AQUI são ignorados (não apagam o que já existe).
 *
 * Alternativa mais segura para a chave: cadastrar ANTHROPIC_API_KEY direto em
 * Configurações do projeto → Propriedades do script, sem colá-la no código.
 * Se colar aqui, volte o valor para COLE_AQUI depois de rodar.
 */
function configurarPropriedades() {
  var valores = {
    ANTHROPIC_API_KEY: 'COLE_AQUI',
    SPREADSHEET_ID: 'COLE_AQUI',          // trecho da URL da planilha entre /d/ e /edit
    ESCRITORIO_EMAIL: 'COLE_AQUI',        // quem recebe as demandas
    DOMINIOS_COPIA: 'fiocruz.br',         // domínios que podem receber cópia, separados por vírgula
    TURNSTILE_ATIVO: 'nao',               // 'sim' antes da divulgação ampla
    TURNSTILE_SECRET: 'COLE_AQUI',
    MIN_DIAS_PRAZO: '21',
    MODELO_CLAUDE: 'claude-sonnet-5'
  };

  var props = PropertiesService.getScriptProperties();
  var gravadas = [];
  Object.keys(valores).forEach(function (k) {
    var v = String(valores[k] || '').trim();
    if (!v || v === VALOR_EXEMPLO_) return;
    props.setProperty(k, v);
    gravadas.push(k);
  });
  console.log('Propriedades gravadas: ' + (gravadas.join(', ') || '(nenhuma)'));
  verificarPropriedades();
}

/** Mostra no log quais propriedades estão preenchidas, sem expor valores secretos. */
function verificarPropriedades() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var secretas = { ANTHROPIC_API_KEY: true, TURNSTILE_SECRET: true };
  PROPRIEDADES_MATCHING.forEach(function (k) {
    var v = props[k];
    var estado;
    if (!v) estado = '(vazia)';
    else if (secretas[k]) estado = 'preenchida (' + v.length + ' caracteres)';
    else estado = v;
    console.log(k + ': ' + estado);
  });
}

/** Lê e valida as propriedades. Lança erro se faltar algo obrigatório. */
function obterConfigMatching_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  var minDias = parseInt(p.MIN_DIAS_PRAZO, 10);

  var cfg = {
    anthropicApiKey: (p.ANTHROPIC_API_KEY || '').trim(),
    spreadsheetId: (p.SPREADSHEET_ID || '').trim(),
    escritorioEmail: (p.ESCRITORIO_EMAIL || '').trim(),
    dominiosCopia: String(p.DOMINIOS_COPIA || '')
      .split(',')
      .map(function (d) { return d.trim().toLowerCase(); })
      .filter(function (d) { return d; }),
    turnstileAtivo: /^(sim|true|1)$/i.test(String(p.TURNSTILE_ATIVO || '').trim()),
    turnstileSecret: (p.TURNSTILE_SECRET || '').trim(),
    minDiasPrazo: isFinite(minDias) && minDias >= 0 ? minDias : CONFIG_MATCHING.MIN_DIAS_PRAZO_PADRAO,
    modelo: (p.MODELO_CLAUDE || '').trim() || CONFIG_MATCHING.MODELO_PADRAO
  };

  if (!cfg.spreadsheetId) {
    throw new Error('Propriedade SPREADSHEET_ID não configurada. Rode configurarPropriedades().');
  }
  return cfg;
}

/** Data de hoje no fuso de São Paulo, como 'AAAA-MM-DD' (formato aceito por classificarPrazo). */
function hojeSaoPaulo_() {
  return Utilities.formatDate(new Date(), CONFIG_MATCHING.FUSO, 'yyyy-MM-dd');
}

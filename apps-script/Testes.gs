/**
 * Testes.gs — funções manuais para rodar pelo editor do Apps Script.
 *
 * diagnosticoBase(): confere a planilha e mostra no log (Execuções / Registro de execução):
 *   - localidade e fuso da planilha;
 *   - colunas novas ausentes;
 *   - nº de oportunidades por status de prazo;
 *   - oportunidades sem financiador correspondente em Organizações;
 *   - linhas ignoradas/incompletas, IDs temporários ou duplicados, valores fora da lista.
 *
 * testarMatching(): roda o matching completo (planilha + Claude) com uma demanda de exemplo
 *   e mostra no log os cards resultantes, o tempo e o consumo de tokens. Gasta créditos da API.
 *
 * testarValidacao(): envia ao doPost entradas inválidas e mostra as rejeições. Não gasta créditos.
 *
 * testarEnvioCompleto(): simula um envio real do formulário pelo doPost (grava na aba Demandas,
 *   envia o e-mail ao Escritório e, se o domínio permitir, a cópia). Usa ESCRITORIO_EMAIL como
 *   e-mail do "pesquisador". Gasta créditos da API e conta no limite de 3 envios por e-mail/24 h
 *   (use limparLimitesDeTaxa() para zerar durante os testes).
 */

/**
 * Mostra no log os últimos erros do app da web (guardados por registrarErro_ em Codigo.gs),
 * com o código de referência que o usuário vê na página.
 */
function verUltimosErros() {
  var lista = lerJson_(PropertiesService.getScriptProperties().getProperty(CHAVE_ULTIMOS_ERROS_));
  if (!lista.length) { console.log('Nenhum erro registrado.'); return; }
  imprimirEmBlocos_(lista.map(function (e) {
    return e.quando + ' [ref. ' + e.ref + '] ' + e.contexto + '\n' + e.detalhe + '\n';
  }));
}

/** Simula o evento que o Apps Script entrega ao doPost. */
function eventoPost_(corpo) {
  return { postData: { contents: typeof corpo === 'string' ? corpo : JSON.stringify(corpo), type: 'text/plain' } };
}

function envioValidoDeExemplo_(email) {
  var d = JSON.parse(JSON.stringify(DEMANDA_EXEMPLO_));
  d.email = email;
  d.consentimento = true;
  d.site = '';
  d.turnstileToken = '';
  return d;
}

function testarValidacao() {
  var base = envioValidoDeExemplo_('teste-validacao@exemplo.org');
  var casos = [
    ['corpo vazio', ''],
    ['JSON inválido', '{nome:'],
    ['corpo acima de 20 KB', JSON.stringify(Object.assign({}, base, { resumo: 'x'.repeat(21000) }))],
    ['honeypot preenchido', Object.assign({}, base, { site: 'http://spam.example' })],
    ['campo desconhecido', Object.assign({}, base, { admin: true })],
    ['e-mail inválido', Object.assign({}, base, { email: 'sem-arroba' })],
    ['resumo curto', Object.assign({}, base, { resumo: 'curto' })],
    ['unidade fora da lista', Object.assign({}, base, { unidade: 'Unidade X' })],
    ['4 áreas temáticas', Object.assign({}, base, { areas: AREAS_TEMATICAS.slice(0, 4) })],
    ['sem consentimento', Object.assign({}, base, { consentimento: false })]
  ];
  var linhas = ['===== TESTE DE VALIDAÇÃO (sem custo) ====='];
  casos.forEach(function (c) {
    var r = processarEnvio_(eventoPost_(c[1]));
    linhas.push((r.ok ? '✗ ACEITO (erro!) ' : '✓ rejeitado ') + '— ' + c[0] + ': ' + r.erro +
      (r.campos ? ' ' + JSON.stringify(r.campos) : ''));
  });
  linhas.push('===== FIM =====');
  imprimirEmBlocos_(linhas);
}

function testarEnvioCompleto() {
  var cfg = obterConfigMatching_();
  if (!cfg.escritorioEmail) throw new Error('Configure ESCRITORIO_EMAIL antes deste teste.');
  var inicio = Date.now();
  var r = processarEnvio_(eventoPost_(envioValidoDeExemplo_(cfg.escritorioEmail)));
  var linhas = ['===== TESTE DE ENVIO COMPLETO =====',
    'Tempo: ' + ((Date.now() - inicio) / 1000).toFixed(1) + ' s',
    'ok: ' + r.ok + (r.erro ? ' | erro: ' + r.erro : ''),
    'ID da demanda: ' + (r.id_demanda || '—')];
  if (r.ok) {
    var res = r.resultado;
    linhas.push('Seções: abertas=' + res.abertas.length + ', monitorar=' + res.monitorar.length +
      ', financiadores=' + res.financiadores.length + (res.vazio ? ' (vazio)' : ''));
    linhas.push('Top 3:\n' + top3Texto(res));
    linhas.push('Resposta enviada ao navegador (' + JSON.stringify(r).length + ' caracteres).');
  }
  linhas.push('Confira: nova linha na aba ' + CONFIG_MATCHING.ABA_DEMANDAS + ' e e-mail em ' + cfg.escritorioEmail + '.');
  linhas.push('===== FIM =====');
  imprimirEmBlocos_(linhas);
}

function diagnosticoBase() {
  var cfg = obterConfigMatching_();
  var hoje = hojeSaoPaulo_();
  var base = carregarBaseMatching_(cfg, hoje);
  var d = base.diagnostico;
  var linhas = [];
  var log = function (s) { linhas.push(s); };

  log('===== DIAGNÓSTICO DA BASE (' + hoje + ', MIN_DIAS_PRAZO=' + cfg.minDiasPrazo + ') =====');

  // Planilha
  log('');
  log('Planilha: localidade=' + d.localidade + ', fuso=' + d.fuso);
  if (!/^pt_BR$/i.test(d.localidade)) {
    log('  ⚠ Localidade diferente de pt_BR: datas digitadas como texto (ex.: 01/03/2026) podem ser lidas como mês/dia. ' +
        'Ajuste em Arquivo → Configurações → Localidade = Brasil.');
  }
  if (d.fuso !== CONFIG_MATCHING.FUSO) {
    log('  ⚠ Fuso da planilha diferente de ' + CONFIG_MATCHING.FUSO + '.');
  }

  // Colunas
  log('');
  log('Colunas ausentes em ' + CONFIG_MATCHING.ABA_OPORTUNIDADES + ': ' + listaOuNenhuma_(d.colunasAusentesOportunidades));
  log('Colunas ausentes em ' + CONFIG_MATCHING.ABA_ORGANIZACOES + ': ' + listaOuNenhuma_(d.colunasAusentesOrganizacoes));

  // Oportunidades
  log('');
  log('Oportunidades válidas: ' + base.oportunidades.length +
      ' | candidatas ao matching: ' + base.candidatos.length +
      ' | inativas: ' + d.inativas.length + ' | vedadas: ' + d.vedadas.length);
  if (base.candidatos.length > CONFIG_MATCHING.MAX_CANDIDATOS) {
    log('  → Mais de ' + CONFIG_MATCHING.MAX_CANDIDATOS + ' candidatas: a pré-seleção por termos será aplicada.');
  }
  log('Linhas ignoradas (sem edital e sem parceiro): ' + listaOuNenhuma_(d.linhasIgnoradas));
  log('Linhas incompletas (falta edital OU parceiro): ' + listaOuNenhuma_(d.linhasIncompletas));
  log('Linhas sem ID (usam ID temporário LINHA-n; rode gerarIdsOportunidades): ' + listaOuNenhuma_(d.idsTemporarios));
  log('IDs duplicados: ' + listaOuNenhuma_(d.idsDuplicados));
  log('Valores não reconhecidos em "Ativo no matching" (contam como Sim): ' +
      listaOuNenhuma_(d.valoresAtivoDesconhecidos.map(function (v) { return 'linha ' + v.linha + ' = "' + v.valor + '"'; })));
  log('Linhas com "Link do edital" inválido (não aparecerá no card): ' + listaOuNenhuma_(d.linksInvalidos));

  // Prazos
  log('');
  log('Oportunidades por status de prazo:');
  var ordem = ['aberto', 'prazo_curto', 'continuo', 'ciclos', 'a_confirmar', 'encerrado'];
  var contagem = {};
  ordem.forEach(function (s) { contagem[s] = []; });
  base.oportunidades.forEach(function (o) { contagem[o.prazo.status].push(o); });
  ordem.forEach(function (s) {
    log('  ' + s + ': ' + contagem[s].length);
    contagem[s].forEach(function (o) {
      log('      ' + o.id + ' | "' + resumirTexto_(o.prazoBruto, 50) + '" → ' + o.prazo.texto);
    });
  });

  // Junção
  log('');
  log('Oportunidades sem financiador correspondente em ' + CONFIG_MATCHING.ABA_ORGANIZACOES +
      ' (herdam "Não avaliado" / "A definir"): ' + d.semFinanciador.length);
  d.semFinanciador.forEach(function (s) {
    log('  linha ' + s.linha + ' | ' + s.id + ' | "' + s.financiador + '"');
  });

  // Organizações
  log('');
  var porIntegridade = {}, porVia = {};
  base.organizacoes.forEach(function (g) {
    porIntegridade[g.integridade] = (porIntegridade[g.integridade] || 0) + 1;
    porVia[g.via] = (porVia[g.via] || 0) + 1;
  });
  log('Organizações: ' + base.organizacoes.length + ' | enviadas à IA (sem vedadas): ' + base.organizacoesParaIA.length);
  log('  por integridade: ' + JSON.stringify(porIntegridade));
  log('  por via de governança: ' + JSON.stringify(porVia));
  log('  nomes repetidos após normalização: ' + listaOuNenhuma_(d.organizacoesDuplicadas));
  log('  valores não reconhecidos em "Status de integridade" (contam como Não avaliado): ' +
      listaOuNenhuma_(d.valoresIntegridadeDesconhecidos.map(function (v) { return 'linha ' + v.linha + ' = "' + v.valor + '"'; })));
  log('  valores não reconhecidos em "Via de governança" (contam como A definir): ' +
      listaOuNenhuma_(d.valoresViaDesconhecidos.map(function (v) { return 'linha ' + v.linha + ' = "' + v.valor + '"'; })));

  log('');
  log('===== FIM =====');
  imprimirEmBlocos_(linhas);
}

/* ---------------- testarMatching ---------------- */

// Demanda fictícia para teste (seção 12, etapa 2).
var DEMANDA_EXEMPLO_ = {
  nome: 'Pesquisador(a) de teste',
  email: 'teste@fiocruz.br',
  unidade: 'ILMD – Fiocruz Amazônia',
  unidadeOutra: '',
  titulo: 'Vigilância integrada de arboviroses com dados climáticos em municípios amazônicos',
  resumo: 'O projeto propõe um sistema de vigilância integrada de dengue, chikungunya, Zika e Oropouche que combina ' +
    'notificações do SUS, vigilância entomológica e dados climáticos (chuva, temperatura e nível dos rios) para ' +
    'gerar alertas antecipados em municípios do Amazonas. Inclui painéis para as secretarias municipais de saúde, ' +
    'modelos preditivos validados com séries históricas e formação de equipes locais para uso contínuo da ferramenta.',
  problema: 'Surtos de arboviroses na Amazônia são detectados tarde, porque os dados clínicos, entomológicos e ' +
    'climáticos estão dispersos e os municípios têm pouca capacidade analítica.',
  objetivos: 'Integrar bases de dados de saúde e clima; desenvolver e validar modelos de alerta precoce; ' +
    'implantar painéis em 10 municípios; capacitar 60 profissionais das vigilâncias municipais.',
  areas: ['Arboviroses e vetores', 'Clima e saúde', 'Vigilância em saúde'],
  abrangencia: 'Estado do Amazonas (10 municípios, incluindo áreas ribeirinhas e de fronteira com Colômbia e Peru)',
  maturidade: 'Projeto estruturado',
  valorEstimado: 'R$ 1–5 milhões',
  horizonte: '6–12 meses',
  parceiros: 'Colaboração informal com a London School of Hygiene & Tropical Medicine em modelagem climática.',
  idiomas: ['Português', 'Inglês', 'Espanhol']
};

/**
 * Roda o matching de ponta a ponta com a demanda de exemplo. GASTA CRÉDITOS DA API.
 * Mostra no log: candidatos enviados, tempo, tokens, custo estimado e os cards.
 */
function testarMatching() {
  var cfg = obterConfigMatching_();
  var hoje = hojeSaoPaulo_();
  var base = carregarBaseMatching_(cfg, hoje);
  var candidatos = preselecionarCandidatos(DEMANDA_EXEMPLO_, base.candidatos, CONFIG_MATCHING.MAX_CANDIDATOS);
  var financiadores = base.organizacoesParaIA;

  var linhas = [];
  var log = function (s) { linhas.push(s); };
  log('===== TESTE DE MATCHING (' + hoje + ') =====');
  log('Modelo: ' + cfg.modelo + ' | esforço: ' + cfg.esforco + ' | max_tokens: ' + cfg.maxTokens +
      ' | prompt: ' + PROMPT_VERSAO);
  log('Oportunidades enviadas: ' + candidatos.length + ' (de ' + base.candidatos.length + ' candidatas)' +
      ' | financiadores enviados: ' + financiadores.length);
  log('Tamanho da mensagem: ' + montarMensagemMatching(DEMANDA_EXEMPLO_, candidatos, financiadores).length + ' caracteres');

  var inicio = Date.now();
  var r;
  try {
    r = executarMatchingIA_(cfg, DEMANDA_EXEMPLO_, candidatos, financiadores);
  } catch (e) {
    imprimirEmBlocos_(linhas);
    throw e;
  }
  var segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  var entrada = 0, saida = 0;
  r.uso.forEach(function (u) { entrada += u.input_tokens || 0; saida += u.output_tokens || 0; });
  log('Tempo: ' + segundos + ' s | tentativas: ' + r.tentativas +
      ' | tokens de entrada: ' + entrada + ' | de saída (inclui raciocínio): ' + saida);
  if (cfg.modelo === 'claude-sonnet-5') {
    log('Custo estimado: US$ ' + ((entrada * 2 + saida * 10) / 1e6).toFixed(4) + ' (US$ 2 / US$ 10 por milhão de tokens)');
  }

  var res = r.resultado;
  log('');
  log('Resumo da demanda: ' + res.resumo_demanda);
  log('Para melhorar o matching: ' + (res.lacunas_da_demanda.join(' | ') || '—'));

  var porId = {};
  candidatos.forEach(function (o) { porId[o.id] = o; });
  log('');
  log('--- OPORTUNIDADES (' + res.oportunidades.length + ') ---');
  res.oportunidades.forEach(function (item) {
    var o = porId[item.id];
    log('');
    log('[' + item.nota + ' · ' + seloAderencia(item.nota) + '] ' + o.edital + ' — ' + o.financiador + ' (' + o.id + ')');
    log('  ' + o.prazo.texto + ' | Valores: ' + (o.valores || '—') + ' | Duração: ' + (o.duracao || '—'));
    log('  Integridade: ' + o.integridade + ' | Via: ' + o.via + ' | Edital: ' + (o.linkEdital || '(sem link)'));
    log('  Critérios: ' + JSON.stringify(item.criterios));
    log('  Por que combina: ' + item.por_que_combina);
    log('  Lacunas e riscos: ' + item.lacunas_e_riscos);
    if (item.requisitos_criticos.length) log('  Requisitos críticos: ' + item.requisitos_criticos.join(' | '));
    log('  Próximo passo: ' + item.proximo_passo);
  });

  var porNome = {};
  financiadores.forEach(function (g) { porNome[g.organizacao] = g; });
  log('');
  log('--- FINANCIADORES (' + res.financiadores.length + ') ---');
  res.financiadores.forEach(function (item) {
    var g = porNome[item.organizacao];
    log('');
    log('[' + item.nota + ' · ' + seloAderencia(item.nota) + '] ' + g.organizacao + ' (' + (g.pais || 'país não informado') + ')');
    log('  Integridade: ' + g.integridade + ' | Website: ' + (g.website || '(sem site)'));
    log('  Por que combina: ' + item.por_que_combina);
    log('  Como abordar: ' + item.como_abordar);
  });

  log('');
  log('===== FIM =====');
  imprimirEmBlocos_(linhas);
}


var TAMANHO_BLOCO_LOG_ = 6000; // o Apps Script corta cada console.log em ~8 KB

/**
 * Imprime as linhas em vários console.log de até ~6.000 caracteres, quebrando
 * entre linhas. Uma linha maior que o bloco é dividida em pedaços.
 */
function imprimirEmBlocos_(linhas) {
  var blocos = [], atual = '';
  var fechar = function () { if (atual) { blocos.push(atual); atual = ''; } };
  (linhas || []).forEach(function (linha) {
    var s = String(linha);
    while (s.length > TAMANHO_BLOCO_LOG_) {
      fechar();
      blocos.push(s.slice(0, TAMANHO_BLOCO_LOG_));
      s = s.slice(TAMANHO_BLOCO_LOG_);
    }
    if (atual && atual.length + 1 + s.length > TAMANHO_BLOCO_LOG_) fechar();
    atual = atual ? atual + '\n' + s : s;
  });
  fechar();
  blocos.forEach(function (b) { console.log(b); });
}

function listaOuNenhuma_(lista) {
  return (lista && lista.length) ? lista.join(', ') : 'nenhuma';
}

function resumirTexto_(s, max) {
  var t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

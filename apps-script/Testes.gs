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
 * testarMatching() será adicionada na etapa 2.
 */

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
  console.log(linhas.join('\n'));
}

function listaOuNenhuma_(lista) {
  return (lista && lista.length) ? lista.join(', ') : 'nenhuma';
}

function resumirTexto_(s, max) {
  var t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

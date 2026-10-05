// Login por código, passe, aba Acessos, lista de oportunidades e avaliação de um edital escolhido.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../apps-script/Acesso.gs');
const C = require('../apps-script/Catalogo.gs');
const { criarContexto, criarAba, respostaClaude, montarPlanilha, envioValido } = require('./ambiente');

const LOGIN = { props: { LOGIN_ATIVO: 'sim' } };
const DIA = 24 * 60 * 60 * 1000;

function postar(ctx, corpo) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(corpo) } }).conteudo);
}

/** Pede o código, lê o e-mail enviado e entra. Devolve a resposta de "entrar". */
function entrar(ctx, emails, email = 'maria@fiocruz.br') {
  const r1 = postar(ctx, { acao: 'codigo', email, site: '', turnstileToken: '' });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  const codigo = emails[emails.length - 1].subject.match(/(\d{6})$/)[1];
  return postar(ctx, { acao: 'entrar', email, codigo, site: '' });
}

function eventos(abas) {
  return (abas.Acessos ? abas.Acessos.matriz.slice(1) : []).map(l => l[2]);
}

// ---------------- funções puras ----------------

test('emailPermitidoParaLogin: domínio exato, endereço liberado e bloqueio', () => {
  assert.equal(A.emailPermitidoParaLogin('maria@fiocruz.br', ['fiocruz.br']), true);
  assert.equal(A.emailPermitidoParaLogin('Maria@Fiocruz.br', ['fiocruz.br']), true);
  assert.equal(A.emailPermitidoParaLogin('maria@ioc.fiocruz.br', ['fiocruz.br']), false);
  assert.equal(A.emailPermitidoParaLogin('maria@fiocruz.br.evil.com', ['fiocruz.br']), false);
  assert.equal(A.emailPermitidoParaLogin('x@gmail.com', ['fiocruz.br', 'bmuniz@gmail.com']), false);
  assert.equal(A.emailPermitidoParaLogin('bmuniz@gmail.com', ['fiocruz.br', 'bmuniz@gmail.com']), true);
  assert.equal(A.emailPermitidoParaLogin('maria@fiocruz.br', ['fiocruz.br'], ['maria@fiocruz.br']), false);
  assert.equal(A.emailPermitidoParaLogin('a@b@fiocruz.br', ['fiocruz.br']), false);
});

test('codigoDeHex: sempre 6 dígitos', () => {
  assert.equal(A.codigoDeHex('000000000000'), '000000');
  assert.equal(A.codigoDeHex('ffffffffffff'), String(0xffffffffffff % 1000000).padStart(6, '0'));
  for (let i = 0; i < 50; i++) {
    assert.match(A.codigoDeHex(require('node:crypto').randomUUID().replace(/-/g, '')), /^\d{6}$/);
  }
});

test('iguaisEmTempoConstante', () => {
  assert.equal(A.iguaisEmTempoConstante('abc', 'abc'), true);
  assert.equal(A.iguaisEmTempoConstante('abc', 'abd'), false);
  assert.equal(A.iguaisEmTempoConstante('abc', 'abcd'), false);
});

test('linhasDeAcessoVencidas: conta do início até a primeira linha recente', () => {
  const limite = new Date(2025, 9, 1);
  assert.equal(A.linhasDeAcessoVencidas([new Date(2024, 0, 1), '15/09/2025 10:00:00', new Date(2025, 9, 2), new Date(2020, 0, 1)], limite), 2);
  assert.equal(A.linhasDeAcessoVencidas([], limite), 0);
  assert.equal(A.linhasDeAcessoVencidas(['texto'], limite), 0);
});

test('ordenarCatalogo: prazo curto e abertos primeiro, encerrados por último', () => {
  const c = (id, status, data = '') => ({ id, financiador: id, edital: id, prazo_status: status, prazo_data: data });
  const lista = C.ordenarCatalogo([
    c('enc-antigo', 'encerrado', '01/01/2025'), c('continuo', 'continuo'), c('aberto-tarde', 'aberto', '01/12/2026'),
    c('enc-recente', 'encerrado', '01/06/2026'), c('curto', 'prazo_curto', '10/10/2026'), c('aberto-cedo', 'aberto', '01/11/2026'),
    c('confirmar', 'a_confirmar'), c('ciclos', 'ciclos')
  ]);
  assert.deepEqual(lista.map(x => x.id),
    ['curto', 'aberto-cedo', 'aberto-tarde', 'ciclos', 'continuo', 'confirmar', 'enc-recente', 'enc-antigo']);
});

// ---------------- lista de oportunidades ----------------

test('lista de oportunidades: só ativas e não vedadas, sem colunas internas', () => {
  const { ctx } = criarContexto(montarPlanilha());
  const r = postar(ctx, { acao: 'oportunidades' });
  assert.equal(r.ok, true);
  assert.equal(r.login, false);
  assert.deepEqual(r.oportunidades.map(o => o.id), ['LINHA-3', 'OPP-0001']);   // contínuo antes de encerrado
  assert.deepEqual(Object.keys(r.oportunidades[1]).sort(), ['duracao', 'edital', 'financiador', 'id', 'integridade',
    'integridade_aviso', 'link_edital', 'prazo_data', 'prazo_status', 'prazo_texto', 'resumo', 'tema', 'valores', 'via_governanca']);
  const json = JSON.stringify(r);
  for (const interno of ['SEGREDO-PONTO-FOCAL', 'pessoa@exemplo.org', 'docs.google.com/interno', 'Vedada', 'Grand Challenges']) {
    assert.ok(!json.includes(interno), interno);
  }
  assert.equal(r.oportunidades[1].link_edital, 'https://wellcome.org/edital');
});

test('lista de oportunidades: campos desconhecidos são recusados', () => {
  const { ctx } = criarContexto(montarPlanilha());
  assert.equal(postar(ctx, { acao: 'oportunidades', x: 1 }).ok, false);
  assert.equal(postar(ctx, { acao: 'inventada' }).ok, false);
});

// ---------------- login ----------------

test('login ligado: sem passe, nenhuma ação passa (e a IA não é chamada)', () => {
  const { ctx, requisicoes } = criarContexto(montarPlanilha(), [], LOGIN);
  for (const corpo of [
    { acao: 'oportunidades' },
    envioValido(),
    envioValido({ passe: 'maria@fiocruz.br|9999999999999|' + 'a'.repeat(43) }),
    { acao: 'extrair', email: 'maria@fiocruz.br', consentimentoArquivo: true, arquivo: { tipo: 'texto', conteudo: 'x'.repeat(100) } },
    { acao: 'proposta', parte: 1, demanda: envioValido(), idOportunidade: 'OPP-0001', idioma: 'Português' }
  ]) {
    const r = postar(ctx, corpo);
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'login', JSON.stringify(corpo).slice(0, 60));
  }
  assert.equal(requisicoes.length, 0);
});

test('login: LOGIN_ATIVO vazio conta como ligado; "nao" desliga', () => {
  assert.equal(criarContexto(montarPlanilha(), [], { props: { LOGIN_ATIVO: '' } }).ctx.obterConfigMatching_().loginAtivo, true);
  assert.equal(criarContexto(montarPlanilha(), [], { props: { LOGIN_ATIVO: 'não' } }).ctx.obterConfigMatching_().loginAtivo, false);
});

test('login: código por e-mail, passe e registro na aba Acessos', () => {
  const abas = montarPlanilha();
  const { ctx, emails, cache } = criarContexto(abas, [], LOGIN);
  const r1 = postar(ctx, { acao: 'codigo', email: ' Maria@Fiocruz.br ', site: '', turnstileToken: '' });
  assert.equal(r1.ok, true);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'maria@fiocruz.br');
  const codigo = emails[0].subject.match(/(\d{6})$/)[1];
  assert.match(emails[0].htmlBody, new RegExp(codigo));
  assert.ok(!JSON.stringify(cache).includes(codigo), 'o código não fica guardado em texto');

  const r2 = postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: codigo.slice(0, 3) + ' ' + codigo.slice(3), site: '' });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(r2.email, 'maria@fiocruz.br');
  assert.match(r2.passe, /^maria@fiocruz\.br\|\d+\|[A-Za-z0-9_-]+$/);

  // O login já traz a lista (um pedido a menos), sem colunas internas.
  assert.equal(r2.login, true);
  assert.deepEqual(r2.oportunidades.map(o => o.id), ['LINHA-3', 'OPP-0001']);
  assert.ok(!JSON.stringify(r2).includes('SEGREDO-PONTO-FOCAL'));

  // Repetir "entrar" com o mesmo código logo depois (resposta perdida no caminho) devolve o mesmo passe,
  // sem novo registro. Passados 3 minutos, o código não vale mais.
  const repetido = postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo, site: '' });
  assert.equal(repetido.passe, r2.passe);
  Object.keys(cache).filter(k => k.startsWith('ENTRADA_')).forEach(k => delete cache[k]);
  assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo, site: '' }).erro, /expirou/);
  // Código errado não aproveita a resposta guardada.
  assert.equal(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: codigo === '000000' ? '111111' : '000000', site: '' }).ok, false);

  const r3 = postar(ctx, { acao: 'oportunidades', passe: r2.passe });
  assert.equal(r3.ok, true);
  assert.equal(r3.login, true);
  assert.equal(r3.email, 'maria@fiocruz.br');

  assert.deepEqual(abas.Acessos.matriz[0], ['Data/hora', 'E-mail', 'Evento', 'Detalhe']);
  // A lista logo depois do login não ganha linha própria (o login já foi registrado).
  assert.deepEqual(eventos(abas), ['Código enviado', 'Login confirmado']);
  assert.equal(Object.prototype.toString.call(abas.Acessos.matriz[1][0]), '[object Date]');
  assert.equal(abas.Acessos.matriz[1][1], 'maria@fiocruz.br');
});

test('lista: registrada no máximo a cada 6 horas por e-mail', () => {
  const abas = montarPlanilha();
  const { ctx } = criarContexto(abas, [], LOGIN);
  const passe = ctx.emitirPasse_('maria@fiocruz.br', Date.now()).passe;
  postar(ctx, { acao: 'oportunidades', passe });
  postar(ctx, { acao: 'oportunidades', passe });
  assert.deepEqual(eventos(abas), ['Lista de oportunidades']);
});

test('planilha: cada aba é lida de uma vez (não coluna por coluna)', () => {
  const abas = montarPlanilha();
  const leituras = {};
  for (const nome of ['Oportunidades', 'Organizações']) {
    const original = abas[nome].getRange;
    abas[nome].getRange = (...args) => {
      const r = original(...args);
      for (const m of ['getValues', 'getDisplayValues', 'getRichTextValues']) {
        const f = r[m];
        r[m] = () => { leituras[nome] = (leituras[nome] || 0) + 1; return f(); };
      }
      return r;
    };
  }
  const { ctx } = criarContexto(abas);
  ctx.carregarBaseMatching_(ctx.obterConfigMatching_(), '2026-09-25');
  // cabeçalho + todos os textos + uma leitura por coluna de data ou de link
  assert.equal(leituras.Oportunidades, 4);
  assert.equal(leituras['Organizações'], 3);
});

test('login: e-mail fora dos domínios não recebe código', () => {
  const abas = montarPlanilha();
  const { ctx, emails } = criarContexto(abas, [], LOGIN);
  for (const email of ['x@gmail.com', 'x@ioc.fiocruz.br', 'x@fiocruz.br.com']) {
    const r = postar(ctx, { acao: 'codigo', email, site: '', turnstileToken: '' });
    assert.equal(r.ok, false);
    assert.match(r.erro, /não tem acesso/);
  }
  assert.equal(emails.length, 0);
  assert.deepEqual(eventos(abas), ['Acesso recusado', 'Acesso recusado', 'Acesso recusado']);
});

test('login: endereço liberado em DOMINIOS_LOGIN e e-mail bloqueado', () => {
  const props = { LOGIN_ATIVO: 'sim', DOMINIOS_LOGIN: 'fiocruz.br, bmuniz@gmail.com', EMAILS_BLOQUEADOS: 'joao@fiocruz.br' };
  const { ctx, emails } = criarContexto(montarPlanilha(), [], { props });
  assert.equal(entrar(ctx, emails, 'bmuniz@gmail.com').ok, true);
  assert.equal(postar(ctx, { acao: 'codigo', email: 'joao@fiocruz.br', site: '', turnstileToken: '' }).ok, false);
});

test('login: 5 códigos errados invalidam o código', () => {
  const abas = montarPlanilha();
  const { ctx, emails } = criarContexto(abas, [], LOGIN);
  postar(ctx, { acao: 'codigo', email: 'maria@fiocruz.br', site: '', turnstileToken: '' });
  const certo = emails[0].subject.match(/(\d{6})$/)[1];
  const errado = certo === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 4; i++) {
    assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: errado, site: '' }).erro, /incorreto/);
  }
  assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: errado, site: '' }).erro, /Muitas tentativas/);
  assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: certo, site: '' }).erro, /expirou/);
  assert.deepEqual(eventos(abas).filter(e => e !== 'Código incorreto'), ['Código enviado', 'Código bloqueado']);
});

test('login: entradas malformadas', () => {
  const { ctx } = criarContexto(montarPlanilha(), [], LOGIN);
  assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: '12a456', site: '' }).erro, /6 números/);
  assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: '123456', site: '', x: 1 }).erro, /Não foi possível ler/);
  assert.match(postar(ctx, { acao: 'codigo', email: 'maria@fiocruz.br', site: 'robo', turnstileToken: '' }).erro, /confirmar/);
  assert.match(postar(ctx, { acao: 'codigo', email: 'invalido', site: '', turnstileToken: '' }).erro, /e-mail válido/);
});

test('login: limite de 5 códigos por e-mail em 24 h e cota de e-mails esgotada', () => {
  let { ctx, emails } = criarContexto(montarPlanilha(), [], LOGIN);
  for (let i = 0; i < 5; i++) assert.equal(postar(ctx, { acao: 'codigo', email: 'maria@fiocruz.br', site: '', turnstileToken: '' }).ok, true);
  assert.match(postar(ctx, { acao: 'codigo', email: 'maria@fiocruz.br', site: '', turnstileToken: '' }).erro, /muitos códigos/);
  assert.equal(emails.length, 5);

  ({ ctx, emails } = criarContexto(montarPlanilha(), [], Object.assign({ cotaEmail: 0 }, LOGIN)));
  assert.match(postar(ctx, { acao: 'codigo', email: 'maria@fiocruz.br', site: '', turnstileToken: '' }).erro, /limite diário/);
  assert.equal(emails.length, 0);
});

test('passe: adulterado, vencido ou de e-mail bloqueado é recusado', () => {
  const { ctx, emails } = criarContexto(montarPlanilha(), [], LOGIN);
  const { passe } = entrar(ctx, emails);
  const [, validade, assinatura] = passe.split('|');
  const recusados = [
    'joao@fiocruz.br|' + validade + '|' + assinatura,                       // outro e-mail com a mesma assinatura
    'maria@fiocruz.br|' + (Number(validade) + 1000) + '|' + assinatura,     // validade estendida
    ctx.emitirPasse_('maria@fiocruz.br', Date.now() - 31 * DIA).passe,     // vencido
    ctx.emitirPasse_('maria@fiocruz.br', Date.now() + 10 * DIA).passe,     // validade impossível (mais de 31 dias)
    ctx.emitirPasse_('x@gmail.com', Date.now()).passe,                     // e-mail fora dos domínios
    '', 'lixo', 12345
  ];
  for (const p of recusados) assert.equal(postar(ctx, { acao: 'oportunidades', passe: p }).codigo, 'login', String(p));
  assert.equal(postar(ctx, { acao: 'oportunidades', passe }).ok, true);
  // Apagar SEGREDO_PASSE desconecta todo mundo.
  ctx.PropertiesService.getScriptProperties().deleteProperty('SEGREDO_PASSE');
  assert.equal(postar(ctx, { acao: 'oportunidades', passe }).codigo, 'login');
});

test('passe: o e-mail que vale é o do passe, não o digitado', () => {
  const abas = montarPlanilha();
  const { ctx, emails, requisicoes } = criarContexto(abas, [respostaClaude({
    resumo_demanda: 'x', lacunas_da_demanda: [], oportunidades: [], financiadores: []
  })], LOGIN);
  const { passe } = entrar(ctx, emails);
  const r = postar(ctx, envioValido({ email: 'outra.pessoa@fiocruz.br', passe }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const cab = abas.Demandas.matriz[0];
  assert.equal(abas.Demandas.matriz[1][cab.indexOf('E-mail')], 'maria@fiocruz.br');
  assert.ok(!JSON.stringify(requisicoes[0].corpo).includes('maria@fiocruz.br'), 'e-mail não vai para a IA');
  assert.ok(emails.some(m => m.to === 'maria@fiocruz.br' && /Recebemos/.test(m.subject)));
  assert.ok(!emails.some(m => m.to === 'outra.pessoa@fiocruz.br'));
  assert.deepEqual(eventos(abas), ['Código enviado', 'Login confirmado', 'Matching']);
});

test('limparAcessosAntigos: apaga só o que passou de RETENCAO_ACESSOS_MESES', () => {
  const abas = montarPlanilha();
  const agora = new Date();
  const mesesAtras = (n) => { const d = new Date(agora); d.setMonth(d.getMonth() - n); return d; };
  abas.Acessos = criarAba('Acessos', [
    ['Data/hora', 'E-mail', 'Evento', 'Detalhe'],
    [mesesAtras(24), 'a@fiocruz.br', 'Login confirmado', ''],
    [mesesAtras(13), 'b@fiocruz.br', 'Matching', ''],
    [mesesAtras(11), 'c@fiocruz.br', 'Matching', ''],
    [agora, 'd@fiocruz.br', 'Matching', '']
  ]);
  const { ctx } = criarContexto(abas);
  assert.equal(ctx.limparAcessosAntigos(), 2);
  assert.deepEqual(abas.Acessos.matriz.slice(1).map(l => l[1]), ['c@fiocruz.br', 'd@fiocruz.br']);
  assert.equal(ctx.limparAcessosAntigos(), 0);
});

// ---------------- avaliação de um edital escolhido ----------------

const AVALIACAO_IA = {
  resumo_demanda: 'Vigilância de arboviroses.',
  lacunas_da_demanda: [],
  oportunidades: [{ id: 'LINHA-3', nota: 25, criterios: { tematica: 10, elegibilidade: 5, porte: 5, maturidade: 3, viabilidade: 2 },
    por_que_combina: 'Pouco alinhado.', lacunas_e_riscos: 'Tema diferente.', requisitos_criticos: [], proximo_passo: 'Rever o foco.' }],
  financiadores: [{ organizacao: 'Wellcome Trust', nota: 90, por_que_combina: 'x', como_abordar: 'x' }]
};

test('avaliação de um edital: só ele vai para a IA e o card aparece mesmo com nota baixa', () => {
  const abas = montarPlanilha();
  // Aba Demandas antiga, sem a coluna "Edital avaliado": a coluna é criada à direita.
  const { ctx: c0 } = criarContexto({});
  const antigo = [...c0.CABECALHO_DEMANDAS].filter(c => c !== 'Edital avaliado');
  abas.Demandas = criarAba('Demandas', [antigo]);
  const { ctx, requisicoes, emails } = criarContexto(abas, [respostaClaude(AVALIACAO_IA)]);

  const r = postar(ctx, envioValido({ idOportunidade: 'LINHA-3' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado.individual, true);
  assert.equal(r.resultado.abertas.length, 1);
  assert.equal(r.resultado.abertas[0].id, 'LINHA-3');
  assert.equal(r.resultado.abertas[0].nota, 25);
  assert.equal(r.resultado.abertas[0].selo, 'Baixa aderência');
  assert.equal(r.resultado.financiadores.length, 0);

  const corpo = requisicoes[0].corpo;
  assert.match(corpo.system, /MODO DE AVALIAÇÃO INDIVIDUAL/);
  const msg = corpo.messages[0].content;
  assert.ok(msg.includes('LINHA-3') && !msg.includes('OPP-0001') && !msg.includes('Wellcome'));
  assert.match(msg, /<financiadores>\n\[\]\n<\/financiadores>/);

  const cab = abas.Demandas.matriz[0];
  assert.equal(cab[cab.length - 1], 'Edital avaliado');
  const linha = abas.Demandas.matriz[1];
  assert.match(linha[cab.indexOf('Edital avaliado')], /^LINHA-3 — Call X \(Unitaid\)$/);
  assert.equal(linha[cab.indexOf('Versão do prompt')], 'matching-v1+avaliacao-v1');

  assert.equal(emails.length, 1, 'só o Escritório recebe e-mail');
  assert.match(emails[0].subject, /Avaliação de edital/);
  assert.match(emails[0].htmlBody, /Edital avaliado/);
});

test('avaliação de um edital: edital inexistente, inativo ou vedado não chama a IA', () => {
  for (const id of ['OPP-9999', 'LINHA-5', 'LINHA-6', '', 'x'.repeat(41)]) {
    const { ctx, requisicoes } = criarContexto(montarPlanilha());
    const r = postar(ctx, envioValido({ idOportunidade: id }));
    assert.equal(r.ok, false, id);
    assert.equal(requisicoes.length, 0);
  }
});

test('avaliação de um edital: cota própria, separada da do matching', () => {
  const respostas = Array.from({ length: 11 }, () => respostaClaude(AVALIACAO_IA));
  const { ctx } = criarContexto(montarPlanilha(), respostas);
  for (let i = 0; i < 10; i++) assert.equal(postar(ctx, envioValido({ idOportunidade: 'LINHA-3' })).ok, true, 'avaliação ' + (i + 1));
  assert.match(postar(ctx, envioValido({ idOportunidade: 'LINHA-3' })).erro, /10 avaliações/);
  assert.equal(postar(ctx, envioValido()).ok, true, 'o matching completo continua liberado');
});

test('testarLogin() (editor): confere o passe e envia código ao Escritório', () => {
  const abas = montarPlanilha();
  const { ctx, logs, emails } = criarContexto(abas, [], LOGIN);
  ctx.testarLogin();
  const log = logs.join('\n');
  assert.match(log, /Passe de teste \(teste@fiocruz\.br\): ✓ aceito; passe adulterado: ✓ recusado/);
  assert.match(log, /Código enviado para escritorio@fiocruz\.br: ✓/);
  assert.equal(emails.length, 1);
  assert.ok(eventos(abas).includes('Teste do login'));
});

test('testarValidacao() e testarEnvioCompleto() funcionam com o login ligado', () => {
  const { ctx, logs } = criarContexto(montarPlanilha(), [respostaClaude({
    resumo_demanda: 'x', lacunas_da_demanda: [], oportunidades: [], financiadores: []
  })], LOGIN);
  ctx.testarValidacao();
  assert.ok(!logs.join('\n').includes('ACEITO'));
  assert.ok(!logs.join('\n').includes('sessão expirou'));
  ctx.testarEnvioCompleto();
  assert.match(logs.join('\n'), /ok: true/);
});

test('login: pedidos para e-mails sem acesso também contam no limite global (e não enchem a aba Acessos)', () => {
  const abas = montarPlanilha();
  const { ctx } = criarContexto(abas, [], LOGIN);
  for (let i = 0; i < 35; i++) postar(ctx, { acao: 'codigo', email: `robo${i}@exemplo.org`, site: '', turnstileToken: '' });
  assert.equal(eventos(abas).length, 30);
  assert.match(postar(ctx, { acao: 'codigo', email: 'maria@fiocruz.br', site: '', turnstileToken: '' }).erro, /Muitos pedidos/);
});

test('login: depois de entrar, palpites errados continuam limitados a 5', () => {
  const { ctx, emails } = criarContexto(montarPlanilha(), [], LOGIN);
  const r = entrar(ctx, emails);
  assert.equal(r.ok, true);
  const certo = emails[emails.length - 1].subject.match(/(\d{6})$/)[1];
  const errado = certo === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    const t = postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: errado, site: '' });
    assert.equal(t.ok, false);
    assert.equal(t.passe, undefined);
  }
  // Depois de 5 palpites errados, nem o código certo devolve o passe guardado.
  assert.match(postar(ctx, { acao: 'entrar', email: 'maria@fiocruz.br', codigo: certo, site: '' }).erro, /expirou/);
});

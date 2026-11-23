/*
 * filtros.js — filtros da lista de oportunidades (área temática, valor, moeda, via de governança).
 *
 * Funções puras, sem acesso à página: funcionam no navegador (window.FiltrosOportunidades) e no
 * Node (module.exports), para os testes.
 *
 * - Área temática: o edital entra numa área quando o tema, o nome ou o resumo citam uma das
 *   palavras da área (português e inglês, sem acento, início de palavra). Um edital pode ter várias.
 * - Valor: só para filtrar. O texto de "Valores" continua sendo exibido como está na planilha.
 *   Lê a moeda citada primeiro e o maior valor nessa moeda; a faixa vale NA MOEDA DO EDITAL
 *   (nada é convertido entre moedas).
 */
(function (raiz) {
  'use strict';

  /** Palavras de cada área (precisam bater com LISTAS.areas em app.js, menos "Outra"). */
  var PALAVRAS_AREAS = {
    'Doenças infecciosas e negligenciadas': ['doenca infecciosa', 'doencas infecciosas', 'negligenciad', 'neglected', 'infectious', 'tuberculos', 'malaria', 'leishmani', 'chagas', 'hanseniase', 'leprosy', 'hiv!', 'aids!', 'hepatite', 'hepatitis', 'antimicrobial resistance', 'resistencia antimicrobiana', 'epidemia', 'pandemi', 'epidemic'],
    'Arboviroses e vetores': ['arbovir', 'dengue', 'zika', 'chikungunya', 'aedes', 'mosquito', 'vetor', 'vector', 'entomolog'],
    'Microbiologia, virologia e parasitologia': ['microbiolog', 'virolog', 'parasitolog', 'parasit', 'bacteri', 'fungo', 'fungal', 'virus', 'patogen', 'pathogen'],
    'Imunidade e inflamação': ['imunolog', 'imunidade', 'immunolog', 'immunity', 'inflamac', 'inflammat', 'alergi', 'allerg'],
    'Doenças crônicas não transmissíveis': ['doencas cronicas', 'doenca cronica', 'nao transmissiveis', 'non-communicable', 'noncommunicable', 'ncd!', 'ncds!', 'chronic disease', 'cancer', 'oncolog', 'diabet', 'cardiovascular', 'hipertens', 'obesidade', 'obesity', 'medicina regenerativa', 'regenerative'],
    'Saúde mental, álcool e outras drogas': ['saude mental', 'mental health', 'alcool', 'alcohol', 'drogas', 'drug use', 'substance use', 'suicid', 'depress', 'psiquiatr'],
    'Saúde materno-infantil': ['materno', 'maternal', 'infantil', 'child', 'crianca', 'neonat', 'perinatal', 'gestante', 'pregnan', 'adolescen', 'newborn', 'nutricao infantil'],
    'Gênero, envelhecimento e saúde': ['genero', 'gender', 'mulher', 'women', 'idoso', 'envelhec', 'ageing', 'aging', 'older people', 'equidade de genero', 'lgbt'],
    'Alimentação e nutrição': ['aliment', 'nutric', 'nutrition', 'food', 'fome', 'hunger', 'seguranca alimentar'],
    'Pesquisa clínica e ensaios clínicos': ['pesquisa clinica', 'ensaio clinico', 'ensaios clinicos', 'clinical trial', 'clinical research', 'estudo clinico'],
    'Vacinas, biofármacos e insumos': ['vacina', 'vaccin', 'imuniza', 'immuniz', 'biofarmac', 'biologic', 'insumo', 'bio-manguinhos'],
    'Fármacos e medicamentos': ['farmac', 'medicament', 'drug discovery', 'drug development', 'pharmac', 'therapeutic', 'terapeut'],
    'Diagnósticos': ['diagnost', 'testagem', 'testing', 'point-of-care'],
    'Genômica, genética e biologia de sistemas': ['genomic', 'genomica', 'genetic', 'genetica', 'proteomic', 'sequenciamento', 'sequencing', 'bioinformat', 'biologia de sistemas', 'systems biology', 'biologia sintetica', 'synthetic biology'],
    'Nanotecnologia e novos materiais': ['nanotecnolog', 'nanotechnolog', 'nanomaterial', 'novos materiais', 'materials science'],
    'Processos industriais e produção em saúde': ['producao industrial', 'producao de vacinas', 'producao de medicamentos', 'manufactur', 'industrial', 'escalonamento', 'scale-up', 'complexo industrial', 'complexo produtivo'],
    'Inovação e desenvolvimento tecnológico': ['inovac', 'innovat', 'desenvolvimento tecnologico', 'technology development', 'tecnologia social', 'startup', 'empreendedor', 'transferencia de tecnologia', 'p&d!'],
    'Saúde digital e ciência de dados': ['saude digital', 'digital health', 'dados!', 'base de dados', 'data science', 'ciencia de dados', 'inteligencia artificial', 'artificial intelligence', 'machine learning', 'big data', 'software', 'telessaude', 'telemedic'],
    'Epidemiologia e métodos quantitativos': ['epidemiolog', 'estatistic', 'statistic', 'modelagem', 'modelling', 'modeling', 'coorte', 'cohort'],
    'Vigilância em saúde': ['vigilancia', 'surveillance', 'alerta precoce', 'early warning', 'preparedness', 'preparacao', 'one health', 'saude unica'],
    'Clima e saúde': ['clima', 'climat', 'aquecimento', 'warming', 'eventos extremos', 'extreme weather', 'enchente', 'flood', 'seca!', 'secas!', 'drought', 'calor!', 'heat!', 'heatwave'],
    'Biodiversidade e ambiente': ['biodivers', 'ambient', 'environment', 'ecolog', 'amazon', 'floresta', 'forest', 'saneamento', 'sanitation', 'agua!', 'aguas!', 'water', 'conservac'],
    'Sistemas e políticas de saúde': ['sistemas de saude', 'health system', 'sistema unico', 'sus!', 'politicas de saude', 'health policy', 'politica publica', 'public policy', 'atencao primaria', 'primary care', 'gestao em saude', 'cobertura universal', 'universal health'],
    'Avaliação e economia da saúde': ['economia da saude', 'health economic', 'avaliacao de tecnologias', 'health technology assessment', 'custo-efetiv', 'cost-effective', 'avaliacao de impacto', 'impact evaluation'],
    'Promoção da saúde': ['promocao da saude', 'health promotion', 'prevenc', 'prevention', 'qualidade de vida', 'well-being', 'wellbeing', 'bem-estar'],
    'Territórios, comunidades e determinantes sociais': ['territor', 'comunidade', 'communit', 'determinantes sociais', 'social determinants', 'favela', 'indigena', 'indigenous', 'quilombo', 'desigualdade', 'inequalit', 'equidade', 'equity', 'vulnerab', 'direitos humanos', 'human rights'],
    'Ciências humanas e sociais em saúde': ['ciencias humanas', 'ciencias sociais', 'social science', 'humanidades', 'humanities', 'antropolog', 'sociolog', 'historia', 'history', 'filosofia', 'cultura', 'culture', 'patrimonio', 'heritage'],
    'Informação e comunicação em saúde': ['comunicac', 'communicat', 'informacao em saude', 'health information', 'desinformac', 'misinformation', 'midia', 'media!'],
    'Educação e formação em saúde': ['educac', 'educat', 'formac', 'training', 'capacitac', 'capacity building', 'ensino', 'bolsa', 'fellowship', 'scholarship', 'mestrado', 'doutorado', 'phd', 'postdoc'],
    'Divulgação científica': ['divulgacao cientifica', 'science communication', 'public engagement', 'museu', 'museum', 'popularizac', 'educacao nao formal']
  };

  function semAcentos(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function escaparRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Cada palavra casa no início de uma palavra do texto ("vacina" casa "vacinação"); com "!" no fim,
  // só a palavra inteira ("sus!" não casa "sustentabilidade").
  var PADROES = {};
  Object.keys(PALAVRAS_AREAS).forEach(function (area) {
    var termos = PALAVRAS_AREAS[area].map(function (p) {
      return p.slice(-1) === '!' ? escaparRegex(p.slice(0, -1)) + '(?![a-z0-9])' : escaparRegex(p);
    });
    PADROES[area] = new RegExp('(^|[^a-z0-9])(' + termos.join('|') + ')', '');
  });

  /** Áreas temáticas que o edital cita no tema, no nome ou no resumo. */
  function areasDoEdital(o) {
    var texto = semAcentos([o && o.tema, o && o.edital, o && o.resumo].join(' '));
    return Object.keys(PADROES).filter(function (area) { return PADROES[area].test(texto); });
  }

  /* ---------------- valores ---------------- */

  var MOEDAS = [
    { codigo: 'BRL', nome: 'Real (R$)', marcas: /^(r\$|brl|reais|real)$/ },
    { codigo: 'USD', nome: 'Dólar (US$)', marcas: /^(us\$|u\$|usd|\$|dolares|dolar|dollars?)$/ },
    { codigo: 'EUR', nome: 'Euro (€)', marcas: /^(€|eur|euros?)$/ },
    { codigo: 'GBP', nome: 'Libra (£)', marcas: /^(£|gbp|libras?|pounds?)$/ }
  ];
  var NOMES_MOEDA = { BRL: 'Real (R$)', USD: 'Dólar (US$)', EUR: 'Euro (€)', GBP: 'Libra (£)', outra: 'Outra moeda', '': 'Sem valor informado' };

  var SIMBOLO = '(r\\$|us\\$|u\\$|usd|eur|gbp|brl|chf|cad|aud|jpy|€|£|¥|\\$)';
  var NUMERO = '(\\d[\\d.,]*)';
  var ESCALA = '(mil|k|mi|milh(?:ao|oes)|millions?|mln|m|bi|bilh(?:ao|oes)|billions?|bn|b)?';
  var ANTES = new RegExp(SIMBOLO + '\\s*' + NUMERO + '\\s*' + ESCALA + '(?![a-z])', 'g');
  var DEPOIS = new RegExp(NUMERO + '\\s*' + ESCALA + '\\s*(usd|eur|gbp|brl|chf|reais|dolares|euros|libras|dollars|pounds)(?![a-z])', 'g');

  function codigoDaMoeda(marca) {
    var m = semAcentos(marca).trim();
    for (var i = 0; i < MOEDAS.length; i++) if (MOEDAS[i].marcas.test(m)) return MOEDAS[i].codigo;
    return 'outra';
  }

  /** "1.500.000,00" → 1500000; "2,000,000" → 2000000; "1.5" → 1.5; "500.000" → 500000. */
  function numeroDoTexto(s) {
    var t = String(s).replace(/[.,]+$/, '');
    var ponto = t.lastIndexOf('.'), virgula = t.lastIndexOf(',');
    if (ponto >= 0 && virgula >= 0) {
      var decimal = ponto > virgula ? '.' : ',';
      var milhar = decimal === '.' ? ',' : '.';
      t = t.split(milhar).join('').replace(decimal, '.');
    } else if (ponto >= 0 || virgula >= 0) {
      var sep = ponto >= 0 ? '.' : ',';
      var partes = t.split(sep);
      var milhares = partes.length > 1 && partes.slice(1).every(function (p) { return p.length === 3; });
      t = milhares ? partes.join('') : partes.join('.');
    }
    var n = parseFloat(t);
    return isFinite(n) ? n : NaN;
  }

  function multiplicador(escala) {
    var e = semAcentos(escala || '');
    if (!e) return 1;
    if (e === 'mil' || e === 'k') return 1e3;
    if (/^(bi|bilh|billion|bn|b)/.test(e)) return 1e9;
    return 1e6; // mi, milhão, million, mln, m
  }

  /**
   * Moeda citada primeiro e o maior valor nessa moeda (na moeda do edital, sem conversão).
   * @return {{ moeda: string, valor: number }|null}  null se o texto não traz valor com moeda
   */
  function valorMaximo(texto) {
    var t = semAcentos(texto);
    var achados = [];
    var m;
    ANTES.lastIndex = 0;
    while ((m = ANTES.exec(t))) achados.push({ pos: m.index, moeda: codigoDaMoeda(m[1]), valor: numeroDoTexto(m[2]) * multiplicador(m[3]) });
    DEPOIS.lastIndex = 0;
    while ((m = DEPOIS.exec(t))) achados.push({ pos: m.index, moeda: codigoDaMoeda(m[3]), valor: numeroDoTexto(m[1]) * multiplicador(m[2]) });
    achados = achados.filter(function (a) { return isFinite(a.valor) && a.valor > 0; }).sort(function (a, b) { return a.pos - b.pos; });
    if (!achados.length) return null;
    var moeda = achados[0].moeda;
    var maior = 0;
    achados.forEach(function (a) { if (a.moeda === moeda && a.valor > maior) maior = a.valor; });
    // "US$ 20 mil a 50 mil": o segundo número sem símbolo também conta, com a escala dele.
    var semSimbolo = new RegExp('(?<![a-z])(?:a|ate|to|-|–)\\s*' + NUMERO + '\\s*' + ESCALA + '(?![a-z])', 'g');
    while ((m = semSimbolo.exec(t))) {
      var v = numeroDoTexto(m[1]) * multiplicador(m[2]);
      if (isFinite(v) && v > maior && m[2]) maior = v;
    }
    return { moeda: moeda, valor: maior };
  }

  var FAIXAS_VALOR = [
    { codigo: 'ate100mil', nome: 'Até 100 mil', teste: function (v) { return v <= 100000; } },
    { codigo: '100mil-1mi', nome: 'De 100 mil a 1 milhão', teste: function (v) { return v > 100000 && v <= 1000000; } },
    { codigo: 'acima1mi', nome: 'Acima de 1 milhão', teste: function (v) { return v > 1000000; } }
  ];

  /** Faixa do maior valor do edital, na moeda dele: 'ate100mil' | '100mil-1mi' | 'acima1mi' | 'nao_informado'. */
  function faixaDeValor(texto) {
    var v = valorMaximo(texto);
    if (!v) return 'nao_informado';
    for (var i = 0; i < FAIXAS_VALOR.length; i++) if (FAIXAS_VALOR[i].teste(v.valor)) return FAIXAS_VALOR[i].codigo;
    return 'nao_informado';
  }

  function moedaDoEdital(texto) {
    var v = valorMaximo(texto);
    return v ? v.moeda : '';
  }

  /** Via de governança normalizada para o filtro: 'presidencia' | 'unidades' | 'a_definir'. */
  function viaDoEdital(via) {
    var v = semAcentos(via);
    if (/orientac|institucional|presidenc/.test(v)) return 'presidencia';
    if (/direta|unidade/.test(v)) return 'unidades';
    return 'a_definir';
  }
  var NOMES_VIA = { presidencia: 'Orientação institucional (Presidência)', unidades: 'Captação direta (Unidades)', a_definir: 'A definir' };

  /**
   * Prepara os dados de filtro de cada edital uma vez (a lista é redesenhada a cada tecla).
   * @return {{ areas: string[], faixa: string, moeda: string, via: string }}
   */
  function dadosDeFiltro(o) {
    var v = valorMaximo(o && o.valores);
    var faixa = 'nao_informado';
    if (v) FAIXAS_VALOR.forEach(function (f) { if (f.teste(v.valor)) faixa = f.codigo; });
    return { areas: areasDoEdital(o), faixa: faixa, moeda: v ? v.moeda : '', via: viaDoEdital(o && o.via_governanca) };
  }

  /** O edital passa nos filtros escolhidos? Filtro vazio ('') não restringe. */
  function passaNosFiltros(d, f) {
    if (f.area && d.areas.indexOf(f.area) < 0) return false;
    if (f.valor && d.faixa !== f.valor) return false;
    if (f.moeda && d.moeda !== (f.moeda === 'sem' ? '' : f.moeda)) return false;
    if (f.via && d.via !== f.via) return false;
    return true;
  }

  /**
   * Opções de cada filtro com a contagem de editais, só com o que existe na lista.
   * @return {{ areas, valores, moedas, vias }}  listas de { valor, nome, total }
   */
  function opcoesDosFiltros(dados) {
    var conta = function (chave) {
      var c = {};
      dados.forEach(function (d) { [].concat(d[chave]).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); });
      return c;
    };
    var ca = conta('areas'), cf = conta('faixa'), cm = conta('moeda'), cv = conta('via');
    return {
      areas: Object.keys(PALAVRAS_AREAS).filter(function (a) { return ca[a]; }).map(function (a) { return { valor: a, nome: a, total: ca[a] }; }),
      valores: FAIXAS_VALOR.concat([{ codigo: 'nao_informado', nome: 'Valor não informado' }])
        .filter(function (f) { return cf[f.codigo]; }).map(function (f) { return { valor: f.codigo, nome: f.nome, total: cf[f.codigo] }; }),
      moedas: ['BRL', 'USD', 'EUR', 'GBP', 'outra', ''].filter(function (k) { return cm[k]; })
        .map(function (k) { return { valor: k || 'sem', nome: NOMES_MOEDA[k], total: cm[k] }; }),
      vias: ['presidencia', 'unidades', 'a_definir'].filter(function (k) { return cv[k]; })
        .map(function (k) { return { valor: k, nome: NOMES_VIA[k], total: cv[k] }; })
    };
  }

  var api = {
    PALAVRAS_AREAS: PALAVRAS_AREAS, areasDoEdital: areasDoEdital, numeroDoTexto: numeroDoTexto, valorMaximo: valorMaximo,
    faixaDeValor: faixaDeValor, moedaDoEdital: moedaDoEdital, viaDoEdital: viaDoEdital, dadosDeFiltro: dadosDeFiltro,
    passaNosFiltros: passaNosFiltros, opcoesDosFiltros: opcoesDosFiltros
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.FiltrosOportunidades = api;
})(typeof window !== 'undefined' ? window : this);

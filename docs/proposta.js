/*
 * proposta.js — monta as 4 abas do rascunho de proposta (fase 2B) para o XlsxSimples.
 *
 * Abas: Ficha de identificação · Marco lógico · Orçamento · Cronograma (Gantt), no idioma escolhido.
 * Entrada: dados do formulário (inclusive nome/e-mail, que ficam só no navegador), fatos do edital
 * (vindos da planilha pelo servidor) e as partes 1 e 2 geradas pela IA.
 * Todo texto entra como texto (nunca como fórmula); só os totais do orçamento são fórmulas.
 *
 * Funciona no navegador (window.PropostaXlsx) e no Node (module.exports), para os testes.
 */
(function (raiz) {
  'use strict';

  var IDIOMA_CODIGO = { 'Português': 'pt', 'Inglês': 'en', 'Espanhol': 'es', 'Francês': 'fr' };

  var T = {
    pt: {
      abas: ['Ficha de identificação', 'Marco lógico', 'Orçamento', 'Cronograma (Gantt)'],
      titulo: 'RASCUNHO DE PROPOSTA', gerado: 'Gerado em {data} pelo Fioconecta (Escritório de Captação da Fiocruz) com apoio de IA.',
      avisoGeral: 'RASCUNHO GERADO COM APOIO DE IA. Revise todo o conteúdo antes de usar: textos, indicadores, valores e prazos precisam ser conferidos pela equipe. Marcadores como [a definir] indicam informação que falta.',
      secProjeto: 'Projeto', secEdital: 'Edital', secIA: 'Conteúdo sugerido pela IA (revise)', secAvisos: 'Alertas da IA',
      titulo_: 'Título', unidade: 'Unidade Fiocruz', coordenacao: 'Coordenação', email: 'E-mail', areas: 'Áreas temáticas',
      abrangencia: 'Abrangência geográfica', maturidade: 'Estágio de maturidade', valor: 'Valor estimado necessário',
      horizonte: 'Horizonte de início', parceiros: 'Parceiros internacionais', idiomas: 'Idiomas de submissão',
      resumo: 'Resumo', problema: 'Problema ou necessidade', objetivos: 'Objetivos principais',
      financiador: 'Financiador', edital: 'Edital', link: 'Link do edital', prazo: 'Prazo', valores: 'Valores (conforme a base do Escritório)',
      duracaoEdital: 'Duração (edital)', duracaoUsada: 'Duração usada no rascunho',
      duracaoPadrao: '{n} meses (o edital não informa a duração; valor padrão — ajuste)', duracaoDoEdital: '{n} meses (tirada do edital)',
      objetivoGeral: 'Objetivo geral', objetivosEspecificos: 'Objetivos específicos', publico: 'Público beneficiário', justificativa: 'Aderência ao edital',
      marcoCab: ['Nível / código', 'Lógica de intervenção / resultado', 'Indicador SMART', 'Linha de base', 'Meta ao final ({n} meses)',
        'Fonte / meio de verificação', 'Frequência', 'Responsável', 'Marco de verificação', 'Pressupostos / riscos críticos'],
      niveis: { IMPACTO: 'IMPACTO', OUTCOME: 'OUTCOME', OUTPUT: 'OUTPUT' },
      orcCab: ['Rubrica', 'Descrição', 'Unidade', 'Quantidade', 'Custo unitário ({m})', 'Total ({m})'], ano: 'Ano {n}',
      totalGeral: 'TOTAL', porRubrica: 'Resumo por rubrica', moeda: 'Moeda: {m}', moedaPadrao: 'Moeda: BRL (o edital não indica a moeda com clareza — confira)',
      rubricasEdital: 'Rubricas: conforme indicadas no edital', rubricasPadrao: 'Rubricas: modelo padrão (o edital não indica rubricas)',
      avisoOrc: 'RASCUNHO ESTIMADO POR IA: revise todos os valores e confira o teto e as regras de elegibilidade do edital. Totais calculados por fórmula.',
      observacoes: 'Observações',
      ganttCab: ['Output', 'Código', 'Atividade', 'Período', 'Entregável verificável', 'Indicador', 'Responsável'],
      legenda: 'Barras = período de execução; ◆ = marco de verificação.',
      avisoDuracaoPadrao: 'ATENÇÃO: o edital não informa a duração do projeto. O cronograma usa {n} meses como padrão; ajuste à regra do edital.'
    },
    en: {
      abas: ['Project profile', 'Logical framework', 'Budget', 'Gantt chart'],
      titulo: 'DRAFT PROPOSAL', gerado: 'Generated on {data} by Fioconecta (Fiocruz Fundraising Office) with AI support.',
      avisoGeral: 'AI-ASSISTED DRAFT. Review all content before use: texts, indicators, amounts and dates must be checked by the team. Placeholders such as [to be defined] mark missing information.',
      secProjeto: 'Project', secEdital: 'Call for proposals', secIA: 'AI-suggested content (review)', secAvisos: 'AI alerts',
      titulo_: 'Title', unidade: 'Fiocruz unit', coordenacao: 'Project lead', email: 'E-mail', areas: 'Thematic areas',
      abrangencia: 'Geographic scope', maturidade: 'Maturity stage', valor: 'Estimated funding need',
      horizonte: 'Desired start', parceiros: 'International partners', idiomas: 'Submission languages',
      resumo: 'Summary', problema: 'Problem or need addressed', objetivos: 'Main objectives',
      financiador: 'Funder', edital: 'Call', link: 'Call link', prazo: 'Deadline', valores: 'Funding amounts (per the Office database)',
      duracaoEdital: 'Duration (call)', duracaoUsada: 'Duration used in this draft',
      duracaoPadrao: '{n} months (the call does not state a duration; default value — adjust)', duracaoDoEdital: '{n} months (from the call)',
      objetivoGeral: 'Overall objective', objetivosEspecificos: 'Specific objectives', publico: 'Beneficiaries', justificativa: 'Fit with the call',
      marcoCab: ['Level / code', 'Intervention logic / result', 'SMART indicator', 'Baseline', 'Target at end ({n} months)',
        'Source / means of verification', 'Frequency', 'Responsible', 'Verification milestone', 'Assumptions / critical risks'],
      niveis: { IMPACTO: 'IMPACT', OUTCOME: 'OUTCOME', OUTPUT: 'OUTPUT' },
      orcCab: ['Budget line', 'Description', 'Unit', 'Quantity', 'Unit cost ({m})', 'Total ({m})'], ano: 'Year {n}',
      totalGeral: 'TOTAL', porRubrica: 'Summary by budget line', moeda: 'Currency: {m}', moedaPadrao: 'Currency: BRL (the call does not state the currency clearly — check)',
      rubricasEdital: 'Budget lines: as indicated in the call', rubricasPadrao: 'Budget lines: default model (the call does not specify)',
      avisoOrc: 'AI-ESTIMATED DRAFT: review all amounts and check the call ceiling and eligibility rules. Totals are calculated by formula.',
      observacoes: 'Notes',
      ganttCab: ['Output', 'Code', 'Activity', 'Period', 'Verifiable deliverable', 'Indicator', 'Responsible'],
      legenda: 'Bars = implementation period; ◆ = verification milestone.',
      avisoDuracaoPadrao: 'NOTE: the call does not state the project duration. The schedule uses {n} months by default; adjust to the call rules.'
    },
    es: {
      abas: ['Ficha de identificación', 'Marco lógico', 'Presupuesto', 'Cronograma (Gantt)'],
      titulo: 'BORRADOR DE PROPUESTA', gerado: 'Generado el {data} por Fioconecta (Oficina de Captación de Fiocruz) con apoyo de IA.',
      avisoGeral: 'BORRADOR GENERADO CON APOYO DE IA. Revise todo el contenido antes de usarlo: textos, indicadores, montos y plazos deben ser verificados por el equipo. Marcadores como [por definir] indican información faltante.',
      secProjeto: 'Proyecto', secEdital: 'Convocatoria', secIA: 'Contenido sugerido por la IA (revisar)', secAvisos: 'Alertas de la IA',
      titulo_: 'Título', unidade: 'Unidad Fiocruz', coordenacao: 'Coordinación', email: 'Correo electrónico', areas: 'Áreas temáticas',
      abrangencia: 'Alcance geográfico', maturidade: 'Etapa de madurez', valor: 'Monto estimado necesario',
      horizonte: 'Inicio deseado', parceiros: 'Socios internacionales', idiomas: 'Idiomas de presentación',
      resumo: 'Resumen', problema: 'Problema o necesidad', objetivos: 'Objetivos principales',
      financiador: 'Financiador', edital: 'Convocatoria', link: 'Enlace de la convocatoria', prazo: 'Plazo', valores: 'Montos (según la base de la Oficina)',
      duracaoEdital: 'Duración (convocatoria)', duracaoUsada: 'Duración usada en el borrador',
      duracaoPadrao: '{n} meses (la convocatoria no indica la duración; valor por defecto — ajuste)', duracaoDoEdital: '{n} meses (según la convocatoria)',
      objetivoGeral: 'Objetivo general', objetivosEspecificos: 'Objetivos específicos', publico: 'Población beneficiaria', justificativa: 'Adecuación a la convocatoria',
      marcoCab: ['Nivel / código', 'Lógica de intervención / resultado', 'Indicador SMART', 'Línea de base', 'Meta al final ({n} meses)',
        'Fuente / medio de verificación', 'Frecuencia', 'Responsable', 'Hito de verificación', 'Supuestos / riesgos críticos'],
      niveis: { IMPACTO: 'IMPACTO', OUTCOME: 'RESULTADO', OUTPUT: 'PRODUCTO' },
      orcCab: ['Rubro', 'Descripción', 'Unidad', 'Cantidad', 'Costo unitario ({m})', 'Total ({m})'], ano: 'Año {n}',
      totalGeral: 'TOTAL', porRubrica: 'Resumen por rubro', moeda: 'Moneda: {m}', moedaPadrao: 'Moneda: BRL (la convocatoria no indica la moneda con claridad — verifique)',
      rubricasEdital: 'Rubros: según la convocatoria', rubricasPadrao: 'Rubros: modelo por defecto (la convocatoria no los indica)',
      avisoOrc: 'BORRADOR ESTIMADO POR IA: revise todos los montos y verifique el tope y las reglas de elegibilidad. Totales calculados por fórmula.',
      observacoes: 'Observaciones',
      ganttCab: ['Producto', 'Código', 'Actividad', 'Período', 'Entregable verificable', 'Indicador', 'Responsable'],
      legenda: 'Barras = período de ejecución; ◆ = hito de verificación.',
      avisoDuracaoPadrao: 'ATENCIÓN: la convocatoria no indica la duración. El cronograma usa {n} meses por defecto; ajuste a las reglas de la convocatoria.'
    },
    fr: {
      abas: ["Fiche d'identification", 'Cadre logique', 'Budget', 'Diagramme de Gantt'],
      titulo: 'PROJET DE PROPOSITION (BROUILLON)', gerado: 'Généré le {data} par Fioconecta (Bureau de collecte de fonds de la Fiocruz) avec l’appui de l’IA.',
      avisoGeral: 'BROUILLON PRODUIT AVEC L’APPUI DE L’IA. Vérifiez tout le contenu avant usage : textes, indicateurs, montants et délais doivent être validés par l’équipe. Les marqueurs comme [à définir] signalent des informations manquantes.',
      secProjeto: 'Projet', secEdital: 'Appel à propositions', secIA: 'Contenu suggéré par l’IA (à vérifier)', secAvisos: 'Alertes de l’IA',
      titulo_: 'Titre', unidade: 'Unité Fiocruz', coordenacao: 'Coordination', email: 'Courriel', areas: 'Domaines thématiques',
      abrangencia: 'Portée géographique', maturidade: 'Stade de maturité', valor: 'Financement estimé nécessaire',
      horizonte: 'Démarrage souhaité', parceiros: 'Partenaires internationaux', idiomas: 'Langues de soumission',
      resumo: 'Résumé', problema: 'Problème ou besoin', objetivos: 'Objectifs principaux',
      financiador: 'Bailleur', edital: 'Appel', link: 'Lien de l’appel', prazo: 'Date limite', valores: 'Montants (selon la base du Bureau)',
      duracaoEdital: 'Durée (appel)', duracaoUsada: 'Durée utilisée dans le brouillon',
      duracaoPadrao: '{n} mois (l’appel n’indique pas la durée ; valeur par défaut — à ajuster)', duracaoDoEdital: '{n} mois (selon l’appel)',
      objetivoGeral: 'Objectif général', objetivosEspecificos: 'Objectifs spécifiques', publico: 'Bénéficiaires', justificativa: 'Adéquation à l’appel',
      marcoCab: ['Niveau / code', 'Logique d’intervention / résultat', 'Indicateur SMART', 'Situation de référence', 'Cible à la fin ({n} mois)',
        'Source / moyen de vérification', 'Fréquence', 'Responsable', 'Jalon de vérification', 'Hypothèses / risques critiques'],
      niveis: { IMPACTO: 'IMPACT', OUTCOME: 'EFFET', OUTPUT: 'EXTRANT' },
      orcCab: ['Rubrique', 'Description', 'Unité', 'Quantité', 'Coût unitaire ({m})', 'Total ({m})'], ano: 'Année {n}',
      totalGeral: 'TOTAL', porRubrica: 'Récapitulatif par rubrique', moeda: 'Devise : {m}', moedaPadrao: 'Devise : BRL (l’appel n’indique pas clairement la devise — à vérifier)',
      rubricasEdital: 'Rubriques : selon l’appel', rubricasPadrao: 'Rubriques : modèle par défaut (l’appel ne les précise pas)',
      avisoOrc: 'BROUILLON ESTIMÉ PAR L’IA : vérifiez tous les montants, le plafond et les règles d’éligibilité de l’appel. Totaux calculés par formule.',
      observacoes: 'Observations',
      ganttCab: ['Extrant', 'Code', 'Activité', 'Période', 'Livrable vérifiable', 'Indicateur', 'Responsable'],
      legenda: 'Barres = période d’exécution ; ◆ = jalon de vérification.',
      avisoDuracaoPadrao: 'ATTENTION : l’appel n’indique pas la durée du projet. Le calendrier utilise {n} mois par défaut ; ajustez selon l’appel.'
    }
  };

  // Tradução das opções fechadas do formulário (os valores do formulário são em português).
  var OPCOES = {
    en: {
      'Doenças infecciosas e negligenciadas': 'Infectious and neglected diseases', 'Arboviroses e vetores': 'Arboviruses and vectors',
      'Vacinas, biofármacos e insumos': 'Vaccines, biopharmaceuticals and supplies', 'Clima e saúde': 'Climate and health',
      'Saúde materno-infantil': 'Maternal and child health', 'Saúde digital e ciência de dados': 'Digital health and data science',
      'Vigilância em saúde': 'Health surveillance', 'Sistemas e políticas de saúde': 'Health systems and policy',
      'Educação e formação em saúde': 'Health education and training', 'Territórios, comunidades e determinantes sociais': 'Territories, communities and social determinants',
      'Biodiversidade e ambiente': 'Biodiversity and environment', 'Inovação e desenvolvimento tecnológico': 'Innovation and technology development', 'Outra': 'Other',
      'Ideia inicial': 'Initial idea', 'Projeto estruturado': 'Structured project', 'Em execução, buscando ampliação': 'Ongoing, seeking expansion',
      'Solução pronta para escalar': 'Solution ready to scale',
      'Até R$ 250 mil': 'Up to BRL 250 thousand', 'R$ 250 mil–1 milhão': 'BRL 250 thousand–1 million', 'R$ 1–5 milhões': 'BRL 1–5 million',
      'Acima de R$ 5 milhões': 'Over BRL 5 million', 'Não sei': 'Unknown',
      'Até 6 meses': 'Within 6 months', '6–12 meses': '6–12 months', 'Mais de 12 meses': 'More than 12 months',
      'Português': 'Portuguese', 'Inglês': 'English', 'Espanhol': 'Spanish', 'Francês': 'French'
    },
    es: {
      'Doenças infecciosas e negligenciadas': 'Enfermedades infecciosas y desatendidas', 'Arboviroses e vetores': 'Arbovirosis y vectores',
      'Vacinas, biofármacos e insumos': 'Vacunas, biofármacos e insumos', 'Clima e saúde': 'Clima y salud',
      'Saúde materno-infantil': 'Salud materno-infantil', 'Saúde digital e ciência de dados': 'Salud digital y ciencia de datos',
      'Vigilância em saúde': 'Vigilancia en salud', 'Sistemas e políticas de saúde': 'Sistemas y políticas de salud',
      'Educação e formação em saúde': 'Educación y formación en salud', 'Territórios, comunidades e determinantes sociais': 'Territorios, comunidades y determinantes sociales',
      'Biodiversidade e ambiente': 'Biodiversidad y ambiente', 'Inovação e desenvolvimento tecnológico': 'Innovación y desarrollo tecnológico', 'Outra': 'Otra',
      'Ideia inicial': 'Idea inicial', 'Projeto estruturado': 'Proyecto estructurado', 'Em execução, buscando ampliação': 'En ejecución, buscando ampliación',
      'Solução pronta para escalar': 'Solución lista para escalar',
      'Até R$ 250 mil': 'Hasta BRL 250 mil', 'R$ 250 mil–1 milhão': 'BRL 250 mil–1 millón', 'R$ 1–5 milhões': 'BRL 1–5 millones',
      'Acima de R$ 5 milhões': 'Más de BRL 5 millones', 'Não sei': 'No sabe',
      'Até 6 meses': 'Hasta 6 meses', '6–12 meses': '6–12 meses', 'Mais de 12 meses': 'Más de 12 meses',
      'Português': 'Portugués', 'Inglês': 'Inglés', 'Espanhol': 'Español', 'Francês': 'Francés'
    },
    fr: {
      'Doenças infecciosas e negligenciadas': 'Maladies infectieuses et négligées', 'Arboviroses e vetores': 'Arboviroses et vecteurs',
      'Vacinas, biofármacos e insumos': 'Vaccins, biomédicaments et intrants', 'Clima e saúde': 'Climat et santé',
      'Saúde materno-infantil': 'Santé maternelle et infantile', 'Saúde digital e ciência de dados': 'Santé numérique et science des données',
      'Vigilância em saúde': 'Surveillance sanitaire', 'Sistemas e políticas de saúde': 'Systèmes et politiques de santé',
      'Educação e formação em saúde': 'Éducation et formation en santé', 'Territórios, comunidades e determinantes sociais': 'Territoires, communautés et déterminants sociaux',
      'Biodiversidade e ambiente': 'Biodiversité et environnement', 'Inovação e desenvolvimento tecnológico': 'Innovation et développement technologique', 'Outra': 'Autre',
      'Ideia inicial': 'Idée initiale', 'Projeto estruturado': 'Projet structuré', 'Em execução, buscando ampliação': 'En cours, en recherche d’extension',
      'Solução pronta para escalar': 'Solution prête à changer d’échelle',
      'Até R$ 250 mil': 'Jusqu’à 250 000 BRL', 'R$ 250 mil–1 milhão': '250 000–1 million BRL', 'R$ 1–5 milhões': '1–5 millions BRL',
      'Acima de R$ 5 milhões': 'Plus de 5 millions BRL', 'Não sei': 'Ne sait pas',
      'Até 6 meses': 'Sous 6 mois', '6–12 meses': '6–12 mois', 'Mais de 12 meses': 'Plus de 12 mois',
      'Português': 'Portugais', 'Inglês': 'Anglais', 'Espanhol': 'Espagnol', 'Francês': 'Français'
    }
  };

  function traduzir(cod, valor) {
    return (OPCOES[cod] && OPCOES[cod][valor]) || valor;
  }

  function fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ''; });
  }

  function texto(v, e) { return { v: v === undefined || v === null ? '' : String(v), e: e || 'texto' }; }

  /* ---------- aba 1: ficha ---------- */

  function abaFicha(d, t, cod) {
    var dem = d.demanda, f = d.parte1.ficha, ed = d.edital;
    var linhas = [], mesclar = [];
    var secao = function (titulo) { linhas.push([texto(titulo, 'cabecalho'), texto('', 'cabecalho')]); mesclar.push('A' + linhas.length + ':B' + linhas.length); };
    var campo = function (rotulo, valor) { linhas.push([texto(rotulo, 'rotulo'), texto(valor)]); };
    var lista = function (arr) { return (arr || []).map(function (x) { return traduzir(cod, x); }).join('; '); };

    linhas.push([texto(t.titulo + ' — ' + ed.edital, 'titulo')]); mesclar.push('A1:B1');
    linhas.push([texto(fmt(t.gerado, { data: d.geradoEm }), 'subtitulo')]); mesclar.push('A2:B2');
    linhas.push([texto(t.avisoGeral, 'aviso'), texto('', 'aviso')]); mesclar.push('A3:B3');
    linhas.push([]);

    secao(t.secProjeto);
    campo(t.titulo_, f.titulo || dem.titulo);
    campo(t.unidade, dem.unidade === 'Outra' ? traduzir(cod, 'Outra') + ': ' + dem.unidadeOutra : dem.unidade);
    campo(t.coordenacao, dem.nome);
    campo(t.email, dem.email);
    campo(t.areas, lista(dem.areas));
    campo(t.abrangencia, f.abrangencia || dem.abrangencia);
    campo(t.maturidade, traduzir(cod, dem.maturidade));
    campo(t.valor, traduzir(cod, dem.valorEstimado));
    campo(t.horizonte, traduzir(cod, dem.horizonte));
    campo(t.parceiros, f.parceiros || dem.parceiros || '—');
    campo(t.idiomas, lista(dem.idiomas));
    campo(t.resumo, f.resumo || dem.resumo);
    campo(t.problema, f.problema || dem.problema);
    campo(t.objetivos, f.objetivos || dem.objetivos);
    linhas.push([]);

    secao(t.secEdital);
    campo(t.financiador, ed.financiador);
    campo(t.edital, ed.edital);
    campo(t.link, ed.link || '—');
    campo(t.prazo, ed.prazo_texto);
    campo(t.valores, ed.valores || '—');
    campo(t.duracaoEdital, ed.duracao || '—');
    campo(t.duracaoUsada, fmt(d.duracao.origem === 'padrao' ? t.duracaoPadrao : t.duracaoDoEdital, { n: d.duracao.meses }));
    linhas.push([]);

    secao(t.secIA);
    campo(t.objetivoGeral, f.objetivo_geral);
    campo(t.objetivosEspecificos, (f.objetivos_especificos || []).map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n'));
    campo(t.publico, f.publico_beneficiario);
    campo(t.justificativa, f.justificativa_aderencia);

    var avisos = [].concat(d.parte1.avisos || [], d.parte2.avisos || []);
    if (avisos.length) {
      linhas.push([]);
      secao(t.secAvisos);
      avisos.forEach(function (a) { linhas.push([texto('•', 'rotulo'), texto(a)]); });
    }
    return { nome: t.abas[0], colunas: [34, 100], linhas: linhas, mesclar: mesclar, alturas: { 2: 42 } };
  }

  /* ---------- aba 2: marco lógico ---------- */

  function abaMarco(d, t) {
    var cab = t.marcoCab.map(function (c) { return texto(fmt(c, { n: d.duracao.meses }), 'cabecalho'); });
    var linhas = [
      [texto(t.abas[1] + ' — ' + d.edital.edital, 'titulo')],
      [texto(fmt(t.gerado, { data: d.geradoEm }), 'subtitulo')],
      [],
      cab
    ];
    d.parte1.marco.forEach(function (l) {
      linhas.push([
        texto((t.niveis[l.nivel] || l.nivel) + (l.codigo ? '\n' + l.codigo : ''), 'nivel'),
        texto(l.logica), texto(l.indicador), texto(l.linha_base), texto(l.meta), texto(l.fonte_verificacao),
        texto(l.frequencia), texto(l.responsavel), texto(l.marco_verificacao), texto(l.pressupostos)
      ]);
    });
    return {
      nome: t.abas[1], colunas: [16, 42, 34, 24, 26, 28, 14, 18, 16, 32], linhas: linhas,
      mesclar: ['A1:J1', 'A2:J2'], congelar: { linhas: 4, colunas: 1 }, alturas: { 3: 32 }
    };
  }

  /* ---------- aba 3: orçamento ---------- */

  function abaOrcamento(d, t) {
    var o = d.parte2.orcamento, X = raiz.XlsxSimples || (typeof require === 'function' ? require('./xlsx.js') : null);
    var nAnos = Math.ceil(d.duracao.meses / 12);
    var m = o.moeda;
    var ultimaCol = X.letraColuna(6 + nAnos - 1);
    var linhas = [
      [texto(t.abas[2] + ' — ' + d.edital.edital, 'titulo')],
      [texto((o.moeda_informada === false ? t.moedaPadrao : fmt(t.moeda, { m: m })) + ' · ' + (o.rubricas_do_edital ? t.rubricasEdital : t.rubricasPadrao), 'subtitulo')],
      [texto(t.avisoOrc, 'aviso')],
      []
    ];
    var mesclar = ['A1:' + ultimaCol + '1', 'A2:' + ultimaCol + '2', 'A3:' + ultimaCol + '3'];
    var cab = t.orcCab.map(function (c) { return texto(fmt(c, { m: m }), 'cabecalho'); });
    for (var a = 1; a <= nAnos; a++) cab.push(texto(fmt(t.ano, { n: a }) + ' (' + m + ')', 'cabecalho'));
    linhas.push(cab);

    var primeira = linhas.length + 1; // número da linha (1-based) do primeiro item
    o.linhas.forEach(function (l, i) {
      var n = primeira + i;
      var linha = [texto(l.rubrica), texto(l.descricao), texto(l.unidade), { v: l.quantidade, e: 'numero' },
        { v: l.custo_unitario, e: 'numero' }, { f: 'D' + n + '*E' + n, e: 'numero' }];
      for (var k = 0; k < nAnos; k++) linha.push({ v: l.por_ano[k] || 0, e: 'numero' });
      linhas.push(linha);
    });
    var ultima = primeira + o.linhas.length - 1;
    var total = [texto(t.totalGeral, 'totalRotulo'), texto('', 'total'), texto('', 'total'), texto('', 'total'), texto('', 'total'),
      { f: 'SUM(F' + primeira + ':F' + ultima + ')', e: 'total' }];
    for (var c = 0; c < nAnos; c++) {
      var col = X.letraColuna(6 + c);
      total.push({ f: 'SUM(' + col + primeira + ':' + col + ultima + ')', e: 'total' });
    }
    linhas.push(total);
    linhas.push([]);

    // Resumo por rubrica (SOMASE sobre a tabela acima)
    linhas.push([texto(t.porRubrica, 'cabecalho'), texto(fmt(t.orcCab[5], { m: m }), 'cabecalho')]);
    var rubricas = [];
    o.linhas.forEach(function (l) { if (rubricas.indexOf(l.rubrica) < 0) rubricas.push(l.rubrica); });
    rubricas.forEach(function (r) {
      var n = linhas.length + 1;
      linhas.push([texto(r, 'rotulo'), { f: 'SUMIF($A$' + primeira + ':$A$' + ultima + ',A' + n + ',$F$' + primeira + ':$F$' + ultima + ')', e: 'numero' }]);
    });

    if (o.observacoes && o.observacoes.length) {
      linhas.push([]);
      linhas.push([texto(t.observacoes, 'cabecalho')]);
      o.observacoes.forEach(function (ob) {
        linhas.push([texto(ob)]);
        mesclar.push('A' + linhas.length + ':' + ultimaCol + linhas.length);
      });
    }
    var colunas = [26, 42, 12, 11, 16, 17];
    for (var y = 0; y < nAnos; y++) colunas.push(16);
    return { nome: t.abas[2], colunas: colunas, linhas: linhas, mesclar: mesclar, congelar: { linhas: 5, colunas: 1 }, alturas: { 2: 30, 4: 30 } };
  }

  /* ---------- aba 4: Gantt ---------- */

  function abaGantt(d, t) {
    var X = raiz.XlsxSimples || (typeof require === 'function' ? require('./xlsx.js') : null);
    var meses = d.duracao.meses;
    var ultimaCol = X.letraColuna(7 + meses - 1);
    var linhas = [
      [texto(t.abas[3] + ' — ' + d.edital.edital, 'titulo')],
      [texto(t.legenda, 'subtitulo')]
    ];
    var mesclar = ['A1:' + ultimaCol + '1', 'A2:' + ultimaCol + '2'];
    if (d.duracao.origem === 'padrao') {
      linhas.push([texto(fmt(t.avisoDuracaoPadrao, { n: meses }), 'aviso')]);
      mesclar.push('A3:' + ultimaCol + '3');
    } else {
      linhas.push([]);
    }
    linhas.push([]);
    var cab = t.ganttCab.map(function (c) { return texto(c, 'cabecalho'); });
    for (var mm = 1; mm <= meses; mm++) cab.push(texto('M' + mm, 'mes'));
    linhas.push(cab);

    d.parte2.gantt.forEach(function (a) {
      var linha = [texto(a.output, 'nivel'), texto(a.codigo), texto(a.atividade), texto('M' + a.mes_inicio + '–M' + a.mes_fim),
        texto(a.entregavel), texto(a.indicador), texto(a.responsavel)];
      for (var mes = 1; mes <= meses; mes++) {
        if (a.marcos.indexOf(mes) >= 0) linha.push({ v: '◆', e: 'marco' });
        else if (mes >= a.mes_inicio && mes <= a.mes_fim) linha.push({ e: 'gantt' });
        else linha.push({ e: 'vazioBorda' });
      }
      linhas.push(linha);
    });
    var colunas = [9, 9, 46, 11, 30, 11, 20];
    for (var k = 0; k < meses; k++) colunas.push(4.6);
    return { nome: t.abas[3], colunas: colunas, linhas: linhas, mesclar: mesclar, congelar: { linhas: 5, colunas: 3 }, alturas: { 2: 30 } };
  }

  /**
   * @param {Object} d { idioma, geradoEm, demanda, edital, duracao, parte1: {ficha, marco, avisos}, parte2: {orcamento, gantt, avisos} }
   * @return {Object[]} abas para XlsxSimples.criar
   */
  function montarAbasProposta(d) {
    var cod = IDIOMA_CODIGO[d.idioma] || 'pt';
    var t = T[cod];
    return [abaFicha(d, t, cod), abaMarco(d, t), abaOrcamento(d, t), abaGantt(d, t)];
  }

  /** Nome do arquivo: Rascunho_proposta_<edital>.xlsx (sem acentos nem símbolos). */
  function nomeArquivoProposta(edital) {
    var base = String(edital || 'edital').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'edital';
    return 'Rascunho_proposta_' + base + '.xlsx';
  }

  /** Outputs do marco lógico (um por número de output), para a parte 2. */
  function outputsDoMarco(marco) {
    var vistos = {}, saida = [];
    (marco || []).forEach(function (l) {
      if (l.nivel !== 'OUTPUT') return;
      var num = String(l.codigo || '').split('.')[0].replace(/\D/g, '') || String(saida.length + 1);
      if (vistos[num]) return;
      vistos[num] = true;
      saida.push({ codigo: 'O' + num, descricao: String(l.logica).slice(0, 400) });
    });
    return saida.slice(0, 8);
  }

  var api = { montarAbasProposta: montarAbasProposta, nomeArquivoProposta: nomeArquivoProposta, outputsDoMarco: outputsDoMarco, TEXTOS: T };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PropostaXlsx = api;
})(this);

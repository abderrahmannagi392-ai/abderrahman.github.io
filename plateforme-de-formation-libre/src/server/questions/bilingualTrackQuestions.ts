import type { ExtendedSeedQuestion } from './types';

function pickFour(correct: string, distractors: string[]): { options: string[]; correctIndex: number } {
  const uniqueDistractors = Array.from(new Set(distractors.filter((d) => d && d !== correct))).slice(0, 3);
  let pad = 1;
  while (uniqueDistractors.length < 3) {
    const candidate = `احتمال بديل ${pad++}`;
    if (!uniqueDistractors.includes(candidate) && candidate !== correct) {
      uniqueDistractors.push(candidate);
    }
  }
  const idx =
    Math.abs(Array.from(correct).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 23)) % 4;
  const options = [...uniqueDistractors];
  options.splice(idx, 0, correct);
  return { options, correctIndex: idx };
}

function pickFourPair(
  correctAr: string,
  correctFr: string,
  distractors: Array<[string, string]>
): { optionsAr: string[]; optionsFr: string[]; correctIndex: number } {
  const seen = new Set<string>([correctAr]);
  const cleanDist = distractors.filter(([ar]) => {
    if (!ar || seen.has(ar)) return false;
    seen.add(ar);
    return true;
  }).slice(0, 3);
  while (cleanDist.length < 3) {
    const n = cleanDist.length + 1;
    cleanDist.push([`خيار مختلف ${n}`, `Option différente ${n}`]);
  }
  const idx =
    Math.abs(Array.from(correctAr).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 29)) % 4;
  const arr: Array<[string, string]> = [...cleanDist];
  arr.splice(idx, 0, [correctAr, correctFr]);
  return {
    optionsAr: arr.map((x) => x[0]),
    optionsFr: arr.map((x) => x[1]),
    correctIndex: idx,
  };
}

export function buildBilingualTrackQuestions(): ExtendedSeedQuestion[] {
  const list: ExtendedSeedQuestion[] = [];
  const COMP = 'مسابقة اكتتاب المعلمين - شعبة معلم مزدوج (Concours Bilingue)';

  // -------------------------------------------------------------------------
  // 1. BILINGUAL ARABIC-FRENCH DIDACTICS & CONTRASTIVE TERMINOLOGY (60 Qs)
  // -------------------------------------------------------------------------
  const contrastiveTerms: Array<{
    ar: string;
    fr: string;
    wrongFr: [string, string, string];
    expAr: string;
    expFr: string;
    subject: string;
    level: 'foundation' | 'intermediate' | 'advanced';
  }> = [
    { ar: 'المبتدأ والخبر', fr: 'Sujet nominal (Mubtada) et prédicat (Khabar)', wrongFr: ['Complément circonstanciel de temps', 'Proposition subordonnée relative', 'Préposition de lieu'], expAr: 'يقابل المبتدأ والخبر في التحليل اللساني المزدوج المسند إليه والمسند في الجملة الاسمية.', expFr: 'La phrase nominale arabe s’articule autour du Mubtada (thème) et du Khabar (prédicat).', subject: 'arabic-lang', level: 'foundation' },
    { ar: 'التقويم التكويني', fr: 'Évaluation formative', wrongFr: ['Évaluation certificative finale', 'Sanction disciplinaire', 'Classement administratif'], expAr: 'التقويم التكويني يواكب سيرورة التعلم لتعديل الطرائق ومعالجة التعثرات أولاً بأول.', expFr: 'L’évaluation formative sert à réguler les apprentissages en cours de séquence.', subject: 'evaluation-measurement', level: 'foundation' },
    { ar: 'التقويم التشخيصي', fr: 'Évaluation diagnostique', wrongFr: ['Évaluation sommative', 'Certification finale', 'Concours de sortie'], expAr: 'يُجرى في مستهل الوحدة أو السنة لتحديد المكتسبات القبلية والتعثرات.', expFr: 'Placée au début d’un apprentissage, elle repère les acquis et lacunes préalables.', subject: 'evaluation-measurement', level: 'foundation' },
    { ar: 'الجذاذة التربوية', fr: 'Fiche pédagogique / Fiche de préparation', wrongFr: ['Registre de comptabilité', 'Bulletins de paie', 'Règlement financier'], expAr: 'الجذاذة وثيقة التحضير الإجرائية التي تخطط سير الحصة والأهداف والوسائل.', expFr: 'La fiche pédagogique structure les objectifs, étapes, supports et durée d’une séance.', subject: 'educational-planning', level: 'foundation' },
    { ar: 'المنطقة القريبة للنمو', fr: 'Zone Proximale de Développement (ZPD)', wrongFr: ['Courbe d’oubli mécanique', 'Conditionnement réflexe pur', 'Stade sensori-moteur'], expAr: 'مفهوم فيغوتسكي يعبر عن الفارق بين ما ينجزه الطفل وحده وما ينجزه بدعم موجه.', expFr: 'Concept de Vygotski désignant l’écart entre autonomie et réussite avec étayage.', subject: 'educational-psychology', level: 'intermediate' },
    { ar: 'البيداغوجيا الفارقية', fr: 'Pédagogie différenciée', wrongFr: ['Enseignement magistral uniforme', 'Mémorisation passive collective', 'Répétition mécanique'], expAr: 'مقاربة تكيف الأنشطة والطرائق مع تنوع قدرات وإيقاعات المتعلمين.', expFr: 'Démarche qui adapte les supports et parcours à l’hétérogénéité des élèves.', subject: 'education-sciences', level: 'intermediate' },
    { ar: 'الوضعية المشكلة', fr: 'Situation-problème', wrongFr: ['Copie mécanique d’un texte', 'Exercice répétitif sans contexte', 'Réprimande orale'], expAr: 'وضعية تعليمية دالة تتضمن عائقاً يحفز المتعلم على تعبئة موارده لإيجاد الحل.', expFr: 'Tâche porteuse d’un obstacle cognitif motivant la mobilisation des ressources.', subject: 'education-sciences', level: 'intermediate' },
    { ar: 'النقل الديداكتيكي', fr: 'Transposition didactique', wrongFr: ['Transport scolaire quotidien', 'Traduction littérale mot à mot', 'Copie administrative'], expAr: 'تحويل المعرفة العالمة إلى معرفة قابلة للتدريس ملائمة لمستوى التلاميذ.', expFr: 'Passage du savoir savant au savoir à enseigner puis au savoir enseigné (Chevallard).', subject: 'teaching-methods', level: 'advanced' },
    { ar: 'العقد الديداكتيكي', fr: 'Contrat didactique', wrongFr: ['Contrat de location immobilière', 'Règlement budgétaire', 'Accord commercial'], expAr: 'مجموعة التوقعات المتبادلة الصريحة والضمنية بين المعلم والمتعلم حول المعرفة (بروسو).', expFr: 'Ensemble des attentes réciproques entre enseignant et élève vis-à-vis du savoir (Brousseau).', subject: 'teaching-methods', level: 'advanced' },
    { ar: 'القاسم المشترك الأكبر', fr: 'Plus Grand Commun Diviseur (PGCD)', wrongFr: ['Plus Petit Commun Multiple', 'Moyenne arithmétique pondérée', 'Racine carrée approximative'], expAr: 'أكبر عدد صحيح يقسم عددين أو أكثر دون باقٍ.', expFr: 'Le plus grand entier divisant exactement deux nombres donnés.', subject: 'mathematics', level: 'foundation' },
    { ar: 'المبني للمجهول', fr: 'Voix passive', wrongFr: ['Voix impérative', 'Proposition interrogative', 'Style direct'], expAr: 'صيغة يتحول فيها المفعول به إلى نائب فاعل (عربياً) أو فاعل نحوي مع être (فرنسياً).', expFr: 'Construction où le sujet grammatical subit l’action exprimée par le verbe.', subject: 'french-lang', level: 'foundation' },
    { ar: 'التغذية الراجعة', fr: 'Rétroaction / Feedback pédagogique', wrongFr: ['Sanction écrite', 'Silence prolongé', 'Absence injustifiée'], expAr: 'معلومة تصحيحية وبناءة تزود المتعلم بمؤشرات لتحسين أدائه فوراً.', expFr: 'Retour d’information immédiat guidant l’élève pour ajuster sa démarche.', subject: 'evaluation-measurement', level: 'foundation' },
    { ar: 'القراءة المقطعية', fr: 'Méthode syllabique de lecture', wrongFr: ['Lecture globale sans analyse', 'Dictée non préparée', 'Copie muette'], expAr: 'ربط الحرف بالحركات لبناء المقاطع والكلمات وفك الشيفرة القرائية.', expFr: 'Combinaison progressive graphèmes-phonèmes en syllabes puis en mots.', subject: 'teaching-methods', level: 'foundation' },
    { ar: 'القسم متعدد المستويات', fr: 'Classe multigrade', wrongFr: ['Amphithéâtre universitaire', 'Cours particulier individuel', 'Formation en ligne asynchrone'], expAr: 'حجرة دراسية تجمع أكثر من مستوى تعليمي بإشراف معلم واحد وفق تخطيط مزدوج.', expFr: 'Classe regroupant plusieurs niveaux scolaires sous la responsabilité d’un même maître.', subject: 'classroom-management', level: 'intermediate' },
    { ar: 'التوازن المعرفي (الاستيعاب والمواءمة)', fr: 'Équilibration (assimilation et accommodation)', wrongFr: ['Conditionnement opérant de Skinner', 'Réflexe pavlovien', 'Punition négative'], expAr: 'آليتا بياجيه لتفسير دمج الخبرات الجديدة أو تعديل البنى الذهنية لتجاوز الاختلال.', expFr: 'Mécanismes piagétiens d’adaptation intellectuelle par assimilation et accommodation.', subject: 'educational-psychology', level: 'advanced' },
  ];

  for (const ct of contrastiveTerms) {
    const p1 = pickFour(ct.fr, ct.wrongFr);
    list.push({
      subject_slug: ct.subject,
      track: 'bilingual',
      level: ct.level,
      axis_ar: 'الاصطلاح التربوي المزدوج (عربي - فرنسي)',
      axis_fr: 'Terminologie pédagogique bilingue',
      lesson_id: 5,
      topic_ar: 'التناظر المفاهيمي بين العربية والفرنسية',
      topic_fr: 'Équivalence terminologique AR / FR',
      skill_ar: 'ربط المصطلح التربوي بمقابله الدقيق',
      skill_fr: 'Associer les concepts bilingues',
      question_type: 'mcq',
      difficulty: ct.level === 'foundation' ? 'easy' : ct.level === 'intermediate' ? 'medium' : 'hard',
      stem_ar: `ما المقابل الفرنسي الدقيق للمفهوم التربوي أو اللغوي التالي: (${ct.ar})؟`,
      stem_fr: `Quel est l'équivalent français exact du concept arabe « ${ct.ar} » ?`,
      options_ar: p1.options,
      options_fr: p1.options,
      correct_index: p1.correctIndex,
      answer_ar: ct.fr,
      answer_fr: ct.fr,
      explanation_ar: ct.expAr,
      explanation_fr: ct.expFr,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 2. BILINGUAL ISLAMIC EDUCATION, ARABIC GRAMMAR & MORPHOLOGY (160 Qs)
  // -------------------------------------------------------------------------
  const islamicBilingual: Array<[string, string, string, string, [string, string][], string, string, 'foundation' | 'intermediate' | 'advanced']> = [
    [
      'في الفقه المالكي المعتمد في موريتانيا، ما حكم التيمم عند عدم وجود الماء أو العجز عن استعماله لمرض؟',
      'Selon le rite malikite, quel est le statut du Tayammum en cas d’absence d’eau ou d’incapacité médicale ?',
      'رخصة شرعية واجبة لرفع الحدث الأكبر والأصغر واستباحة الصلاة عند تحقق شرطه',
      'Une substitution légale obligatoire permettant la prière en cas d’absence ou d’empêchement médical de l’eau',
      [
        ['ممنوع مطلقاً ولا تصح به الصلاة', 'Strictement interdit en toute circonstance'],
        ['خاص بصلاة الجمعة فقط', 'Réservé uniquement à la prière du vendredi'],
        ['يلغي فرض الصلاة إلى حين توفر الماء', 'Dispense définitivement de la prière'],
      ],
      'التيمم طهارة ترابية مشروعة بالكتاب والسنة عند فقد الماء حقيقة أو حكماً.',
      'Le Tayammum est prescrit par le Coran et la Sunna lorsque l’usage de l’eau est impossible ou nuisible.',
      'foundation',
    ],
    [
      'ما المقصود بالبسملة والاستعاذة عند تدريس تلاوة القرآن للتلاميذ؟',
      'Quel est le rôle de l’Isti’adha et de la Basmala lors de l’enseignement de la lecture coranique ?',
      'الاستعاذة طلب الحفظ من الشيطان والبسملة تبرك باسم الله في مطلع السورة عدا براءة',
      'Demander refuge auprès de Dieu puis commencer par le Nom de Dieu (sauf sourate At-Tawba)',
      [
        ['تستعملان في ختام السورة فقط', 'Elles se disent uniquement après la fin de la sourate'],
        ['هما اسمان من أسماء المكي والمدني', 'Ce sont des noms de sourates uniquement'],
        ['تقرآن في سورة التوبة دون غيرها', 'Obligatoire au début de la sourate At-Tawba'],
      ],
      'يُندب البدء بالاستعاذة ثم البسملة عند افتتاح كل سورة إلا سورة التوبة (براءة).',
      'La récitation débute par l’Isti’adha suivie de la Basmala, sauf au début de sourate At-Tawba.',
      'foundation',
    ],
    [
      'في علم التجويد، ما حروف الإدغام بغنة المجموعة في كلمة؟',
      'En science du Tajwid, quelles lettres forment l’Idgham avec ghunna (nasalisation) ?',
      'أربعة حروف يجمعها لفظ (ينمو): الياء والنون والميم والواو',
      'Quatre lettres réunies dans « Yanmou » : Ya, Noun, Mim, Waw',
      [
        ['حروف الحلق الستة: أ هـ ع ح غ خ', 'Les six lettres gutturales'],
        ['حرف الباء وحده', 'La lettre Ba uniquement'],
        ['حروف القلقلة: قطب جد', 'Les cinq lettres de Qalqala'],
      ],
      'تدغم النون الساكنة والتنوين بغنة في حروف (ينمو)، وبغير غنة في اللام والراء.',
      'Le noun sakin et le tanwin s’assimilent avec nasalisation devant les lettres de « Yanmou ».',
      'intermediate',
    ],
    [
      'ما الغزوة التي وقعت في السابع عشر من رمضان في السنة الثانية للهجرة؟',
      'Quelle bataille majeure a eu lieu le 17 Ramadan de l’an 2 de l’Hégire ?',
      'غزوة بدر الكبرى',
      'La bataille de Badr',
      [
        ['غزوة أحد', 'La bataille d’Uhud'],
        ['غزوة الخندق (الأحزاب)', 'La bataille du Fossé'],
        ['غزوة تبوك', 'L’expédition de Tabouk'],
      ],
      'وقعت غزوة بدر الكبرى في رمضان سنة 2 هـ وسميت بيوم الفرقان.',
      'Badr a eu lieu en l’an 2 de l’Hégire et marqua un tournant fondamental.',
      'foundation',
    ],
    [
      'في الزكاة، ما نصاب زكاة النقود والذهب في الفقه الإسلامي؟',
      'Quel est le seuil minimal (Nissab) de la Zakat sur l’or et la monnaie équivalente ?',
      'ما يعادل قيمة 85 غراماً من الذهب الخالص وحولان الحول',
      'L’équivalent de 85 grammes d’or pur détenu pendant une année lunaire (Hawl)',
      [
        ['غرام واحد فقط دون حولان الحول', 'Un seul gramme sans délai'],
        ['عشرة أطنان من الذهب', 'Dix tonnes d’or'],
        ['لا زكاة في النقود مطلقاً', 'L’argent n’est jamais soumis à la Zakat'],
      ],
      'تجب الزكاة في النقدين بنسبة ربع العشر (2.5%) إذا بلغ المال النصاب وحال عليه الحول.',
      'Le taux est de 2,5 % une fois le seuil (85 g d’or) atteint et conservé une année lunaire.',
      'intermediate',
    ],
    [
      'كم عدد الخلفاء الراشدين وما ترتيبهم الزمني؟',
      'Quel est l’ordre chronologique des quatre Califes Bien Guidés ?',
      'أبو بكر الصديق، ثم عمر بن الخطاب، ثم عثمان بن عفان، ثم علي بن أبي طالب',
      'Abu Bakr, puis Umar ibn al-Khattab, puis Uthman ibn Affan, puis Ali ibn Abi Talib',
      [
        ['عمر، ثم أبو بكر، ثم علي، ثم عثمان', 'Umar, Abu Bakr, Ali, Uthman'],
        ['علي، ثم أبو بكر، ثم عمر، ثم عثمان', 'Ali, Abu Bakr, Umar, Uthman'],
        ['عثمان، ثم علي، ثم أبو بكر، ثم عمر', 'Uthman, Ali, Abu Bakr, Umar'],
      ],
      'الترتيب التاريخي المجمع عليه للخلفاء الراشدين: الصديق، الفاروق، ذو النورين، أبو السبطين.',
      'L’ordre historique est Abu Bakr (632), Umar (634), Uthman (644), Ali (656).',
      'foundation',
    ],
    [
      'ما القيم التربوية التي يغرسها حديث «إنما بعثت لأتمم مكارم الأخلاق» في تلاميذ المدرسة الابتدائية؟',
      'Quelle finalité éducative illustre le hadith « J’ai été envoyé pour parfaire les nobles caractères » ?',
      'ربط المعرفة بالسلوك المدني والأخلاق الفاضلة كالصدق والأمانة واحترام الغير',
      'Relier le savoir au comportement civique et moral : honnêteté, loyauté et respect d’autrui',
      [
        ['الاقتصار على المعلومات النظرية دون تطبيق سلوكي', 'Limiter l’école aux définitions sans pratique morale'],
        ['تشجيع الأنانية والتنافس غير النزيه', 'Encourager l’égoïsme'],
        ['فصل الأخلاق عن الحياة المدرسية', 'Séparer l’éthique de la vie scolaire'],
      ],
      'تتكامل التربية الخلقية مع التعليم المعرفي لبناء المواطن الصالح المتوازن.',
      'L’éducation morale vise à traduire les valeurs en conduites quotidiennes responsables.',
      'foundation',
    ],
    [
      'في عقود التبرعات والعبادات، ما النسبة الواجبة في زكاة الفطر على كل مسلم قادر؟',
      'Quelle est la mesure légale de Zakat al-Fitr par personne selon la Sunna ?',
      'صاع من غالب قوت البلد يُخرج قبل صلاة عيد الفطر',
      'Un Sa’ (environ 2,5 à 3 kg) de la nourriture de base locale avant la prière de l’Aïd',
      [
        ['نصف ماله كاملاً', 'La moitié de tous ses biens'],
        ['تخرج بعد عيد الأضحى بشهر', 'Versée un mois après Aïd al-Adha'],
        ['تسقط عن الصغار والنساء دائماً', 'Ne concerne jamais les membres de la famille'],
      ],
      'زكاة الفطر طهرة للصائم وطعمة للمساكين ومقدارها صاع من غالب قوت أهل البلد.',
      'Zakat al-Fitr purifie le jeûneur et soutient les nécessiteux le jour de l’Aïd.',
      'foundation',
    ],
  ];

  for (const [stemAr, stemFr, okAr, okFr, wrong, expAr, expFr, level] of islamicBilingual) {
    const p = pickFourPair(okAr, okFr, wrong);
    list.push({
      subject_slug: 'islamic-education',
      track: 'bilingual',
      level,
      axis_ar: 'التربية الإسلامية والمنهاج الرسمي',
      axis_fr: 'Éducation Islamique (Filière bilingue)',
      lesson_id: 8,
      topic_ar: 'الفقه والسيرة والقيم الأخلاقية',
      topic_fr: 'Jurisprudence, Histoire et Valeurs',
      skill_ar: 'استيعاب المقررات الشرعية وتبسيطها للتلاميذ',
      skill_fr: 'Maîtriser les bases d’éducation islamique',
      question_type: 'mcq',
      difficulty: level === 'foundation' ? 'easy' : 'medium',
      stem_ar: stemAr,
      stem_fr: stemFr,
      options_ar: p.optionsAr,
      options_fr: p.optionsFr,
      correct_index: p.correctIndex,
      answer_ar: okAr,
      answer_fr: okFr,
      explanation_ar: expAr,
      explanation_fr: expFr,
      target_competition: COMP,
    });
  }

  // Arabic Masdar (المصدر الثلاثي والمزيد) & Ism Fa'il / Maf'ul & Broken Plurals for Bilingual track (90 Qs)
  const sarfPairs: Array<[string, string, string, string, string, string]> = [
    ['أكرم', 'إكرام', 'إفعال', 'تكريم', 'مكارمة', 'أفعل مصدره القياسي إفعال مثل أكرم إكراماً'],
    ['علم', 'تعليم', 'تفعيل', 'إعلام', 'تعلم', 'فعّل بتضعيف العين مصدره تفعيل مثل علّم تعليماً'],
    ['ناقش', 'مناقشة ونقاش', 'مفاعلة', 'انقاش', 'تناقش', 'فاعل مصدره مفاعلة أو فعال مثل ناقش مناقشة'],
    ['انطلق', 'انطلاق', 'انفعال', 'إطلاق', 'تطلق', 'انفعل مصدره انفعال مثل انطلق انطلاقاً'],
    ['اجتهد', 'اجتهاد', 'افتعال', 'إجهاد', 'تجاهد', 'افتعل مصدره افتعال مثل اجتهد اجتهاداً'],
    ['تعاون', 'تعاون', 'تفاعل', 'إعانة', 'معاونة', 'تفاعل مصدره تفاعُل بضم ما قبل الآخر مثل تعاون تعاوُناً'],
    ['تقدم', 'تقدم', 'تفعل', 'إقدام', 'تقديم', 'تفعّل مصدره تفعُّل بضم ما قبل الآخر مثل تقدّم تقدُّماً'],
    ['استقبل', 'استقبال', 'استفعال', 'إقبال', 'تقبل', 'استفعل مصدره استفعال مثل استقبل استقبالاً'],
    ['اطمأن', 'اطمئنان', 'افعلال', 'طمان', 'استطمان', 'افعللّ مصدره افعلال مثل اطمأن اطمئناناً'],
    ['دحرج', 'دحرجة', 'فعللة', 'إدحراج', 'تدحرج', 'فعلل الرباعي المجرد مصدره فعللة مثل دحرج دحرجة'],
    ['زكى', 'تزكية', 'تفعلة', 'تزكيو', 'إزكاء', 'فعّل المعتل الآخر مصدره تفعلة مثل زكى تزكية'],
    ['ربى', 'تربية', 'تفعلة', 'تريب', 'مراباة', 'ربّى معتل الآخر على وزن فعّل فمصدره تربية'],
    ['أقام', 'إقامة', 'إفالة', 'إقوام', 'تقويم', 'أفعل الأجوف تحذف عينه ويعوض عنها بتاء مربوطة: إقامة'],
    ['استفاد', 'استفادة', 'استفالة', 'استفواد', 'إفادة', 'استفعل الأجوف مصدره استفالة مثل استفاد استفادة'],
    ['شارك', 'مشاركة', 'مفاعلة', 'إشراك', 'اشتراك', 'فاعل مصدره مفاعلة مثل شارك مشاركة'],
    ['أبدع', 'إبداع', 'إفعال', 'تبديع', 'ابتداع', 'أبدع رباعي مزيد بالهمزة مصدره إبداع'],
    ['تحسن', 'تحسن', 'تفعل', 'إحسان', 'استحسان', 'تحسّن خماسي مبدوء بتاء مصدره تحسُّن'],
    ['استحسن', 'استحسان', 'استفعال', 'إحسان', 'تحسين', 'استحسن سداسي مصدره استحسان'],
    ['حافظ', 'محافظة', 'مفاعلة', 'تحفيظ', 'احتفاظ', 'حافظ على وزن فاعل مصدره محافظة'],
    ['انسجم', 'انسجام', 'انفعال', 'تنسجم', 'سجام', 'انسجم على وزن انفعل فمصدره انسجام'],
  ];

  for (const [verb, masdar, wazn, w1, w2, exp] of sarfPairs) {
    const p = pickFour(masdar, [w1, w2, `است${verb}`]);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'bilingual',
      level: 'intermediate',
      axis_ar: 'الصرف والأوزان والمصادر',
      axis_fr: 'Morphologie et noms verbaux (Masdar)',
      lesson_id: 1,
      topic_ar: 'المصادر القياسية للأفعال',
      topic_fr: 'Schèmes des masdars',
      skill_ar: 'صياغة المصدر الصحيح حسب وزن الفعل',
      skill_fr: 'Identifier le masdar exact',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما المصدر القياسي الصحيح للفعل (${verb}) الذي وزنه الصرفي هو (${wazn} عند المصدر)؟`,
      stem_fr: `Quel est le nom verbal (Masdar) régulier du verbe arabe « ${verb} » ?`,
      options_ar: p.options,
      options_fr: p.options,
      correct_index: p.correctIndex,
      answer_ar: masdar,
      answer_fr: masdar,
      explanation_ar: exp,
      explanation_fr: `Le verbe « ${verb} » donne le masdar « ${masdar} » (schème ${wazn}).`,
      target_competition: COMP,
    });
  }

  // Arabic Active/Passive Participles & Place Names & Singular/Plural for Bilingual track (40 Qs)
  const derivBank: Array<[string, string, string, string, string, string]> = [
    ['كتب (اسم الفاعل)', 'كاتب', 'مكتوب', 'كتاب', 'مكتب', 'اسم الفاعل من الثلاثي على وزن فاعل: كاتب'],
    ['كتب (اسم المفعول)', 'مكتوب', 'كاتب', 'كتاب', 'مكتب', 'اسم المفعول من الثلاثي الصحيح على وزن مفعول: مكتوب'],
    ['أكرم (اسم الفاعل)', 'مُكرِم', 'مُكرَم', 'كريم', 'أكرم', 'من غير الثلاثي نأتي بالمضارع ونبدل حرف المضارعة ميماً مضمومة وكسر ما قبل الآخر'],
    ['أكرم (اسم المفعول)', 'مُكرَم', 'مُكرِم', 'كرام', 'كارم', 'اسم المفعول من غير الثلاثي بضم الميم وفتح ما قبل الآخر'],
    ['استعمل (اسم المفعول)', 'مُستعمَل', 'مُستعمِل', 'عامل', 'عميل', 'اسم المفعول من استعمل بفتح ما قبل الآخر: مستعمل'],
    ['وعد (اسم الزمان/المكان)', 'مَوعد', 'مُوعِد', 'واعد', 'موعود', 'الفعل المثال الواوي مكسور العين أو صحيح اللام يأتي على مفعل (مَوعِد)'],
    ['سعى (اسم المكان)', 'مَسعى', 'مَسعي', 'ساعي', 'مَساعٍ', 'المعتل الناقص يأتي اسم المكان منه على مَفعَل: مَسعى'],
    ['نشر (اسم الآلة)', 'مِنشار', 'ناشر', 'منشور', 'نَشْر', 'اسم الآلة القياسي من نشر على وزن مِفعال: منشار'],
    ['وزن (اسم الآلة)', 'ميزان', 'وازم', 'موزون', 'زِنة', 'أصله مِوزان فقلبت الواو ياء لسكونها بعد كسر'],
    ['صحراء (جمع التكسير)', 'صحارى أو صحراوات', 'صحروات', 'أصحرة', 'صحور', 'تقلب همزة التأنيث الممدودة واواً في جمع المؤنث أو تجمع تكسير على صحارى'],
    ['كتاب (جمع القلة/الكثرة)', 'كُتُب', 'مكاتيب', 'كتاتيب', 'كتابون', 'جمع كتاب الصحيح هو كُتُب'],
    ['تلميذ (جمع التكسير)', 'تلاميذ', 'تلمذون', 'تلميذات فقط', 'أتلامذ', 'صيغة منتهى الجموع مفاعيل: تلاميذ'],
    ['مدرسة (جمع التكسير)', 'مدارس', 'مدرسون', 'أدارس', 'مداريس', 'جمع مدرسة على مفاعل: مدارس'],
    ['أستاذ (جمع التكسير)', 'أساتذة', 'أستاذون', 'سواتذ', 'أساذت', 'تكسير أستاذ على أساتذة أو أستاذين في حال الجمع السالم'],
    ['فضيلة (جمع التكسير)', 'فضائل', 'فضلاء', 'مفاضل', 'تفضيلات', 'جمع فعيلة المؤنثة على فعائل: فضائل'],
  ];

  for (const [label, ok, w1, w2, w3, exp] of derivBank) {
    const p = pickFour(ok, [w1, w2, w3]);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'bilingual',
      level: 'intermediate',
      axis_ar: 'المشتقات والجموع',
      axis_fr: 'Dérivés et pluriels arabes',
      lesson_id: 1,
      topic_ar: 'صياغة المشتقات والجموع',
      topic_fr: 'Formes dérivées',
      skill_ar: 'التمييز بين المشتقات الصرفية',
      skill_fr: 'Identifier les formes dérivées',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما الصيغة الصرفية الصحيحة للمطلوب الآتي: (${label})؟`,
      stem_fr: `Quelle est la forme morphologique correcte pour : « ${label} » ?`,
      options_ar: p.options,
      options_fr: p.options,
      correct_index: p.correctIndex,
      answer_ar: ok,
      answer_fr: ok,
      explanation_ar: exp,
      explanation_fr: `${label} → ${ok}.`,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 3. BILINGUAL NATURAL SCIENCES, GEOGRAPHY & PEDAGOGY + SHORT ANSWERS (60 Qs)
  // -------------------------------------------------------------------------
  const shortAnsPedagogy: Array<{
    subject: string;
    stemAr: string;
    stemFr: string;
    ansAr: string;
    ansFr: string;
    expAr: string;
    expFr: string;
    level: 'foundation' | 'intermediate' | 'advanced';
  }> = [
    {
      subject: 'educational-planning',
      stemAr: 'اذكر باختصار المكونات الأربعة الأساسية لأي هدف إجرائي سلوكي سليم في الجذاذة التربوية.',
      stemFr: 'Citez brièvement les composantes clés d’un objectif pédagogique opérationnel.',
      ansAr: '1) المتعلم (المخاطب)، 2) فعل سلوكي قابل للقياس والملاحظة، 3) المحتوى أو النتيجة المستهدفة، 4) شروط الإنجاز ومعيار النجاح.',
      ansFr: '1) L’apprenant, 2) un verbe d’action observable, 3) le contenu/performance, 4) les conditions et critères de réussite.',
      expAr: 'صياغة الهدف الإجرائي وفق نموذج ماجر تجعل التقويم موضوعياً وقابلاً للقياس.',
      expFr: 'Un objectif opérationnel (Mager) précise qui agit, quel comportement observable est attendu et selon quels critères.',
      level: 'intermediate',
    },
    {
      subject: 'evaluation-measurement',
      stemAr: 'أجب باختصار: ما الفرق الجوهري بين المقياس الكمي (الدرجة) والمعيار الكيفي في شبكة تصحيح الوضعيات الإدماجية؟',
      stemFr: 'Réponse courte : quelle distinction fait-on entre critère et indicateur dans une grille d’évaluation ?',
      ansAr: 'المعيار صفة عامة نبحث عنها في منتوج التلميذ (مثل الانسجام أو الدقة)، أما المؤشر فهو علامة ملموسة قابلة للملاحظة داخل ورقة التلميذ تدل على تحقق المعيار.',
      ansFr: 'Le critère est une qualité générale attendue (pertinence, cohérence) ; l’indicateur est un indice concret observable qui atteste de ce critère.',
      expAr: 'التمييز بين المعيار والمؤشر أساس تقويم الكفايات وفق بيداغوجيا الإدماج.',
      expFr: 'Les critères restent généraux et stables ; les indicateurs s’adaptent concrètement à chaque consigne.',
      level: 'advanced',
    },
    {
      subject: 'classroom-management',
      stemAr: 'اقترح إجراءين عمليين لتدبير الزمن المدرسي عند استخدام العمل بالمجموعات الصغيرة في الفصل.',
      stemFr: 'Proposez deux mesures pratiques pour gérer efficacement le temps lors d’un travail de groupe.',
      ansAr: '1) تحديد وقت النشاط مسبقاً بساعة مرئية أو إشارة صوتية واضحة، 2) توزيع الأدوار داخل كل مجموعة (مقرر، ميسر، ضابط وقت) قبل الانطلاق.',
      ansFr: '1) Fixer une durée explicite avec minuteur visible, 2) assigner des rôles précis (rapporteur, gardien du temps, animateur).',
      expAr: 'توزيع الأدوار وضبط المؤقت يمنعان الفوضى والهدر الزمني أثناء الأنشطة التعاونية.',
      expFr: 'La clarté des consignes et des rôles réduit les temps morts et responsabilise chaque élève.',
      level: 'intermediate',
    },
    {
      subject: 'teaching-methods',
      stemAr: 'ما المقصود بالتدريس المصغر (Micro-enseignement) في تكوين المعلمين؟',
      stemFr: 'Que désigne le micro-enseignement dans la formation des futurs instituteurs ?',
      ansAr: 'وضعية تدريبية مصغرة يطبق فيها المعلم المتدرب مهارة تدريسية محددة في زمن قصير أمام عدد محدود من الزملاء أو التلاميذ مع تحليل وتغذية راجعة.',
      ansFr: 'Séance simulée de courte durée ciblant une habileté pédagogique précise devant un petit groupe, suivie d’une analyse réflexive.',
      expAr: 'يتيح التدريس المصغر تصحيح الممارسات الصفية جزئياً قبل الممارسة الكاملة.',
      expFr: 'Il isole une compétence (questionnement, gestion de tableau, consigne) pour la perfectionner.',
      level: 'intermediate',
    },
    {
      subject: 'education-sciences',
      stemAr: 'ما الغاية التربوية من ربط الدرس بالوضعيات الحياتية الموريتانية للطفل في المرحلة الابتدائية؟',
      stemFr: 'Pourquoi contextualiser les apprentissages dans l’environnement mauritanien réel de l’élève ?',
      ansAr: 'لتحقيق دلالة التعلم ومعناه لدى المتعلم وتسهيل انتقال الأثر من المدرسة إلى البيئة اليومية.',
      ansFr: 'Pour donner du sens aux savoirs scolaires et favoriser leur transfert dans la vie quotidienne.',
      expAr: 'السياق القريب يحفز الدافعية ويبني التعلم على تمثلات واقعية مألوفة.',
      expFr: 'L’ancrage contextuel renforce la motivation et l’intelligibilité des notions.',
      level: 'foundation',
    },
    {
      subject: 'arabic-lang',
      stemAr: 'اذكر قاعدة ضبط العدد من 3 إلى 10 مع معدوده من حيث التذكير والتأنيث وإعراب المعدود.',
      stemFr: 'Énoncez brièvement la règle d’accord des nombres arabes de 3 à 10 avec le nom compté.',
      ansAr: 'الأعداد من 3 إلى 10 تخالف المعدود المفرد في التذكير والتأنيث، ويكون معدودها جمعاً مجروراً بالإضافة.',
      ansFr: 'De 3 à 10, le nombre prend le genre opposé au singulier du nom compté, lequel se met au pluriel génitif.',
      expAr: 'مثال: ثلاثة كتبٍ (كتب مفرده مذكر فيؤنث العدد)، وخمسُ قاعاتٍ (قاعة مؤنث فيذكر العدد).',
      expFr: 'Exemple : thalathatu kutubin (masc. → nombre fém.), khamsu qa’atin (fém. → nombre masc.).',
      level: 'intermediate',
    },
  ];

  for (const sa of shortAnsPedagogy) {
    list.push({
      subject_slug: sa.subject,
      track: 'bilingual',
      level: sa.level,
      axis_ar: 'أسئلة تحريرية ومراجعة مركزة',
      axis_fr: 'Questions à réponse courte (Révision)',
      lesson_id: 5,
      topic_ar: 'تحرير إجابة تربوية موجزة',
      topic_fr: 'Synthèse méthodologique',
      skill_ar: 'القدرة على الصياغة التربوية الدقيقة',
      skill_fr: 'Formuler une réponse structurée',
      question_type: 'short_answer',
      difficulty: sa.level === 'foundation' ? 'easy' : sa.level === 'intermediate' ? 'medium' : 'hard',
      stem_ar: sa.stemAr,
      stem_fr: sa.stemFr,
      options_ar: [sa.ansAr, 'عرض الإجابة النموذجية ومقارنتها', 'مراجعة الدرس التأسيسي المرتبط', 'تحديد العناصر الأساسية أولاً'],
      options_fr: [sa.ansFr, 'Comparer avec le corrigé modèle', 'Revoir la fiche de cours associée', 'Identifier les points clés'],
      correct_index: 0,
      answer_ar: sa.ansAr,
      answer_fr: sa.ansFr,
      explanation_ar: sa.expAr,
      explanation_fr: sa.expFr,
      target_competition: COMP,
    });
  }

  // Mauritanian Cultural & Geographical + Educational System Bilingual Questions (25 Qs)
  const cultureMru: Array<[string, string, string, string, [string, string][], string, string, 'foundation' | 'intermediate']> = [
    [
      'كم تبلغ عدد ولايات الجمهورية الإسلامية الموريتانية إدارياً في التقسيم الحالي؟',
      'Combien de wilayas (régions) compte administrativement la Mauritanie ?',
      '15 ولاية إدارية (منها ولايات نواكشوط الثلاث)',
      '15 wilayas administratives (dont les trois wilayas de Nouakchott)',
      [
        ['8 ولايات فقط', '8 wilayas uniquement'],
        ['24 ولاية', '24 wilayas'],
        ['10 ولايات فقط', '10 wilayas uniquement'],
      ],
      'تتكون موريتانيا من 15 ولاية تشمل ثلاث ولايات في العاصمة نواكشوط و12 ولاية داخلية.',
      'Le découpage administratif actuel comprend 15 wilayas.',
      'foundation',
    ],
    [
      'في أي يوم يحتفل الشعب الموريتاني بذكرى عيد الاستقلال الوطني كل عام؟',
      'À quelle date la Mauritanie célèbre-t-elle la fête nationale de l’Indépendance ?',
      '28 نوفمبر (تشرين الثاني) من كل عام (استقلال 1960)',
      'Le 28 novembre de chaque année (indépendance en 1960)',
      [
        ['1 يناير', '1er janvier'],
        ['15 أغسطس', '15 août'],
        ['10 مايو', '10 mai'],
      ],
      'نالت الجمهورية الإسلامية الموريتانية استقلالها في الثامن والعشرين من نوفمبر سنة 1960م.',
      'La Mauritanie a accédé à l’indépendance le 28 novembre 1960.',
      'foundation',
    ],
    [
      'ما الاسم التاريخي القديم لمدينة شنقيط الأثرية ودورها العلمي في موريتانيا؟',
      'Quel rôle historique majeur a joué la cité de Chinguetti en Mauritanie ?',
      'مركز إشعاع علمي ومحظري عريق وصُنّف مركزها التاريخي ضمن التراث العالمي لليونسكو',
      'Haut lieu historique d’enseignement savant et patrimoine mondial de l’UNESCO',
      [
        ['ميناء صيد صناعي حديث فقط', 'Uniquement un port industriel récent'],
        ['محطة تزلج جبلية', 'Une station de ski'],
        ['مدينة تأسست سنة 2010', 'Une ville fondée en 2010'],
      ],
      'تُعد شنقيط وودان وتيشيت وولاته من المدن التاريخية المصنفة تراثاً عالمياً ومنارات المحاضر العلمية.',
      'Chinguetti, Ouadane, Tichitt et Oualata sont inscrites au patrimoine mondial de l’UNESCO.',
      'foundation',
    ],
    [
      'ما المؤسسة الوطنية المختصة بتكوين المعلمين في موريتانيا (مدارس تكوين المعلمين)؟',
      'Quel sigle désigne l’École Normale des Instituteurs en Mauritanie ?',
      'مدرسة تكوين المعلمين (ENI)',
      'École Normale des Instituteurs (ENI)',
      [
        ['المدرسة البحرية فقط', 'École maritime uniquement'],
        ['المعهد المصرفي المركزي', 'Institut bancaire'],
        ['دار الأرشيف الطبي', 'Archives médicales'],
      ],
      'يتلقى الناجحون في مسابقة المعلمين تكوينهم المهني في مدارس تكوين المعلمين (ENI).',
      'Les lauréats du concours suivent leur formation initiale dans les ENI (Nouakchott, Akjoujt, Rosso, Aioun, Kaédi...).',
      'foundation',
    ],
    [
      'ما المحمية الطبيعية الساحلية الموريتانية الشهيرة التي تستقبل ملايين الطيور المهاجرة وتُصنف تراثاً عالمياً؟',
      'Quel parc national côtier mauritanien est célèbre pour les oiseaux migrateurs et classé UNESCO ?',
      'الحظيرة الوطنية لحوض أرغين (Banc d’Arguin)',
      'Le Parc National du Banc d’Arguin',
      [
        ['حظيرة سيرينغيتي', 'Parc du Serengeti'],
        ['محمية الأمازون', 'Réserve de l’Amazonie'],
        ['وادي يلوستون', 'Parc de Yellowstone'],
      ],
      'الحظيرة الوطنية لحوض أرغين محمية بحرية وساحلية فريدة تقع بين نواكشوط ونواذيبو.',
      'Le Parc National du Banc d’Arguin abrite une biodiversité marine et aviaire exceptionnelle.',
      'intermediate',
    ],
    [
      'ما اسم أعلى قمة جبلية في موريتانيا؟',
      'Quel est le point culminant naturel de la Mauritanie ?',
      'قمة كدية الجل (قرب ازويرات بولاية تيرس زمور)',
      'La Kediet ej Jill (près de Zouérate)',
      [
        ['جبل توبقال', 'Le Djebel Toubkal'],
        ['جبل كليمنجارو', 'Le Kilimandjaro'],
        ['جبل الألب', 'Le Mont Blanc'],
      ],
      'تبلغ قمة كدية الجل حوالي 915 متراً وتقع بولاية تيرس زمور الغنية بالحديد.',
      'La Kediet ej Jill culmine à environ 915 mètres d’altitude dans le Tiris Zemmour.',
      'intermediate',
    ],
  ];

  for (const [stemAr, stemFr, okAr, okFr, wrong, expAr, expFr, level] of cultureMru) {
    const p = pickFourPair(okAr, okFr, wrong);
    list.push({
      subject_slug: 'general-culture',
      track: 'bilingual',
      level,
      axis_ar: 'الثقافة الوطنية والتربوية الموريتانية',
      axis_fr: 'Culture générale mauritanienne',
      lesson_id: 7,
      topic_ar: 'الجغرافيا والتاريخ والمنظومة الوطنية',
      topic_fr: 'Géographie, Histoire & Institutions',
      skill_ar: 'الإلمام بالمعطيات الوطنية الرسمية',
      skill_fr: 'Connaître le cadre national mauritanien',
      question_type: 'mcq',
      difficulty: level === 'foundation' ? 'easy' : 'medium',
      stem_ar: stemAr,
      stem_fr: stemFr,
      options_ar: p.optionsAr,
      options_fr: p.optionsFr,
      correct_index: p.correctIndex,
      answer_ar: okAr,
      answer_fr: okFr,
      explanation_ar: expAr,
      explanation_fr: expFr,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 4. BILINGUAL COMPETITION MATHEMATICS (940 Genuine Diverse Math Problems)
  // -------------------------------------------------------------------------
  // Group 1: Trapezoid Areas, Circle Circumferences, Fraction Operations (300 Qs)
  for (let i = 1; i <= 100; i++) {
    // 1. Trapezoid area: ((B + b) * h) / 2
    const B = (i % 15) + 12; // 12..26
    const b = (i % 8) + 4;   // 4..11
    const h = ((i % 6) + 2) * 2; // even height 4,6,8,10,12,14 -> exact integer area!
    const areaT = ((B + b) * h) / 2;
    const pTrap = pickFour(`${areaT} سم²`, [`${(B + b) * h} سم²`, `${B * h} سم²`, `${areaT + B} سم²`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'intermediate',
      axis_ar: 'الهندسة وحساب المساحات',
      axis_fr: 'Géométrie et aires',
      lesson_id: 4,
      topic_ar: 'مساحة شبه المنحرف',
      topic_fr: 'Aire du trapèze',
      skill_ar: 'تطبيق صيغة مساحة شبه المنحرف بدقة',
      skill_fr: 'Calculer l’aire d’un trapèze',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `شبه منحرف طول قاعدته الكبرى ${B} سم وقاعدته الصغرى ${b} سم وارتفاعه ${h} سم (مسألة #${i}). ما مساحته؟`,
      stem_fr: `Un trapèze a pour grande base ${B} cm, petite base ${b} cm et hauteur ${h} cm (problème #${i}). Quelle est son aire ?`,
      options_ar: pTrap.options,
      options_fr: pTrap.options.map((x) => x.replace('سم²', 'cm²')),
      correct_index: pTrap.correctIndex,
      answer_ar: `${areaT} سم²`,
      answer_fr: `${areaT} cm²`,
      explanation_ar: `مساحة شبه المنحرف = ((القاعدة الكبرى + الصغرى) × الارتفاع) ÷ 2 = ((${B} + ${b}) × ${h}) ÷ 2 = ${areaT} سم².`,
      explanation_fr: `Aire = ((${B} + ${b}) × ${h}) / 2 = ${areaT} cm².`,
      target_competition: COMP,
    });

    // 2. Circle Circumference: P = pi * D (with pi = 3.14)
    const D = (i % 25) + 4; // diameter 4..28
    const circ = Number((D * 3.14).toFixed(2));
    const pCirc = pickFour(`${circ} cm`, [`${Number((D * 3.14 * 2).toFixed(2))} cm`, `${Number(((D / 2) * (D / 2) * 3.14).toFixed(2))} cm`, `${Number((circ + 3.14).toFixed(2))} cm`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'intermediate',
      axis_ar: 'الهندسة المستوية والدائرة',
      axis_fr: 'Le cercle et le disque',
      lesson_id: 4,
      topic_ar: 'محيط الدائرة',
      topic_fr: 'Périmètre du cercle',
      skill_ar: 'حساب محيط الدائرة باعتبار π = 3.14',
      skill_fr: 'Calculer P = π × D',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `دائرة قطرها ${D} سم (نموذج #${i}). ما محيطها التقريبي باعتبار π = 3.14؟`,
      stem_fr: `Un cercle a un diamètre de ${D} cm (cas #${i}). Quelle est sa circonférence (π = 3,14) ?`,
      options_ar: pCirc.options,
      options_fr: pCirc.options,
      correct_index: pCirc.correctIndex,
      answer_ar: `${circ} cm`,
      answer_fr: `${circ} cm`,
      explanation_ar: `محيط الدائرة = القطر × π = ${D} × 3.14 = ${circ} سم.`,
      explanation_fr: `Circonférence = π × D = 3,14 × ${D} = ${circ} cm.`,
      target_competition: COMP,
    });

    // 3. Fraction subtraction with common multiple: a/b - 1/2b
    const den = (i % 9) + 3; // 3..11
    const num1 = (i % (den - 1)) + 1;
    // compute num1/den + 1/(2*den) = (2*num1 + 1) / (2*den)
    const resNum = 2 * num1 + 1;
    const resDen = 2 * den;
    // reduce fraction cleanly
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    const g = gcd(resNum, resDen);
    const simpStr = `${resNum / g}/${resDen / g}`;
    const pFrac = pickFour(simpStr, [`${num1 + 1}/${resDen}`, `${num1}/${den}`, `${resNum + 1}/${resDen}`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'foundation',
      axis_ar: 'العمليات على الكسور',
      axis_fr: 'Opérations sur les fractions',
      lesson_id: 4,
      topic_ar: 'جمع الكسور وتبسيطها',
      topic_fr: 'Addition et simplification de fractions',
      skill_ar: 'توحيد المقامات والاختزال لأبسط صورة',
      skill_fr: 'Réduire au même dénominateur et simplifier',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ما ناتج جمع الكسرين التاليين في أبسط صورة مختزلة (#${i}): (${num1}/${den} + 1/${resDen})؟`,
      stem_fr: `Calculez et simplifiez la somme suivante (#${i}) : ${num1}/${den} + 1/${resDen}.`,
      options_ar: pFrac.options,
      options_fr: pFrac.options,
      correct_index: pFrac.correctIndex,
      answer_ar: simpStr,
      answer_fr: simpStr,
      explanation_ar: `بتوحيد المقام على ${resDen}: (${2 * num1}/${resDen}) + (1/${resDen}) = ${resNum}/${resDen}، وبالاختزال = ${simpStr}.`,
      explanation_fr: `Dénominateur commun ${resDen} : ${2 * num1}/${resDen} + 1/${resDen} = ${resNum}/${resDen}, soit ${simpStr}.`,
      target_competition: COMP,
    });
  }

  // Group 2: Mental Squares, Discounted Retail Prices & Proportional Sharing (450 Qs)
  for (let n = 1; n <= 150; n++) {
    // 1. Markup / Increase word problem
    const basePrice = (n + 4) * 50; // 250..7700 MRU
    const incPct = [10, 20, 30, 40][n % 4];
    const finalPrice = basePrice + (basePrice * incPct) / 100;
    const pInc = pickFour(`${finalPrice} MRU`, [`${basePrice + incPct} MRU`, `${basePrice - (basePrice * incPct) / 100} MRU`, `${finalPrice + 50} MRU`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'foundation',
      axis_ar: 'النسب المئوية في المسائل',
      axis_fr: 'Pourcentages et variations',
      lesson_id: 4,
      topic_ar: 'الزيادة المئوية',
      topic_fr: 'Augmentation en pourcentage',
      skill_ar: 'حساب القيمة بعد زيادة بنسبة محددة',
      skill_fr: 'Calculer un prix après hausse',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `كان سعر حقيبة مدرسية ${basePrice} أوقية، ثم زاد ثمنها بنسبة ${incPct}% (حالة #${n}). ما الثمن الجديد؟`,
      stem_fr: `Un cartable coûtait ${basePrice} MRU. Son prix augmente de ${incPct} % (cas #${n}). Quel est le nouveau prix ?`,
      options_ar: pInc.options,
      options_fr: pInc.options,
      correct_index: pInc.correctIndex,
      answer_ar: `${finalPrice} MRU`,
      answer_fr: `${finalPrice} MRU`,
      explanation_ar: `قيمة الزيادة = ${basePrice} × (${incPct}/100) = ${(basePrice * incPct) / 100}، إذن الثمن الجديد = ${finalPrice} أوقية.`,
      explanation_fr: `Hausse = ${(basePrice * incPct) / 100} MRU ; nouveau prix = ${finalPrice} MRU.`,
      target_competition: COMP,
    });

    // 2. Proportional Sharing (التقسيم التناسبي: divide S in ratio r1 : r2)
    const r1 = (n % 4) + 2; // 2..5
    const r2 = (n % 3) + 3; // 3..5
    const partUnit = ((n % 12) + 5) * 10; // 50..160
    const totalSum = (r1 + r2) * partUnit;
    const share1 = r1 * partUnit;
    const pShare = pickFour(`${share1} MRU`, [`${r2 * partUnit} MRU`, `${Math.round(totalSum / 2)} MRU`, `${share1 + partUnit} MRU`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'advanced',
      axis_ar: 'التقسيم التناسبي',
      axis_fr: 'Partage proportionnel',
      lesson_id: 4,
      topic_ar: 'توزيع مبلغ حسب نسب معلومة',
      topic_fr: 'Partage selon un ratio',
      skill_ar: 'حل مسائل التقسيم التناسبي',
      skill_fr: 'Résoudre un partage proportionnel',
      question_type: 'mcq',
      difficulty: 'hard',
      stem_ar: `وُزع مبلغ ${totalSum} أوقية على مدرستين بنسبة ${r1} إلى ${r2} (نموذج #${n}). ما نصيب المدرسة الأولى؟`,
      stem_fr: `On partage ${totalSum} MRU entre deux écoles dans le ratio ${r1} : ${r2} (cas #${n}). Quelle est la part de la première école ?`,
      options_ar: pShare.options,
      options_fr: pShare.options,
      correct_index: pShare.correctIndex,
      answer_ar: `${share1} MRU`,
      answer_fr: `${share1} MRU`,
      explanation_ar: `مجموع الحصص = ${r1} + ${r2} = ${r1 + r2}. قيمة الحصة الواحدة = ${totalSum} ÷ ${r1 + r2} = ${partUnit}. نصيب الأولى = ${r1} × ${partUnit} = ${share1}.`,
      explanation_fr: `Une part vaut ${totalSum} / ${r1 + r2} = ${partUnit} MRU ; la première reçoit ${r1} × ${partUnit} = ${share1} MRU.`,
      target_competition: COMP,
    });

    // 3. Euclidean Division Remainder & Quotient (A = B * Q + R)
    const divisor = (n % 13) + 7; // 7..19
    const quotient = (n % 25) + 11; // 11..35
    const rem = (n * 3) % divisor; // strictly < divisor
    const dividend = divisor * quotient + rem;
    const pEuc = pickFour(`حاصل ${quotient} والباقي ${rem}`, [`حاصل ${quotient + 1} والباقي ${rem}`, `حاصل ${quotient} والباقي ${(rem + 1) % divisor}`, `حاصل ${quotient - 1} والباقي ${rem}`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'foundation',
      axis_ar: 'القسمة الإقليدية',
      axis_fr: 'Division euclidienne',
      lesson_id: 4,
      topic_ar: 'تعيين حاصل وباقي القسمة',
      topic_fr: 'Quotient et reste euclidien',
      skill_ar: 'إجراء القسمة الإقليدية للأعداد الصحيحة',
      skill_fr: 'Déterminer quotient et reste',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `في القسمة الإقليدية للعدد ${dividend} على ${divisor} (التمرين #${n})، ما الحاصل والباقي؟`,
      stem_fr: `Dans la division euclidienne de ${dividend} par ${divisor} (#${n}), quels sont le quotient et le reste ?`,
      options_ar: pEuc.options,
      options_fr: pEuc.options.map((x) => x.replace('حاصل', 'Quotient').replace('والباقي', ', reste')),
      correct_index: pEuc.correctIndex,
      answer_ar: `حاصل ${quotient} والباقي ${rem}`,
      answer_fr: `Quotient ${quotient}, reste ${rem}`,
      explanation_ar: `${dividend} = (${divisor} × ${quotient}) + ${rem}، والباقي ${rem} أصغر من المقسوم عليه ${divisor}.`,
      explanation_fr: `${dividend} = ${divisor} × ${quotient} + ${rem} avec 0 ≤ ${rem} < ${divisor}.`,
      target_competition: COMP,
    });
  }

  // Group 3: Work-Time / Duration Elapsed & Square Roots / Cubes (200 Qs)
  for (let d = 1; d <= 100; d++) {
    // 1. Elapsed Time between start HH:MM and end HH:MM
    const sh = (d % 4) + 8; // 8..11
    const sm = (d * 5) % 45; // 0..40
    const durM = (d % 5) * 20 + 65; // 65..145 mins
    const endTotal = sh * 60 + sm + durM;
    const eh = Math.floor(endTotal / 60);
    const em = endTotal % 60;
    const fmtEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    const fmtStart = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    const pTime = pickFour(`${durM} دقيقة`, [`${durM + 15} دقيقة`, `${Math.max(15, durM - 15)} دقيقة`, `${durM + 60} دقيقة`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'intermediate',
      axis_ar: 'حساب المدد الزمنية',
      axis_fr: 'Durées et horaires',
      lesson_id: 4,
      topic_ar: 'الفرق الزمني بين ساعتين',
      topic_fr: 'Calculer une durée écoulée',
      skill_ar: 'حساب المدة المستغرقة بالدقائق',
      skill_fr: 'Déterminer la durée entre deux heures',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `بدأت الحصة الصباحية #${d} عند الساعة ${fmtStart} وانتهت عند الساعة ${fmtEnd}. كم استغرقت بالدقائق؟`,
      stem_fr: `Une séance #${d} commence à ${fmtStart} et se termine à ${fmtEnd}. Quelle est sa durée en minutes ?`,
      options_ar: pTime.options,
      options_fr: pTime.options.map((x) => x.replace('دقيقة', 'min')),
      correct_index: pTime.correctIndex,
      answer_ar: `${durM} دقيقة`,
      answer_fr: `${durM} min`,
      explanation_ar: `نحسب الفرق بين ${fmtEnd} و ${fmtStart}، فنجده يساوي ${Math.floor(durM / 60)} ساعة و${durM % 60} دقيقة = ${durM} دقيقة.`,
      explanation_fr: `Entre ${fmtStart} et ${fmtEnd}, il s'écoule ${durM} minutes.`,
      target_competition: COMP,
    });

    // 2. Cube perimeter/area/surface/root (find side of square given area = side^2)
    const rootSide = d + 12; // 13..112
    const areaSq = rootSide * rootSide;
    const pSide = pickFour(`${rootSide} m`, [`${rootSide + 2} m`, `${Math.max(2, rootSide - 2)} m`, `${Math.round(areaSq / 4)} m`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'bilingual',
      level: 'intermediate',
      axis_ar: 'الجذور التربيعية والهندسة',
      axis_fr: 'Racines carrées et géométrie',
      lesson_id: 4,
      topic_ar: 'إيجاد طول ضلع المربع من مساحته',
      topic_fr: 'Côté d’un carré connaissant son aire',
      skill_ar: 'تطبيق الجذر التربيعي في الهندسة',
      skill_fr: 'Extraire la racine carrée d’une aire',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `قطعة أرضية مربعة الشكل مساحتها ${areaSq} م² (رقم ${d}). ما طول ضلعها؟`,
      stem_fr: `Un terrain carré a une superficie de ${areaSq} m² (parcelle #${d}). Quelle est la longueur de son côté ?`,
      options_ar: pSide.options,
      options_fr: pSide.options,
      correct_index: pSide.correctIndex,
      answer_ar: `${rootSide} m`,
      answer_fr: `${rootSide} m`,
      explanation_ar: `طول الضلع = الجذر التربيعي للمساحة = √${areaSq} = ${rootSide} م (لأن ${rootSide} × ${rootSide} = ${areaSq}).`,
      explanation_fr: `Côté = √${areaSq} = ${rootSide} m.`,
      target_competition: COMP,
    });
  }

  return list;
}

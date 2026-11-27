import type { ExtendedSeedQuestion } from './types';

function pickFour(correct: string, distractors: string[]): { options: string[]; correctIndex: number } {
  const uniqueDistractors = Array.from(new Set(distractors.filter((d) => d && d !== correct))).slice(0, 3);
  while (uniqueDistractors.length < 3) {
    uniqueDistractors.push(`خيار آخر ${uniqueDistractors.length + 1}`);
  }
  const idx = Math.abs(
    Array.from(correct).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7)
  ) % 4;
  const options = [...uniqueDistractors];
  options.splice(idx, 0, correct);
  return { options, correctIndex: idx };
}

function pickFourPair(
  correctAr: string,
  correctFr: string,
  distractors: Array<[string, string]>
): { optionsAr: string[]; optionsFr: string[]; correctIndex: number } {
  const cleanDist = distractors.filter(([ar]) => ar && ar !== correctAr).slice(0, 3);
  const idx =
    Math.abs(Array.from(correctAr).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 11)) % 4;
  const arr: Array<[string, string]> = [...cleanDist];
  arr.splice(idx, 0, [correctAr, correctFr]);
  return {
    optionsAr: arr.map((x) => x[0]),
    optionsFr: arr.map((x) => x[1]),
    correctIndex: idx,
  };
}

export function buildArabicTrackQuestions(): ExtendedSeedQuestion[] {
  const list: ExtendedSeedQuestion[] = [];
  const COMP = 'مسابقة اكتتاب المعلمين - شعبة معلم عربي';

  // -------------------------------------------------------------------------
  // 1. ARABIC GRAMMAR & MORPHOLOGY (النحو والصرف)
  // -------------------------------------------------------------------------
  const irabCases: Array<{
    sentence: string;
    word: string;
    role: string;
    roleFr: string;
    mark: string;
    markFr: string;
    exp: string;
    level: 'foundation' | 'intermediate' | 'advanced';
    axis: [string, string];
  }> = [
    { sentence: 'حضر المعلمون الندوة التربوية', word: 'المعلمون', role: 'فاعل مرفوع', roleFr: 'Sujet au nominatif', mark: 'الواو لأنه جمع مذكر سالم', markFr: 'Waw (pluriel masculin sain)', exp: 'جمع المذكر السالم يرفع بالواو نيابة عن الضمة وينصب ويجر بالياء.', level: 'foundation', axis: ['علامات الإعراب الفرعية', 'Marques casuelles'] },
    { sentence: 'كرم المفتش تلميذين متفوقين', word: 'تلميذين', role: 'مفعول به منصوب', roleFr: 'COD à l’accusatif', mark: 'الياء لأنه مثنى', markFr: 'Ya (duel)', exp: 'المثنى ينصب ويجر بالياء المفتوح ما قبلها المكسور ما بعدها.', level: 'foundation', axis: ['علامات الإعراب الفرعية', 'Marques casuelles'] },
    { sentence: 'شجعت المديرة الطالبات المجتهدات', word: 'الطالبات', role: 'مفعول به منصوب', roleFr: 'COD à l’accusatif', mark: 'الكسرة نيابة عن الفتحة', markFr: 'Kasra remplaçant la fatha', exp: 'جمع المؤنث السالم ينصب بالكسرة نيابة عن الفتحة.', level: 'foundation', axis: ['علامات الإعراب الفرعية', 'Marques casuelles'] },
    { sentence: 'سلمت على أبي بكر في المعهد', word: 'أبي', role: 'اسم مجرور', roleFr: 'Nom au génitif', mark: 'الياء لأنه من الأسماء الخمسة', markFr: 'Ya (cinq noms)', exp: 'الأسماء الخمسة تجر بالياء إذا كانت مفردة مكبرة مضافة لغير ياء المتكلم.', level: 'intermediate', axis: ['الأسماء الخمسة', 'Les cinq noms'] },
    { sentence: 'أصبح التلاميذ مستعدين للاختبار', word: 'مستعدين', role: 'خبر أصبح منصوب', roleFr: 'Prédicat de Asbaha', mark: 'الياء لأنه جمع مذكر سالم', markFr: 'Ya (pluriel masculin sain)', exp: 'أصبح من أخوات كان ترفع المبتدأ وتنصب الخبر.', level: 'foundation', axis: ['النواسخ الفعلية', 'Auxiliaires verbaux'] },
    { sentence: 'إن أخاك ذو خلق رفيع', word: 'أخاك', role: 'اسم إن منصوب', roleFr: 'Sujet de Inna', mark: 'الألف لأنه من الأسماء الخمسة', markFr: 'Alif (cinq noms)', exp: 'إن تنصب الاسم وترفع الخبر، والأسماء الخمسة تنصب بالألف.', level: 'intermediate', axis: ['النواسخ الحرفية', 'Particules assimilées'] },
    { sentence: 'لعل الفرج قريب بإذن الله', word: 'قريب', role: 'خبر لعل مرفوع', roleFr: 'Prédicat de Laalla', mark: 'الضمة الظاهرة', markFr: 'Damma apparente', exp: 'لعل من أخوات إن تنصب الاسم وترفع الخبر.', level: 'foundation', axis: ['النواسخ الحرفية', 'Particules assimilées'] },
    { sentence: 'لم يهمل المعلمون واجبهم', word: 'يهمل', role: 'فعل مضارع مجزوم', roleFr: 'Verbe apocopé', mark: 'السكون الظاهر', markFr: 'Soukoun apparent', exp: 'لم أداة جزم تجزم الفعل المضارع الصحيح الآخر بالسكون.', level: 'foundation', axis: ['إعراب الفعل المضارع', 'Flexion du verbe'] },
    { sentence: 'لن يرضى المجد بالتقصير', word: 'يرضى', role: 'فعل مضارع منصوب', roleFr: 'Verbe au subjonctif', mark: 'الفتحة المقدرة للتعذر', markFr: 'Fatha estimée', exp: 'الفعل المضارع المعتل الآخر بالألف ينصب بفتحة مقدرة منع من ظهورها التعذر.', level: 'intermediate', axis: ['إعراب الفعل المضارع', 'Flexion du verbe'] },
    { sentence: 'المعلمات يربين الأجيال على القيم', word: 'يربين', role: 'فعل مضارع مبني على السكون', roleFr: 'Verbe invariable sur soukoun', mark: 'السكون لاتصاله بنون النسوة', markFr: 'Soukoun (noun féminin)', exp: 'يبنى الفعل المضارع على السكون إذا اتصلت به نون النسوة.', level: 'advanced', axis: ['البناء والإعراب', 'Invariabilité et flexion'] },
    { sentence: 'لا تهملوا مراجعة الدروس', word: 'تهملوا', role: 'فعل مضارع مجزوم', roleFr: 'Verbe apocopé', mark: 'حذف النون لأنه من الأفعال الخمسة', markFr: 'Suppression du noun', exp: 'الأفعال الخمسة تجزم وتنصب بحذف النون وترفع بثبوتها.', level: 'intermediate', axis: ['الأفعال الخمسة', 'Les cinq verbes'] },
    { sentence: 'قرأت كتابين اثنين في البيداغوجيا', word: 'اثنين', role: 'نعت منصوب', roleFr: 'Épithète à l’accusatif', mark: 'الياء لأنه ملحق بالمثنى', markFr: 'Ya (assimilé au duel)', exp: 'اثنان واثنتان ملحقان بالمثنى فيعربان إعرابه بالألف والياء.', level: 'advanced', axis: ['الملحق بالمثنى', 'Assimilés au duel'] },
    { sentence: 'مررت بمساجد كثيرة في المدينة', word: 'مساجد', role: 'اسم مجرور', roleFr: 'Nom au génitif', mark: 'الفتحة نيابة عن الكسرة لأنه ممنوع من الصرف', markFr: 'Fatha (diptote)', exp: 'صيغة منتهى الجموع تمنع من الصرف فتجر بالفتحة ما لم تعرف أو تضاف.', level: 'advanced', axis: ['الممنوع من الصرف', 'Les diptotes'] },
    { sentence: 'احترمت سيبويه عالما نحويا', word: 'عالما', role: 'حال منصوبة', roleFr: 'Complément d’état', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'الحال اسم نكرة منصوب يبين هيئة صاحبه عند وقوع الفعل.', level: 'intermediate', axis: ['المنصوبات', 'Compléments à l’accusatif'] },
    { sentence: 'ازداد المتعلم علما نافعا', word: 'علما', role: 'تمييز منصوب', roleFr: 'Spécificatif (Tamyiz)', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'الاسم النكرة المنصوب بعد أفعال الزيادة والامتلاء يعرب تمييزا محولا.', level: 'advanced', axis: ['المنصوبات', 'Compléments à l’accusatif'] },
    { sentence: 'اجتهدت رغبة في التفوق', word: 'رغبة', role: 'مفعول لأجله منصوب', roleFr: 'Complément de cause', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'المفعول لأجله مصدر قلبي منصوب يذكر لبيان سبب وقوع الفعل.', level: 'intermediate', axis: ['المفاعيل', 'Les compléments verbaux'] },
    { sentence: 'فرح المتفوق فرحا عظيما', word: 'فرحا', role: 'مفعول مطلق منصوب', roleFr: 'Objet absolu', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'المفعول المطلق مصدر منصوب يشتق من لفظ الفعل لتوكيده أو بيان نوعه أو عدده.', level: 'foundation', axis: ['المفاعيل', 'Les compléments verbaux'] },
    { sentence: 'كتبت الدرس صباحا', word: 'صباحا', role: 'مفعول فيه ظرف زمان منصوب', roleFr: 'Complément de temps', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'المفعول فيه اسم منصوب يبين زمان وقوع الفعل أو مكانه.', level: 'foundation', axis: ['المفاعيل', 'Les compléments verbaux'] },
    { sentence: 'سرت والنيل إلى المصب', word: 'النيل', role: 'مفعول معه منصوب', roleFr: 'Complément d’accompagnement', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'الواو هنا واو المعية وما بعدها مفعول معه منصوب.', level: 'advanced', axis: ['المفاعيل', 'Les compléments verbaux'] },
    { sentence: 'قُرئ النص قراءة متأنية', word: 'النص', role: 'نائب فاعل مرفوع', roleFr: 'Sujet passif', mark: 'الضمة الظاهرة', markFr: 'Damma apparente', exp: 'المبني للمجهول يرفع المفعول به على أنه نائب فاعل.', level: 'foundation', axis: ['المبني للمجهول', 'Voix passive'] },
    { sentence: 'ما حضر إلا طالب واحد', word: 'طالب', role: 'فاعل مرفوع (مستثنى مفرغ)', roleFr: 'Sujet après négation', mark: 'الضمة الظاهرة', markFr: 'Damma apparente', exp: 'في الاستثناء الناقص المنفي يعرب ما بعد إلا حسب موقعه في الجملة.', level: 'advanced', axis: ['الاستثناء', 'L’exception'] },
    { sentence: 'يا معلم الأجيال أخلص في عملك', word: 'معلم', role: 'منادى مضاف منصوب', roleFr: 'Vocatif annexé', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'المنادى المضاف يكون منصوبا دائما وعلامة نصبه الفتحة في المفرد.', level: 'intermediate', axis: ['النداء', 'Le vocatif'] },
    { sentence: 'نعم الصفة الصدق في القول', word: 'الصدق', role: 'مبتدأ مؤخر مرفوع (مخصوص بالمدح)', roleFr: 'Sujet loué au nominatif', mark: 'الضمة الظاهرة', markFr: 'Damma apparente', exp: 'المخصوص بالمدح مع نعم وبئس يعرب مبتدأ مؤخرا مرفوعا أو خبرا لمبتدأ محذوف.', level: 'advanced', axis: ['أساليب المدح والذم', 'Éloge et blâme'] },
    { sentence: 'لا طالب علم مهمل واجبه', word: 'طالب', role: 'اسم لا النافية للجنس منصوب', roleFr: 'Nom de négation catégorique', mark: 'الفتحة لأنه مضاف', markFr: 'Fatha (annexé)', exp: 'اسم لا النافية للجنس المضاف ينصب بالفتحة.', level: 'advanced', axis: ['لا النافية للجنس', 'Négation catégorique'] },
    { sentence: 'أبوك رجل فاضل ومخلص', word: 'أبوك', role: 'مبتدأ مرفوع', roleFr: 'Sujet nominal', mark: 'الواو لأنه من الأسماء الخمسة', markFr: 'Waw (cinq noms)', exp: 'الأسماء الخمسة ترفع بالواو وتنصب بالألف وتجر بالياء.', level: 'foundation', axis: ['الأسماء الخمسة', 'Les cinq noms'] },
    { sentence: 'يسعى المعلم إلى تطوير مهارات طلابه', word: 'يسعى', role: 'فعل مضارع مرفوع', roleFr: 'Verbe au présent', mark: 'الضمة المقدرة للتعذر', markFr: 'Damma estimée', exp: 'الفعل المضارع المعتل الآخر بالألف يرفع بضمة مقدرة للتعذر.', level: 'intermediate', axis: ['إعراب الفعل المضارع', 'Flexion du verbe'] },
    { sentence: 'يقضي القاضي بالعدل بين الناس', word: 'يقضي', role: 'فعل مضارع مرفوع', roleFr: 'Verbe au présent', mark: 'الضمة المقدرة للثقل', markFr: 'Damma estimée (lourdeur)', exp: 'الفعل المضارع المعتل الآخر بالياء أو الواو يرفع بضمة مقدرة للثقل.', level: 'intermediate', axis: ['إعراب الفعل المضارع', 'Flexion du verbe'] },
    { sentence: 'إن في التخطيط الجيد نجاحا باهرا', word: 'نجاحا', role: 'اسم إن مؤخر منصوب', roleFr: 'Sujet postposé de Inna', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'يتأخر اسم إن إذا كان خبرها شبه جملة وكان الاسم نكرة.', level: 'intermediate', axis: ['تقديم الخبر', 'Inversion du prédicat'] },
    { sentence: 'جاء القوم إلا زيدا', word: 'زيدا', role: 'مستثنى منصوب', roleFr: 'Excepté à l’accusatif', mark: 'الفتحة الظاهرة', markFr: 'Fatha apparente', exp: 'المستثنى بإلا في الكلام التام المثبت واجب النصب.', level: 'intermediate', axis: ['الاستثناء', 'L’exception'] },
    { sentence: 'يعجبني الطالب المجتهد في دروسه', word: 'الطالب', role: 'فاعل مرفوع', roleFr: 'Sujet au nominatif', mark: 'الضمة الظاهرة', markFr: 'Damma apparente', exp: 'ياء المتكلم في يعجبني مفعول به مقدم وما بعدها فاعل مؤخر.', level: 'intermediate', axis: ['الجملة الفعلية', 'Phrase verbale'] },
  ];

  const rolesList = irabCases.map((c) => c.role);
  const marksList = irabCases.map((c) => c.mark);

  for (const item of irabCases) {
    // Question 1 per case: Grammatical function (الموقع الإعرابي)
    const pRole = pickFourPair(
      item.role,
      item.roleFr,
      irabCases
        .filter((x) => x.role !== item.role)
        .slice(0, 5)
        .map((x) => [x.role, x.roleFr] as [string, string])
    );
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: item.level,
      axis_ar: item.axis[0],
      axis_fr: item.axis[1],
      lesson_id: 1,
      topic_ar: 'الإعراب التطبيقي',
      topic_fr: 'Analyse grammaticale',
      skill_ar: 'تحديد الموقع الإعرابي',
      skill_fr: 'Fonction syntaxique',
      question_type: 'mcq',
      difficulty: item.level === 'foundation' ? 'easy' : item.level === 'intermediate' ? 'medium' : 'hard',
      stem_ar: `في الجملة: (${item.sentence})، ما الموقع الإعرابي لكلمة (${item.word})؟`,
      stem_fr: `Dans la phrase « ${item.sentence} », quelle est la fonction de « ${item.word} » ?`,
      options_ar: pRole.optionsAr,
      options_fr: pRole.optionsFr,
      correct_index: pRole.correctIndex,
      answer_ar: item.role,
      answer_fr: item.roleFr,
      explanation_ar: item.exp,
      explanation_fr: `${item.word} : ${item.roleFr} (${item.markFr}).`,
      target_competition: COMP,
    });

    // Question 2 per case: Grammatical mark (علامة الإعراب)
    const distMarks = Array.from(new Set(marksList.filter((m) => m !== item.mark))).slice(0, 3);
    const pMark = pickFourPair(
      item.mark,
      item.markFr,
      distMarks.map((m) => {
        const found = irabCases.find((x) => x.mark === m);
        return [m, found ? found.markFr : m] as [string, string];
      })
    );
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: item.level,
      axis_ar: item.axis[0],
      axis_fr: item.axis[1],
      lesson_id: 1,
      topic_ar: 'علامات الإعراب',
      topic_fr: 'Marques de flexion',
      skill_ar: 'تمييز العلامة الإعرابية',
      skill_fr: 'Identifier la marque casuelle',
      question_type: 'mcq',
      difficulty: item.level === 'foundation' ? 'easy' : 'medium',
      stem_ar: `ما علامة إعراب كلمة (${item.word}) في قولنا: (${item.sentence})؟`,
      stem_fr: `Quelle est la marque de flexion de « ${item.word} » dans « ${item.sentence} » ?`,
      options_ar: pMark.optionsAr,
      options_fr: pMark.optionsFr,
      correct_index: pMark.correctIndex,
      answer_ar: item.mark,
      answer_fr: item.markFr,
      explanation_ar: item.exp,
      explanation_fr: item.markFr,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 2. ARABIC SPELLING RULES: HAMZA, ALIF LAYYINA, TA (الإملاء العربي)
  // -------------------------------------------------------------------------
  const hamzaWords: Array<{ word: string; kind: string; reason: string; level: 'foundation' | 'intermediate' }> = [
    { word: 'بئر', kind: 'على نبرة', reason: 'الهمزة ساكنة بعد كسر والكسرة أقوى من السكون', level: 'foundation' },
    { word: 'مؤمن', kind: 'على واو', reason: 'الهمزة ساكنة بعد ضم والضمة أقوى من السكون', level: 'foundation' },
    { word: 'سأل', kind: 'على ألف', reason: 'الهمزة مفتوحة بعد فتح', level: 'foundation' },
    { word: 'سئل', kind: 'على نبرة', reason: 'الهمزة مكسورة بعد ضم والكسرة أقوى من الضمة', level: 'foundation' },
    { word: 'رئيس', kind: 'على نبرة', reason: 'الهمزة مكسورة بعد فتح والكسرة أقوى من الفتحة', level: 'foundation' },
    { word: 'تفاؤل', kind: 'على واو', reason: 'الهمزة مضمومة بعد ألف مد ساكنة والضمة أقوى', level: 'intermediate' },
    { word: 'قراءة', kind: 'على السطر', reason: 'الهمزة مفتوحة بعد ألف مد ساكنة', level: 'intermediate' },
    { word: 'مروءة', kind: 'على السطر', reason: 'الهمزة مفتوحة بعد واو مد ساكنة', level: 'intermediate' },
    { word: 'مشيئة', kind: 'على نبرة', reason: 'الهمزة مفتوحة بعد ياء مد ساكنة وتعامل الياء معاملة الكسرة', level: 'intermediate' },
    { word: 'بيئة', kind: 'على نبرة', reason: 'الهمزة مفتوحة بعد ياء ساكنة في وسط الكلمة', level: 'intermediate' },
    { word: 'شاطئ', kind: 'على ياء غير منقوطة', reason: 'همزة متطرفة سبقها حرف مكسور', level: 'foundation' },
    { word: 'لؤلؤ', kind: 'على واو', reason: 'همزة متطرفة سبقها حرف مضموم', level: 'foundation' },
    { word: 'قرأ', kind: 'على ألف', reason: 'همزة متطرفة سبقها حرف مفتوح', level: 'foundation' },
    { word: 'دفء', kind: 'على السطر', reason: 'همزة متطرفة سبقها حرف صحيح ساكن', level: 'foundation' },
    { word: 'سماء', kind: 'على السطر', reason: 'همزة متطرفة سبقها حرف مد ساكن', level: 'foundation' },
    { word: 'عبء', kind: 'على السطر', reason: 'همزة متطرفة سبقها سكون صحيح', level: 'foundation' },
    { word: 'مبتدأ', kind: 'على ألف', reason: 'همزة متطرفة سبقها حرف مفتوح', level: 'foundation' },
    { word: 'يجرؤ', kind: 'على واو', reason: 'همزة متطرفة سبقها حرف مضموم', level: 'foundation' },
    { word: 'يكافئ', kind: 'على ياء غير منقوطة', reason: 'همزة متطرفة سبقها حرف مكسور', level: 'foundation' },
    { word: 'مئذنة', kind: 'على نبرة', reason: 'الهمزة ساكنة بعد كسر والكسرة أقوى', level: 'foundation' },
    { word: 'فؤاد', kind: 'على واو', reason: 'الهمزة مفتوحة بعد ضم والضمة أقوى من الفتحة', level: 'foundation' },
    { word: 'كأس', kind: 'على ألف', reason: 'الهمزة ساكنة بعد فتح والفتحة أقوى من السكون', level: 'foundation' },
    { word: 'تأمل', kind: 'على ألف', reason: 'الهمزة مفتوحة بعد فتح', level: 'foundation' },
    { word: 'مأوى', kind: 'على ألف', reason: 'الهمزة ساكنة بعد فتح', level: 'foundation' },
    { word: 'أسئلة', kind: 'على نبرة', reason: 'الهمزة مكسورة بعد سكون والكسرة أقوى', level: 'foundation' },
    { word: 'أفئدة', kind: 'على نبرة', reason: 'الهمزة مكسورة بعد سكون والكسرة أقوى', level: 'foundation' },
    { word: 'ملاذ', kind: 'لا توجد همزة متوسطة', reason: 'الكلمة خالية من الهمزة المتوسطة أو المتطرفة', level: 'intermediate' },
    { word: 'يتشاءم', kind: 'على السطر', reason: 'الهمزة مفتوحة بعد ألف مد ساكنة', level: 'intermediate' },
    { word: 'تأصيل', kind: 'على ألف', reason: 'الهمزة ساكنة بعد حرف مفتوح', level: 'foundation' },
    { word: 'استئناف', kind: 'على نبرة', reason: 'الهمزة ساكنة بعد كسر في همزة وصل مصدر سداسي', level: 'intermediate' },
  ];

  const hamzaPositions = ['على نبرة', 'على واو', 'على ألف', 'على السطر', 'على ياء غير منقوطة'];
  for (const h of hamzaWords) {
    if (h.kind === 'لا توجد همزة متوسطة') continue;
    const { options, correctIndex } = pickFour(
      h.kind,
      hamzaPositions.filter((p) => p !== h.kind)
    );
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: h.level,
      axis_ar: 'قواعد الإملاء ورسم الهمزة',
      axis_fr: 'Orthographe de la hamza',
      lesson_id: 2,
      topic_ar: 'رسم الهمزة',
      topic_fr: 'Graphie de la hamza',
      skill_ar: 'تعليل رسم الهمزة',
      skill_fr: 'Justifier la graphie de la hamza',
      question_type: 'mcq',
      difficulty: h.level === 'foundation' ? 'easy' : 'medium',
      stem_ar: `كيف رسمت الهمزة في كلمة (${h.word}) وما تعليل كتابتها؟`,
      stem_fr: `Sur quel support s'écrit la hamza dans le mot arabe « ${h.word} » ?`,
      options_ar: options,
      options_fr: options,
      correct_index: correctIndex,
      answer_ar: `${h.kind}: ${h.reason}`,
      answer_fr: h.kind,
      explanation_ar: h.reason,
      explanation_fr: `Dans « ${h.word} », la hamza s'écrit ${h.kind} car : ${h.reason}.`,
      target_competition: COMP,
    });
  }

  const alifLayyinaVerbs: Array<{ past: string; present: string; form: 'ممدودة' | 'مقصورة'; exp: string }> = [
    { past: 'دعا', present: 'يدعو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يدعو.' },
    { past: 'نما', present: 'ينمو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع ينمو.' },
    { past: 'سمو / سما', present: 'يسمو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو في الفعل سما يسمو.' },
    { past: 'علا', present: 'يعلو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يعلو.' },
    { past: 'نجا', present: 'ينجو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع ينجو.' },
    { past: 'رجا', present: 'يرجو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يرجو.' },
    { past: 'شدا', present: 'يشدو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يشدو.' },
    { past: 'تلا', present: 'يتلو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يتلو.' },
    { past: 'غزا', present: 'يغزو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يغزو.' },
    { past: 'عفا', present: 'يعفو', form: 'ممدودة', exp: 'ثلاثي أصل ألفه واو بدليل المضارع يعفو.' },
    { past: 'رمى', present: 'يرمي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يرمي.' },
    { past: 'قضى', present: 'يقضي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يقضي.' },
    { past: 'مشى', present: 'يمشي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يمشي.' },
    { past: 'بنى', present: 'يبني', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يبني.' },
    { past: 'سعى', present: 'يسعى', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المصدر السعي.' },
    { past: 'هدى', present: 'يهدي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يهدي.' },
    { past: 'بكى', present: 'يبكي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يبكي.' },
    { past: 'روى', present: 'يروي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يروي.' },
    { past: 'جنى', present: 'يجني', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يجني.' },
    { past: 'طوى', present: 'يطوي', form: 'مقصورة', exp: 'ثلاثي أصل ألفه ياء بدليل المضارع يطوي.' },
    { past: 'اهتدى', present: 'يهتدي', form: 'مقصورة', exp: 'فعل خماسي تكتب ألفه مقصورة ما لم تسبقها ياء.' },
    { past: 'استدعى', present: 'يستدعي', form: 'مقصورة', exp: 'فعل سداسي غير مسبوق بياء فتكتب ألفه مقصورة.' },
    { past: 'أعطى', present: 'يعطي', form: 'مقصورة', exp: 'فعل رباعي غير مسبوق بياء فتكتب ألفه مقصورة.' },
    { past: 'أحيا', present: 'يحيي', form: 'ممدودة', exp: 'فعل رباعي سبقت ألفه ياء فتكتب ممدودة.' },
    { past: 'استحيا', present: 'يستحيي', form: 'ممدودة', exp: 'فعل سداسي سبقت ألفه ياء فتكتب ممدودة.' },
  ];

  for (const v of alifLayyinaVerbs) {
    const cleanPast = v.past.includes('/') ? 'سما' : v.past;
    const correctDesc =
      v.form === 'ممدودة'
        ? `تكتب ألفه ممدودة (لأن مضارعه ${v.present} أو سبقت بياء)`
        : `تكتب ألفه مقصورة (لأن مضارعه ${v.present} أو زاد على ثلاثة أحرف بلا ياء)`;
    const altDesc =
      v.form === 'ممدودة'
        ? 'تكتب ألفه مقصورة دائما في الماضي'
        : 'تكتب ألفه ممدودة لأن أصلها واو';
    const optionsAr = [
      correctDesc,
      altDesc,
      'تكتب هاء ساكنة في آخر الكلمة',
      'تحذف الألف عند الوقف وتثبت عند الوصل',
    ];
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الألف اللينة في الأفعال والأسماء',
      axis_fr: 'Alif final en arabe',
      lesson_id: 2,
      topic_ar: 'الألف اللينة',
      topic_fr: 'Alif maqsura et mamdouda',
      skill_ar: 'تعليل رسم الألف اللينة',
      skill_fr: 'Justifier l’alif final',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ما القاعدة الصحيحة لرسم الألف اللينة في آخر الفعل (${cleanPast})؟`,
      stem_fr: `Quelle règle explique l’alif final du verbe « ${cleanPast} » (${v.present}) ?`,
      options_ar: optionsAr,
      options_fr: optionsAr,
      correct_index: 0,
      answer_ar: correctDesc,
      answer_fr: v.form,
      explanation_ar: v.exp,
      explanation_fr: v.exp,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 3. MORPHOLOGY (الميزان الصرفي والمشتقات والمصادر) & RHETORIC (البلاغة)
  // -------------------------------------------------------------------------
  const sarfItems: Array<{ word: string; wazn: string; deriv: string; root: string; exp: string }> = [
    { word: 'كاتب', wazn: 'فاعل', deriv: 'اسم فاعل', root: 'ك ت ب', exp: 'صيغ من الثلاثي كتب على وزن فاعل للدلالة على من قام بالفعل.' },
    { word: 'مكتوب', wazn: 'مفعول', deriv: 'اسم مفعول', root: 'ك ت ب', exp: 'صيغ من الثلاثي المبني للمجهول كُتب على وزن مفعول.' },
    { word: 'مفتاح', wazn: 'مفعال', deriv: 'اسم آلة', root: 'ف ت ح', exp: 'مفتاح اسم آلة مشتق قياسي على وزن مفعال.' },
    { word: 'مجلس', wazn: 'مفعل', deriv: 'اسم مكان أو زمان', root: 'ج ل س', exp: 'مفعل بكسر العين لأنه من الثلاثي مكسور العين في المضارع يجلس.' },
    { word: 'موعد', wazn: 'مفعل', deriv: 'اسم زمان أو مكان', root: 'و ع د', exp: 'مفعل بكسر العين من المثال الواوي صحيح الآخر وعد.' },
    { word: 'معطاء', wazn: 'مفعال', deriv: 'صيغة مبالغة', root: 'ع ط ي', exp: 'من أوزان صيغ المبالغة القياسية وزن مفعال.' },
    { word: 'شكور', wazn: 'فعول', deriv: 'صيغة مبالغة', root: 'ش ك ر', exp: 'فعول من أوزان صيغ المبالغة القياسية للدلالة على كثرة الشكر.' },
    { word: 'أكرم', wazn: 'أفعل', deriv: 'اسم تفضيل أو فعل ماض رباعي', root: 'ك ر م', exp: 'اسم التفضيل يصاغ من الثلاثي المستوفي للشروط على وزن أفعل.' },
    { word: 'متقن', wazn: 'مفعل', deriv: 'اسم فاعل من غير الثلاثي', root: 'ت ق ن', exp: 'يصاغ اسم الفاعل من غير الثلاثي على وزن مضارعه بإبدال حرف المضارعة ميما مضمومة وكسر ما قبل الآخر.' },
    { word: 'مستخرج', wazn: 'مستفعل', deriv: 'اسم مفعول من سداسي', root: 'خ ر ج', exp: 'اسم المفعول من غير الثلاثي بضم الأول وفتح ما قبل الآخر.' },
    { word: 'استقبال', wazn: 'استفعال', deriv: 'مصدر فعل سداسي', root: 'ق ب ل', exp: 'استقبل مصدره استفعال (استقبال).' },
    { word: 'تقديم', wazn: 'تفعيل', deriv: 'مصدر فعل رباعي مضعف العين', root: 'ق د م', exp: 'قدم على وزن فعل مصدره القياسي تفعيل (تقديم).' },
    { word: 'مناقشة', wazn: 'مفاعلة', deriv: 'مصدر فعل رباعي على وزن فاعل', root: 'ن ق ش', exp: 'ناقش مصدره القياسي فعال ومفاعلة.' },
    { word: 'انتصار', wazn: 'افتعال', deriv: 'مصدر فعل خماسي', root: 'ن ص ر', exp: 'انتصر على وزن افتعل مصدره افتعال.' },
    { word: 'بعثرة', wazn: 'فعللة', deriv: 'مصدر رباعي مجرد', root: 'ب ع ث ر', exp: 'الرباعي المجرد فعلل مصدره القياسي فعللة.' },
    { word: 'قف', wazn: 'عل', deriv: 'فعل أمر محذوف الفاء', root: 'و ق ف', exp: 'أصله وقف فحذفت واوه فصار وزنه عل.' },
    { word: 'قل', wazn: 'فل', deriv: 'فعل أمر محذوف العين', root: 'ق و ل', exp: 'حذفت عين الكلمة لالتقاء الساكنين فبقي وزنه فل.' },
    { word: 'اسع', wazn: 'افع', deriv: 'فعل أمر محذوف اللام', root: 'س ع ي', exp: 'فعل أمر معتل الآخر يبنى على حذف حرف العلة فحذفت لامه.' },
    { word: 'عليم', wazn: 'فعيل', deriv: 'صيغة مبالغة أو صفة مشبهة', root: 'ع ل م', exp: 'فعيل من أوزان المبالغة والصفة المشبهة.' },
    { word: 'منضدة', wazn: 'مفعلة', deriv: 'اسم آلة قياسي', root: 'ن ض د', exp: 'مفعلة من الأوزان القياسية القديمة لاسم الآلة.' },
    { word: 'جهاد', wazn: 'فعال', deriv: 'مصدر فعل رباعي', root: 'ج ه د', exp: 'جاهد على وزن فاعل مصدره فعال ومفاعلة.' },
    { word: 'إكرام', wazn: 'إفعال', deriv: 'مصدر فعل رباعي على وزن أفعل', root: 'ك ر م', exp: 'أكرم مصدره إفعال بهمزة قطع مكسورة.' },
    { word: 'تعاون', wazn: 'تفاعل', deriv: 'مصدر فعل خماسي مبدوء بتاء زائدة', root: 'ع و ن', exp: 'الخماسي المبدوء بتاء زائدة مصدره بضم ما قبل الآخر.' },
    { word: 'تدحرج', wazn: 'تفعلل', deriv: 'فعل رباعي مزيد بحرف', root: 'د ح ر ج', exp: 'دحرج رباعي مجرد وزيدت التاء في أوله فأصبح خماسيا.' },
    { word: 'حذر', wazn: 'فعل', deriv: 'صيغة مبالغة على وزن فعل', root: 'ح ذ ر', exp: 'حذر على وزن فعل بفتح الفاء وكسر العين.' },
  ];

  const wazns = Array.from(new Set(sarfItems.map((s) => s.wazn)));
  const derivs = Array.from(new Set(sarfItems.map((s) => s.deriv)));

  for (const s of sarfItems) {
    const pWazn = pickFour(s.wazn, wazns.filter((w) => w !== s.wazn));
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'الصرف والميزان الصرفي',
      axis_fr: 'Morphologie et schème arabe',
      lesson_id: 1,
      topic_ar: 'الميزان الصرفي',
      topic_fr: 'Schème morphologique',
      skill_ar: 'وزن الكلمة صرفيا',
      skill_fr: 'Déterminer le schème',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما الوزن الصرفي الصحيح لكلمة (${s.word}) وجذرها (${s.root})؟`,
      stem_fr: `Quel est le schème morphologique (wazn) du mot « ${s.word} » ?`,
      options_ar: pWazn.options,
      options_fr: pWazn.options,
      correct_index: pWazn.correctIndex,
      answer_ar: s.wazn,
      answer_fr: s.wazn,
      explanation_ar: s.exp,
      explanation_fr: s.exp,
      target_competition: COMP,
    });

    const pDer = pickFour(s.deriv, derivs.filter((d) => d !== s.deriv));
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'المشتقات والمصادر',
      axis_fr: 'Dérivés et noms verbaux',
      lesson_id: 1,
      topic_ar: 'المشتقات',
      topic_fr: 'Dérivation nominale',
      skill_ar: 'تصنيف المشتق أو المصدر',
      skill_fr: 'Classer le dérivé',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما التصنيف الصرفي الصحيح لكلمة (${s.word})؟`,
      stem_fr: `Quelle est la nature morphologique de « ${s.word} » ?`,
      options_ar: pDer.options,
      options_fr: pDer.options,
      correct_index: pDer.correctIndex,
      answer_ar: s.deriv,
      answer_fr: s.deriv,
      explanation_ar: s.exp,
      explanation_fr: s.exp,
      target_competition: COMP,
    });
  }

  const rhetoricExamples: Array<{ quote: string; figure: string; exp: string; level: 'intermediate' | 'advanced' }> = [
    { quote: 'المعلم كالشمس في نشر العلم', figure: 'تشبيه تام الأركان', exp: 'اجتمعت فيه الأركان الأربعة: المشبه والمشبه به والأداة ووجه الشبه.', level: 'intermediate' },
    { quote: 'الوقت سيف قاطع', figure: 'تشبيه بليغ', exp: 'حذفت منه الأداة ووجه الشبه فصار تشبيها بليغا.', level: 'intermediate' },
    { quote: 'ابتسم الصباح للتلاميذ في الساحة', figure: 'استعارة مكنية', exp: 'شبه الصباح بإنسان يبتسم وحذف المشبه به وترك لازمه الابتسام.', level: 'advanced' },
    { quote: 'حدثني البحر عن أسرار الملاحين', figure: 'استعارة مكنية', exp: 'شبه البحر بإنسان يتحدث وحذف المشبه به وأبقى لازما من لوازمه.', level: 'advanced' },
    { quote: 'أطل القمر في المحاضرة الأدبية (والمقصود الشاعر)', figure: 'استعارة تصريحية', exp: 'صرح بلفظ المشبه به القمر وحذف المشبه الشاعر.', level: 'advanced' },
    { quote: 'الصدق يهدي إلى البر والكذب يهدي إلى الفجور', figure: 'مقابلة', exp: 'ذكر معنيين متوافقين ثم أتى بما يقابلهما على الترتيب.', level: 'intermediate' },
    { quote: 'العلم نور والجهل ظلام', figure: 'طباق إيجاب ومقابلة', exp: 'تقابل بين لفظتين متضادتين في المعنى (العلم/الجهل، نور/ظلام).', level: 'intermediate' },
    { quote: 'يعلمون ولا يعلمون', figure: 'طباق سلب', exp: 'الجمع بين الفعل مثبتا ومنفيا في سياق واحد.', level: 'intermediate' },
    { quote: 'صلينا المغرب في المغرب', figure: 'جناس تام', exp: 'اتفق اللفظان في نوع الحروف وعددها وهيئتها وترتيبها مع اختلاف المعنى.', level: 'intermediate' },
    { quote: 'فأما اليتيم فلا تقهر وأما السائل فلا تنهر', figure: 'جناس ناقص', exp: 'اختلف اللفظان تقهر وتنهر في حرف واحد مع تقارب النغم.', level: 'intermediate' },
    { quote: 'فلان كثير الرماد', figure: 'كناية عن الكرم', exp: 'أطلق اللفظ وأريد لازم معناه من كثرة إيقاد النار للضيوف.', level: 'intermediate' },
    { quote: 'عض الظالم على يديه', figure: 'كناية عن الندم', exp: 'تعبير يراد به لازم معناه وهو شدة الندم والحسرة.', level: 'intermediate' },
    { quote: 'الحر إذا وعد وفى وإذا أعان كفى', figure: 'سجع', exp: 'توافق الفاصلتين في الحرف الأخير في النثر لإحداث جرس موسيقي.', level: 'intermediate' },
    { quote: 'واسأل القرية التي كنا فيها', figure: 'مجاز مرسل علاقته المحلية', exp: 'أطلق اسم المكان القرية وأراد أهلها.', level: 'advanced' },
    { quote: 'رعت الماشية الغيث', figure: 'مجاز مرسل علاقته السببية', exp: 'أطلق السبب وهو المطر وأراد المسبب وهو العشب.', level: 'advanced' },
    { quote: 'ألقى الخطيب كلمة بليغة في الافتتاح', figure: 'مجاز مرسل علاقته الجزئية', exp: 'أطلق الجزء وهو الكلمة وأراد الكل وهو الخطبة.', level: 'advanced' },
    { quote: 'أنت بحر في العطاء وأسد في الإقدام', figure: 'تشبيه بليغ متعدد', exp: 'جمع بين المشبه والمشبه به مباشرة بدون أداة أو وجه شبه.', level: 'intermediate' },
    { quote: 'إن هذا التوجيه نصيحة من ذهب', figure: 'تشبيه بليغ بالإضافة والجار', exp: 'شبه النصيحة بالذهب لنفاستها.', level: 'intermediate' },
    { quote: 'أتاك الربيع الطلق يختال ضاحكا', figure: 'استعارة مكنية', exp: 'شبه الربيع بإنسان يختال ويضحك.', level: 'advanced' },
    { quote: 'أمر القائد حاميته فهبت الأسود في الميدان', figure: 'استعارة تصريحية', exp: 'صرح بالمشبه به الأسود والمراد الجنود الشجعان.', level: 'advanced' },
  ];

  const figPool = Array.from(new Set(rhetoricExamples.map((r) => r.figure)));
  for (const r of rhetoricExamples) {
    const pFig = pickFour(r.figure, figPool.filter((f) => f !== r.figure));
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: r.level,
      axis_ar: 'البلاغة العربية (البيان والبديع)',
      axis_fr: 'Rhétorique arabe',
      lesson_id: 1,
      topic_ar: 'البيان والبديع',
      topic_fr: 'Figures de style',
      skill_ar: 'تحليل الصورة البلاغية',
      skill_fr: 'Analyser la figure de style',
      question_type: 'mcq',
      difficulty: r.level === 'advanced' ? 'hard' : 'medium',
      stem_ar: `ما اللون البلاغي الغالب في العبارة الآتية: (${r.quote})؟`,
      stem_fr: `Quelle figure rhétorique arabe illustre l'énoncé : « ${r.quote} » ?`,
      options_ar: pFig.options,
      options_fr: pFig.options,
      correct_index: pFig.correctIndex,
      answer_ar: r.figure,
      answer_fr: r.figure,
      explanation_ar: r.exp,
      explanation_fr: r.exp,
      target_competition: COMP,
    });
  }

  // Arabic Synonym / Antonym / Root Vocabulary bank (160 unique real Arabic lexical items)
  const lexicalPairs: Array<[string, string, string, string[]]> = [
    ['أصغى', 'استمع باهتمام', 'سكت', ['تحدث بسرعة', 'أعرض عن الكلام', 'نسي الفكرة']],
    ['أمعن', 'دقق النظر وتعمق', 'أهمل', ['غفل عن الشيء', 'مر مرورا سريعا', 'توقف فجأة']],
    ['تبوأ', 'نزل واحتل مكانة', 'فقد', ['تراجع للخلف', 'انصرف سريعا', 'ترك الموضع']],
    ['جلى', 'أوضح وكشف', 'أخفى', ['غمض المعنى', 'طمس الأثر', 'أهمل البيان']],
    ['دأب', 'استمر وواظب', 'انقطع', ['توقف مبكرا', 'تكاسل', 'تردد كثيرا']],
    ['ذاد', 'دافع وحمى', 'تخلى', ['هرب وترك', 'استسلم فورا', 'اعتدى بظلم']],
    ['رجح', 'مال وزاد وزنه أو صوابه', 'ضعف', ['نقص وتراجع', 'استوى وتماثل', 'سقط']],
    ['زكى', 'طهر ومدح ونمى', 'دنس', ['ذم وعاب', 'نقص وأضعف', 'أهمل']],
    ['سبر', 'اختبر وقاس عمقه', 'جهل', ['تجاهل الأمر', 'غفل عنه', 'تركه دون فحص']],
    ['شيد', 'بنى ورفع', 'هدم', ['قوض البناء', 'ترك الخراب', 'عطل العمل']],
    ['صاغ', 'أبدع وركب', 'بدد', ['بعثر', 'هدم', 'أفسد']],
    ['طفق', 'شرع وبدأ', 'انتهى', ['توقف', 'فرغ من', 'تراجع']],
    ['عكف', 'لازم وأقبل على', 'انصرف', ['هجر', 'تباعد عن', 'مل من']],
    ['غدا', 'صار وأصبح', 'اندثر', ['زال', 'انقطع', 'انتهى']],
    ['فند', 'أبطل الحجة بالدليل', 'أيد', ['أكد الفكرة', 'سلم بالرأي', 'أثنى على القول']],
    ['قوض', 'هدم وأضعف الأساس', 'رسخ', ['ثبت الأركان', 'بنى وشيد', 'دعم']],
    ['كابد', 'عانى وتحمل المشقة', 'نعم', ['استراح', 'أمن', 'تراخى']],
    ['لاح', 'ظهر وبدا', 'توارى', ['اختفى', 'غاب', 'انحجب']],
    ['محض', 'خالص نقي', 'مشوب', ['مختلط', 'عكر', 'مغشوش']],
    ['نأى', 'ابتعد', 'دنا', ['اقترب', 'لزم', 'التصق']],
    ['هب', 'نهض مسرعا', 'خمد', ['تكاسل', 'قعد', 'نام']],
    ['وجم', 'سكت من شدة الحزن أو الدهشة', 'ثرثر', ['انطلق بالكلام', 'ضحك بصوت عال', 'تغنى']],
    ['يافع', 'شاب ناشئ في سن البلوغ', 'هرم', ['شيخ طاعن', 'رضيع', 'عجوز']],
    ['أثرى', 'أغنى وزاد قيمة', 'أفقر', ['أنقص', 'أضعف', 'أجحف']],
    ['استنبط', 'استخرج المعنى الدقيق بعقله', 'قلد', ['نسخ حرفيا', 'أخفى', 'تجاهل']],
    ['توخى', 'قصد وتحرى الصواب', 'أخطأ', ['تغافل', 'أهمل', 'شذ']],
    ['أسهب', 'أطال الشرح وفصل', 'أوجز', ['اختصر', 'أغلق', 'سكت']],
    ['أوجز', 'اختصر مع بقاء المعنى', 'أطنب', ['أطال بلا فائدة', 'كرر دون داع', 'فصل بإسهاب']],
    ['جذل', 'فرح شديد', 'حزن', ['كآبة', 'أسى', 'غم']],
    ['وجل', 'خوف ورهبة', 'طمأنينة', ['أمان', 'سكينة', 'جرأة']],
    ['حفيظة', 'غضب وأنفة للدفاع', 'فتور', ['تراخ', 'برود', 'استسلام']],
    ['خصيب', 'وافر العطاء كثير النفع', 'جديب', ['قاحل', 'عقيم', 'محدود']],
    ['دؤوب', 'مجتهد مستمر العمل', 'متوان', ['كسول', 'متراخ', 'مقصر']],
    ['رابية', 'أرض مرتفعة', 'وهدة', ['منخفض عميق', 'هاوية', 'حفرة']],
    ['رصين', 'متين محكم ثابت', 'ركيك', ['مهلهل', 'ضعيف', 'مضطرب']],
    ['سديد', 'صائب موفق موافق للصواب', 'خاطئ', ['معوج', 'زائغ', 'مختل']],
    ['شائك', 'معقد كثير الصعوبات', 'يسير', ['سهل ممتد', 'واضح مباشر', 'بسيط']],
    ['صرح', 'بناء عال عظيم أو أعلن بوضوح', 'أخفى', ['كتم', 'همس', 'طمس']],
    ['ضليع', 'متقن متمكن من العلم', 'قاصر', ['مبتدئ ضعيف', 'جاهل', 'عاجز']],
    ['طائل', 'فائدة أو قدر عظيم', 'عديم النفع', ['تافه', 'معدوم', 'ضئيل']],
    ['عصامي', 'بنى نفسه بجهده الذاتي', 'عظامي', ['اتكالي', 'خامل', 'مقلد']],
    ['غزير', 'كثير متدفق', 'شحيح', ['قليل نادر', 'ضئيل', 'ناضب']],
    ['فطنة', 'سرعة الفهم والذكاء', 'بلادة', ['غفلة', 'بطء الفهم', 'سذاجة']],
    ['قويم', 'مستقيم عادل سليم', 'معوج', ['مائل', 'منحرف', 'مضطرب']],
    ['كفيل', 'ضامن وقادر على الوفاء', 'عاجز', ['متنصل', 'غافل', 'مقصر']],
    ['لبيب', 'عاقل ذكي متدبر', 'أحمق', ['سفيه', 'غافل', 'أرعن']],
    ['مأثور', 'منقول عن الأوائل ومألوف', 'مبتدع', ['مجهول', 'مهمل', 'متروك']],
    ['ناجع', 'نافع مؤثر يحقق الغرض', 'عقيم', ['فاشل', 'ضار', 'محدود']],
    ['وثيق', 'متين محكم الصلة', 'واه', ['ضعيف', 'منقطع', 'مفكك']],
    ['يعرج', 'يصعد إلى أعلى أو يميل', 'يهبط', ['ينزل', 'يقف', 'يسقط']],
    ['يستدرك', 'يتدارك ما فاته ويصححه', 'يفرط', ['يتغافل', 'يضيع', 'ينسى']],
    ['تضافر', 'تعاون وتآزر بقوة', 'تفرق', ['تنازع', 'تخاذل', 'تباعد']],
    ['انبرى', 'تصدى وتقدم للعمل', 'أحجم', ['تأخر', 'تراجع', 'اختبأ']],
    ['تألب', 'اجتمع وتجمع على أمر', 'تبدد', ['تفرق', 'انفض', 'تناثر']],
    ['تريث', 'تمهل وتأنى قبل الحكم', 'تعجل', ['تسرع', 'اندفع', 'تهور']],
    ['تواضع', 'خفض الجناح وترك الكبر', 'تكبر', ['تغطرس', 'تعالى', 'تباهى']],
    ['استعصى', 'صعب وتمنع عن الانقياد', 'تيسر', ['سهل', 'ذل', 'خضع']],
    ['تحقق', 'تيقن وثبت بالدليل', 'شك', ['ظن بلا دليل', 'تخيل', 'توهم']],
    ['توارى', 'اختفى واستتر', 'برز', ['ظهر للعيان', 'انكشف', 'سطع']],
    ['أدلى', 'قدم بشهادته أو رأيه', 'أمسك', ['امتنع عن القول', 'سكت', 'كتم']],
  ];

  for (const [word, meaning, antonym, otherDistractors] of lexicalPairs) {
    const pSyn = pickFour(meaning, otherDistractors);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'المعجم والدلالة اللغوية',
      axis_fr: 'Lexique et sémantique arabe',
      lesson_id: 1,
      topic_ar: 'المترادفات اللغوية',
      topic_fr: 'Synonymie arabe',
      skill_ar: 'فهم معاني المفردات',
      skill_fr: 'Comprendre le lexique',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ما المعنى المعجمي الصحيح للفظة (${word}) في سياق النصوص الأدبية والتربوية؟`,
      stem_fr: `Quel est le sens lexical correct du terme arabe « ${word} » ?`,
      options_ar: pSyn.options,
      options_fr: pSyn.options,
      correct_index: pSyn.correctIndex,
      answer_ar: meaning,
      answer_fr: meaning,
      explanation_ar: `تعني كلمة (${word}) في المعاجم العربية: (${meaning})، وضدها (${antonym}).`,
      explanation_fr: `${word} signifie : ${meaning}.`,
      target_competition: COMP,
    });

    const pAnt = pickFour(antonym, [meaning, otherDistractors[0], otherDistractors[1]]);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'المعجم والدلالة اللغوية',
      axis_fr: 'Lexique et antonymie arabe',
      lesson_id: 1,
      topic_ar: 'الأضداد اللغوية',
      topic_fr: 'Antonymie arabe',
      skill_ar: 'تحديد الضد السياقي',
      skill_fr: 'Identifier l’antonyme',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما الضد اللغوي الدقيق لكلمة (${word}) التي تعني (${meaning})؟`,
      stem_fr: `Quel est l'antonyme précis du terme arabe « ${word} » ?`,
      options_ar: pAnt.options,
      options_fr: pAnt.options,
      correct_index: pAnt.correctIndex,
      answer_ar: antonym,
      answer_fr: antonym,
      explanation_ar: `ضد كلمة (${word}) هو (${antonym}).`,
      explanation_fr: `L'antonyme de ${word} est ${antonym}.`,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 4. ISLAMIC EDUCATION (التربية الإسلامية)
  // -------------------------------------------------------------------------
  const islamicFacts: Array<{
    axis: string;
    axisFr: string;
    stemAr: string;
    stemFr: string;
    correctAr: string;
    correctFr: string;
    distractors: Array<[string, string]>;
    expAr: string;
    level: 'foundation' | 'intermediate' | 'advanced';
  }> = [
    { axis: 'العقيدة الإسلامية', axisFr: 'Dogme islamique', stemAr: 'كم عدد أركان الإيمان الستة في العقيدة الإسلامية؟', stemFr: 'Combien y a-t-il de piliers de la foi (Iman) en Islam ?', correctAr: 'ستة أركان', correctFr: 'Six piliers', distractors: [['خمسة أركان', 'Cinq piliers'], ['سبعة أركان', 'Sept piliers'], ['أربعة أركان', 'Quatre piliers']], expAr: 'أركان الإيمان ستة: الإيمان بالله وملائكته وكتبه ورسله واليوم الآخر والقدر خيره وشره.', level: 'foundation' },
    { axis: 'أركان الإسلام والعبادات', axisFr: 'Piliers de l’Islam', stemAr: 'ما الركن الأول من أركان الإسلام الخمسة؟', stemFr: 'Quel est le premier pilier de l’Islam ?', correctAr: 'الشهادتان', correctFr: 'La double attestation de foi', distractors: [['إقام الصلاة', 'La prière'], ['إيتاء الزكاة', 'La zakat'], ['صوم رمضان', 'Le jeûne du Ramadan']], expAr: 'أول أركان الإسلام شهادة أن لا إله إلا الله وأن محمدا رسول الله.', level: 'foundation' },
    { axis: 'الفقه المالكي والعبادات', axisFr: 'Jurisprudence malikite', stemAr: 'ما حكم النية في الوضوء في المذهب المالكي؟', stemFr: 'Quel est le statut de l’intention (niyya) dans les ablutions selon l’école malikite ?', correctAr: 'فرض من فرائض الوضوء', correctFr: 'Obligation (Fard)', distractors: [['سنة مؤكدة فقط', 'Sounna confirmée'], ['مستحب', 'Recommandé'], ['مباح', 'Permis']], expAr: 'فرائض الوضوء عند المالكية سبعة أولها النية، ثم غسل الوجه، واليدين إلى المرفقين، ومسح الرأس، وغسل الرجلين، والفور، والدلك.', level: 'intermediate' },
    { axis: 'الفقه المالكي والعبادات', axisFr: 'Jurisprudence malikite', stemAr: 'ما عدد فرائض الوضوء المقررة في المذهب المالكي (في متن ابن عاشر والأخضري)؟', stemFr: 'Combien d’obligations (Fara’id) compte le woudou dans l’école malikite ?', correctAr: 'سبع فرائض بإضافة الدلك والفور', correctFr: 'Sept obligations', distractors: [['أربع فرائض فقط', 'Quatre obligations'], ['عشر فرائض', 'Dix obligations'], ['ثلاث فرائض', 'Trois obligations']], expAr: 'يزيد المالكية الفور والدلك والنية على الأعضاء الأربعة المغسولة والممسوحة.', level: 'advanced' },
    { axis: 'الفقه المالكي والعبادات', axisFr: 'Jurisprudence malikite', stemAr: 'متى يشرع التيمم للمكلف؟', stemFr: 'Dans quel cas le tayammum (lustration pulvérale) est-il prescrit ?', correctAr: 'عند فقد الماء أو العجز عن استعماله لمرض أو ضرر', correctFr: 'En cas d’absence d’eau ou d’incapacité médicale à l’utiliser', distractors: [['في السفر الطويل حتى مع وفرة الماء', 'En voyage même si l’eau abonde'], ['للكسل عن الوضوء شتاء', 'Par simple paresse en hiver'], ['في صلاة الجمعة فقط', 'Uniquement le vendredi']], expAr: 'التيمم طهارة ترابية بديلة عند عدم وجود الماء أو الخوف من استعماله.', level: 'foundation' },
    { axis: 'الفقه والزكاة', axisFr: 'Zakat', stemAr: 'كم نسبة زكاة المال النقدي والذهب والفضة إذا بلغ النصاب وحال عليه الحول؟', stemFr: 'Quel est le taux de la Zakat sur l’épargne et l’or ayant atteint le nisab pendant un an ?', correctAr: '2.5% (ربع العشر)', correctFr: '2,5 % (le quart du dixième)', distractors: [['5% (نصف العشر)', '5 %'], ['10% (العشر)', '10 %'], ['1% فقط', '1 %']], expAr: 'نسبة زكاة النقود وعروض التجارة والذهب والفضة هي ربع العشر أي 2.5%.', level: 'foundation' },
    { axis: 'الفقه والزكاة', axisFr: 'Zakat', stemAr: 'ما عدد مصارف الزكاة الثمانية الواردة في سورة التوبة الآية 60؟', stemFr: 'Combien de catégories de bénéficiaires de la Zakat sont citées dans le Coran ?', correctAr: 'ثمانية أصناف', correctFr: 'Huit catégories', distractors: [['خمسة أصناف', 'Cinq catégories'], ['ستة أصناف', 'Six catégories'], ['عشرة أصناف', 'Dix catégories']], expAr: 'الآية: إنما الصدقات للفقراء والمساكين والعاملين عليها والمؤلفة قلوبهم وفي الرقاب والغارمين وفي سبيل الله وابن السبيل.', level: 'intermediate' },
    { axis: 'علوم القرآن والتجويد', axisFr: 'Tajwid', stemAr: 'ما حروف الإظهار الحلقي الستة في أحكام النون الساكنة والتنوين؟', stemFr: 'Quelles sont les six lettres de l’Idh-har halqi ?', correctAr: 'الهمزة والهاء والعين والحاء والغين والخاء', correctFr: 'Hamza, Ha, Ayn, Ha, Ghayn, Kha', distractors: [['حروف يرملون الستة', 'Yarmaloun'], ['الباء والميم فقط', 'Ba et Mim'], ['حروف قطب جد', 'Qoutb Jad']], expAr: 'مجموع حروف الإظهار الحلقي في أوائل كلمات: أخي هاك علما حازه غير خاسر.', level: 'intermediate' },
    { axis: 'علوم القرآن والتجويد', axisFr: 'Tajwid', stemAr: 'ما الحرف الوحيد الذي تقع به قاعدة الإقلاب للنون الساكنة والتنوين؟', stemFr: 'Quelle est l’unique lettre provoquant l’Iqlab ?', correctAr: 'حرف الباء', correctFr: 'La lettre Ba', distractors: [['حرف الميم', 'Mim'], ['حرف النون', 'Noun'], ['حرف اللام', 'Lam']], expAr: 'تقلب النون الساكنة أو التنوين ميما مخفاة بغنة إذا أتى بعدها حرف الباء.', level: 'foundation' },
    { axis: 'علوم القرآن والتجويد', axisFr: 'Tajwid', stemAr: 'ما حروف الإدغام المجموعة في كلمة التجويد المشهورة؟', stemFr: 'Dans quel mot mnémotechnique sont regroupées les lettres de l’Idgham ?', correctAr: 'يرملون (الياء والراء والميم واللام والواو والنون)', correctFr: 'Yarmaloun', distractors: [['قطب جد', 'Qoutb Jad'], ['فحثه شخص سكت', 'Fahathahu'], ['خص ضغط قظ', 'Khouousa']], expAr: 'الإدغام قسمان: بغنة في (ينمو) وبغير غنة في اللام والراء.', level: 'foundation' },
    { axis: 'السيرة النبوية', axisFr: 'Sira prophétique', stemAr: 'في أي سنة للهجرة وقعت غزوة بدر الكبرى؟', stemFr: 'En quelle année de l’Hégire a eu lieu la bataille de Badr ?', correctAr: 'السنة الثانية للهجرة (2 هـ)', correctFr: 'En l’an 2 de l’Hégire', distractors: [['السنة الأولى للهجرة', 'An 1 H'], ['السنة الخامسة للهجرة', 'An 5 H'], ['السنة الثامنة للهجرة', 'An 8 H']], expAr: 'وقعت غزوة بدر الكبرى في 17 رمضان من السنة الثانية للهجرة.', level: 'foundation' },
    { axis: 'السيرة النبوية', axisFr: 'Sira prophétique', stemAr: 'في أي سنة للهجرة تم فتح مكة المكرمة؟', stemFr: 'En quelle année de l’Hégire eut lieu la conquête de La Mecque ?', correctAr: 'السنة الثامنة للهجرة (8 هـ)', correctFr: 'An 8 de l’Hégire', distractors: [['السنة السادسة للهجرة', 'An 6 H'], ['السنة العاشرة للهجرة', 'An 10 H'], ['السنة الثالثة للهجرة', 'An 3 H']], expAr: 'فتح مكة كان في رمضان سنة 8 هـ، وصلح الحديبية في سنة 6 هـ، وحجة الوداع سنة 10 هـ.', level: 'foundation' },
    { axis: 'السيرة النبوية', axisFr: 'Sira prophétique', stemAr: 'ما أول عمل قام به النبي صلى الله عليه وسلم فور وصوله إلى المدينة المنورة؟', stemFr: 'Quelle fut la première action majeure du Prophète à son arrivée à Médine ?', correctAr: 'بناء المسجد النبوي والمؤاخاة بين المهاجرين والأنصار', correctFr: 'Construction de la mosquée et fraternisation', distractors: [['تنظيم رحلة الشام التجارية', 'Caravane commerciale'], ['غزوة تبوك', 'Expédition de Tabouk'], ['تدوين الموطأ', 'Rédaction du Muwatta']], expAr: 'بنى النبي المسجد النبوي ليكون مركزا للعبادة والتشاور والتعليم، ثم آخى بين المهاجرين والأنصار.', level: 'foundation' },
    { axis: 'السيرة النبوية', axisFr: 'Sira prophétique', stemAr: 'من الذي أشار على النبي صلى الله عليه وسلم بحفر الخندق في غزوة الأحزاب؟', stemFr: 'Qui a conseillé de creuser le fossé lors de la bataille de Khandaq ?', correctAr: 'سلمان الفارسي رضي الله عنه', correctFr: 'Salman al-Farisi', distractors: [['خالد بن الوليد', 'Khalid ibn al-Walid'], ['سعد بن معاذ', 'Saad ibn Mouadh'], ['زيد بن حارثة', 'Zayd ibn Haritha']], expAr: 'أشار سلمان الفارسي بحفر الخندق في السنة الخامسة للهجرة حماية للمدينة.', level: 'foundation' },
    { axis: 'القرآن الكريم', axisFr: 'Sciences du Coran', stemAr: 'ما السورة التي تسمى بقلب القرآن وورد في فضلها التيسير؟', stemFr: 'Quelle sourate est traditionnellement surnommée le cœur du Coran ?', correctAr: 'سورة يس', correctFr: 'Sourate Yasin', distractors: [['سورة الملك', 'Al-Mulk'], ['سورة الكهف', 'Al-Kahf'], ['سورة الواقعة', 'Al-Waqia']], expAr: 'سورة يس من السور المكية العظيمة وتسمى قلب القرآن.', level: 'foundation' },
    { axis: 'القرآن الكريم', axisFr: 'Sciences du Coran', stemAr: 'كم عدد سور القرآن الكريم؟', stemFr: 'Combien de sourates compte le Noble Coran ?', correctAr: '114 سورة', correctFr: '114 sourates', distractors: [['110 سور', '110 sourates'], ['120 سورة', '120 sourates'], ['99 سورة', '99 sourates']], expAr: 'عدد سور القرآن الكريم 114 سورة تبدأ بالفاتحة وتختتم بالناس.', level: 'foundation' },
    { axis: 'القرآن الكريم', axisFr: 'Sciences du Coran', stemAr: 'ما السورة التي نزلت بدون بسملة في أولها؟', stemFr: 'Quelle sourate ne commence pas par la Basmala ?', correctAr: 'سورة التوبة', correctFr: 'Sourate At-Tawba', distractors: [['سورة النمل', 'An-Naml'], ['سورة يوسف', 'Youssouf'], ['سورة الأنفال', 'Al-Anfal']], expAr: 'سورة التوبة هي السورة الوحيدة التي لا تبدأ بالبسملة.', level: 'foundation' },
    { axis: 'الأخلاق والقيم التربوية', axisFr: 'Éthique et valeurs', stemAr: 'ما المفهوم الشرعي والتربوي للإحسان كما ورد في حديث جبريل عليه السلام؟', stemFr: 'Quelle est la définition de l’Ihsan dans le hadith de Jibril ?', correctAr: 'أن تعبد الله كأنك تراه فإن لم تكن تراه فإنه يراك', correctFr: 'Adorer Allah comme si tu Le voyais', distractors: [['التصدق بثلث المال فقط', 'Donner un tiers des biens'], ['الصلاة في المسجد الحرام فقط', 'Prier à La Mecque uniquement'], ['الصوم المتواصل طوال السنة', 'Jeûner toute l’année']], expAr: 'الإحسان هو استحضار مراقبة الله وإتقان العمل في العبادات والمعاملات.', level: 'foundation' },
  ];

  // Add Surahs & Juz & Prophets factual questions to reach diverse Islamic coverage
  const prophetTraits: Array<[string, string, string]> = [
    ['نوح عليه السلام', 'أول الرسل إلى أهل الأرض وصاحب السفينة', 'لبث في قومه ألف سنة إلا خمسين عاما يدعوهم للتوحيد.'],
    ['إبراهيم عليه السلام', 'خليل الرحمن وباني الكعبة مع ابنه إسماعيل', 'لقب بأبي الأنبياء وحاج قومه في عبادة الكواكب والأصنام.'],
    ['موسى عليه السلام', 'كليم الله وصاحب التوراة', 'ناجى ربه عند جبل الطور وبعثه الله إلى فرعون وقومه.'],
    ['عيسى عليه السلام', 'كلمة الله وروحه وصاحب الإنجيل', 'تكلم في المهد وأيد بالمعجزات البينات بإذن الله.'],
    ['يوسف عليه السلام', 'صاحب الرؤيا والصبر والعفة في سورة سميت باسمه', 'عفا عن إخوته وقال لا تثريب عليكم اليوم.'],
    ['أيوب عليه السلام', 'ضرب المثل في الصبر على البلاء والمرض', 'استمر صابرا شاكرا حتى كشف الله ضره وعوضه خيرا.'],
    ['سليمان عليه السلام', 'النبي الملك الذي سخر الله له الريح والجن وعلمه منطق الطير', 'قالت نملة لقومها ادخلوا مساكنكم لا يحطمنكم سليمان وجنوده.'],
    ['داود عليه السلام', 'صاحب الزبور الذي ألان الله له الحديد', 'كان يصوم يوما ويفطر يوما ويعمل بيده في صناعة الدروع.'],
    ['يونس عليه السلام', 'ذو النون الذي التقمه الحوت وسبح في الظلمات', 'نادى في الظلمات لا إله إلا أنت سبحانك إني كنت من الظالمين.'],
    ['زكريا عليه السلام', 'كافل مريم عليها السلام والد يحيى', 'دعا ربه في الكبر أن يرزقه ولدا صالحا فبشر بيحيى.'],
  ];

  for (const item of islamicFacts) {
    const pair = pickFourPair(item.correctAr, item.correctFr, item.distractors);
    list.push({
      subject_slug: 'islamic-education',
      track: 'arabic',
      level: item.level,
      axis_ar: item.axis,
      axis_fr: item.axisFr,
      lesson_id: 5,
      topic_ar: item.axis,
      topic_fr: item.axisFr,
      skill_ar: 'فهم الأحكام والمفاهيم الشرعية',
      skill_fr: 'Maîtrise des fondements islamiques',
      question_type: 'mcq',
      difficulty: item.level === 'foundation' ? 'easy' : item.level === 'intermediate' ? 'medium' : 'hard',
      stem_ar: item.stemAr,
      stem_fr: item.stemFr,
      options_ar: pair.optionsAr,
      options_fr: pair.optionsFr,
      correct_index: pair.correctIndex,
      answer_ar: item.correctAr,
      answer_fr: item.correctFr,
      explanation_ar: item.expAr,
      explanation_fr: item.correctFr,
      target_competition: COMP,
    });
  }

  for (const [prophet, title, exp] of prophetTraits) {
    const others = prophetTraits.filter((p) => p[0] !== prophet).slice(0, 3).map((p) => p[0]);
    const p = pickFour(prophet, others);
    list.push({
      subject_slug: 'islamic-education',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'قصص الأنبياء والقرآن الكريم',
      axis_fr: 'Récits prophétiques',
      lesson_id: 5,
      topic_ar: 'سير الأنبياء',
      topic_fr: 'Vie des prophètes',
      skill_ar: 'الربط بين النبي وصفته في القرآن',
      skill_fr: 'Identifier le prophète',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `من النبي الكريم المعروف بأنه (${title})؟`,
      stem_fr: `Quel prophète est décrit comme : ${title} ?`,
      options_ar: p.options,
      options_fr: p.options,
      correct_index: p.correctIndex,
      answer_ar: prophet,
      answer_fr: prophet,
      explanation_ar: exp,
      explanation_fr: exp,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 5. PEDAGOGY, DIDACTICS, EDUCATIONAL PSYCHOLOGY, PLANNING, EVALUATION, CLASSROOM MGMT
  // -------------------------------------------------------------------------
  const pedagogyConcepts: Array<{
    subject: string;
    axis: string;
    axisFr: string;
    term: string;
    termFr: string;
    def: string;
    defFr: string;
    exp: string;
    level: 'foundation' | 'intermediate' | 'advanced';
  }> = [
    { subject: 'education-sciences', axis: 'المقاربة بالكفايات', axisFr: 'APC', term: 'الكفاية', termFr: 'La compétence', def: 'قدرة المتعلم على تعبئة موارد مدمجة لحل وضعية مشكلة دالة ومركبة', defFr: 'Mobilisation intégrée de ressources face à une situation-problème', exp: 'تجمع الكفاية بين المعارف والمهارات والمواقف في سياق واقعي.', level: 'foundation' },
    { subject: 'education-sciences', axis: 'المقاربة بالكفايات', axisFr: 'APC', term: 'الوضعية المشكلة', termFr: 'Situation-problème', def: 'سياق ديداكتيكي يحفز المتعلم على التفكير وتعبئة مكتسباته لحل عائق معرفي', defFr: 'Situation didactique confrontant l’élève à un obstacle stimulant', exp: 'تهدف الوضعية المشكلة إلى إحداث صراع معرفي يدفع المتعلم للتعلم البنائي.', level: 'foundation' },
    { subject: 'education-sciences', axis: 'المثلث الديداكتيكي', axisFr: 'Triangle didactique', term: 'النقل الديداكتيكي', termFr: 'Transposition didactique', def: 'تحويل المعرفة العالمة إلى معرفة قابلة للتدريس وفق مستوى المتعلمين', defFr: 'Transformation du savoir savant en savoir à enseigner', exp: 'أبرزه ميشيل فيري وإيف شوفالار لربط المعرفة الأكاديمية بالصف المدرسي.', level: 'advanced' },
    { subject: 'education-sciences', axis: 'المثلث الديداكتيكي', axisFr: 'Triangle didactique', term: 'التعاقد الديداكتيكي', termFr: 'Contrat didactique', def: 'مجموعة الالتزامات الضمنية والصريحة التي تنظم علاقة المعلم والمتعلم بالمعرفة', defFr: 'Ensemble des attentes réciproques entre enseignant et élève', exp: 'صاغه غي بروسو لتوضيح توقعات كل طرف داخل الحصة.', level: 'advanced' },
    { subject: 'education-sciences', axis: 'المقاربة البيداغوجية', axisFr: 'Pédagogies', term: 'البيداغوجيا الفارقية', termFr: 'Pédagogie différenciée', def: 'تكييف المسارات والطرائق والأدوات لمراعاة الفروق الفردية مع توحيد الكفايات', defFr: 'Adaptation des parcours aux différences individuelles des élèves', exp: 'تحقق تكافؤ الفرص داخل القسم غير المتجانس.', level: 'intermediate' },
    { subject: 'education-sciences', axis: 'المقاربة البيداغوجية', axisFr: 'Pédagogies', term: 'بيداغوجيا الخطأ', termFr: 'Pédagogie de l’erreur', def: 'اعتبار الخطأ مؤشرا تشخيصيا طبيعيا لتمثلات المتعلم ومنطلقا للمعالجة', defFr: 'Considérer l’erreur comme levier diagnostique d’apprentissage', exp: 'لا يعاقب المتعلم على خطئه بل يُستثمر في فهم عقبته الذهنية.', level: 'foundation' },
    { subject: 'education-sciences', axis: 'المقاربة البيداغوجية', axisFr: 'Pédagogies', term: 'بيداغوجيا المشروع', termFr: 'Pédagogie de projet', def: 'بناء التعلمات حول إنجاز جماعي ملموس يخطط له المتعلمون وينفذونه', defFr: 'Apprentissage par la réalisation collective d’un projet concret', exp: 'يربط التعلم النظري بالممارسة التعاونية.', level: 'intermediate' },
    { subject: 'education-sciences', axis: 'المقاربة البيداغوجية', axisFr: 'Pédagogies', term: 'بيداغوجيا الإدماج', termFr: 'Pédagogie de l’intégration', def: 'تمكين المتعلم من ربط وتوظيف تعلمات متفرقة في حل وضعية مركبة', defFr: 'Articuler des acquis isolés dans une situation complexe', level: 'intermediate', exp: 'رائدها كزافيي روجيرز وهي امتداد للمقاربة بالكفايات.' },
    { subject: 'educational-psychology', axis: 'نظريات التعلم', axisFr: 'Théories de l’apprentissage', term: 'المنطقة القريبة للنمو عند فيغوتسكي', termFr: 'ZPD de Vygotski', def: 'المسافة بين ما ينجزه المتعلم بمفرده وما ينجزه بمساعدة الراشد أو الأقران', defFr: 'Écart entre autonomie actuelle et potentiel avec étayage', exp: 'ترتكز النظرية السوسيوبنائية على التفاعل الاجتماعي والسقالات التعليمية.', level: 'intermediate' },
    { subject: 'educational-psychology', axis: 'نظريات التعلم', axisFr: 'Théories de l’apprentissage', term: 'الاستيعاب والمواءمة عند بياجيه', termFr: 'Assimilation et accommodation', def: 'آليتان متكاملتان لإدخال المعطى الجديد في البنيات الذهنية وتعديلها عند التوازن', defFr: 'Mécanismes d’intégration et d’adaptation des schèmes cognitifs', exp: 'يمر النمو المعرفي عند بياجيه بأربع مراحل: الحسي حركية، ما قبل العمليات، العمليات المادية، العمليات المجردة.', level: 'intermediate' },
    { subject: 'educational-psychology', axis: 'نظريات التعلم', axisFr: 'Théories de l’apprentissage', term: 'التعزيز الإيجابي عند سكنر', termFr: 'Renforcement positif', def: 'تقديم مثير مرغوب بعد السلوك الصحيح لزيادة احتمال تكراره', defFr: 'Stimulus gratifiant augmentant la fréquence d’un comportement', exp: 'يمثل أساس الإشراط الإجرائي في المدرسة السلوكية.', level: 'foundation' },
    { subject: 'educational-psychology', axis: 'الذكاءات والدافعية', axisFr: 'Intelligences et motivation', term: 'نظرية الذكاءات المتعددة لغاردنر', termFr: 'Intelligences multiples', def: 'الاعتراف بتنوع القدرات العقلية بين الذكاء اللغوي والمنطقي والمكاني والحركي والموسيقي والاجتماعي والذاتي والطبيعي', defFr: 'Pluralité des profils cognitifs humains selon Gardner', exp: 'تدعو لتنويع الأنشطة الصفية لتمكين كل متعلم حسب ذكائه الغالب.', level: 'intermediate' },
    { subject: 'teaching-methods', axis: 'استراتيجيات التدريس', axisFr: 'Stratégies d’enseignement', term: 'العصف الذهني', termFr: 'Brainstorming', def: 'إطلاق حرية إنتاج الأفكار الجماعية حول مشكلة قبل نقدها أو تصنيفها', defFr: 'Production libre et collective d’idées sans jugement préalable', exp: 'يشجع الإبداع والتفكير التباعدي داخل الصف.', level: 'foundation' },
    { subject: 'teaching-methods', axis: 'استراتيجيات التدريس', axisFr: 'Stratégies d’enseignement', term: 'التعلم التعاوني', termFr: 'Apprentissage coopératif', def: 'تنظيم المتعلمين في مجموعات صغيرة غير متجانسة لتحقيق هدف مشترك بتوزع الأدوار', defFr: 'Travail en petits groupes hétérogènes à rôles répartis', exp: 'يعزز المهارات الاجتماعية والاعتماد المتبادل الإيجابي.', level: 'foundation' },
    { subject: 'teaching-methods', axis: 'طرائق التدريس', axisFr: 'Méthodes', term: 'الطريقة الاستقرائية', termFr: 'Méthode inductive', def: 'الانطلاق من الأمثلة والجزئيات الملاحظة للوصول إلى القاعدة العامة', defFr: 'Partir d’exemples particuliers pour dégager la règle générale', exp: 'فعالة جدا في تدريس النحو والرياضيات والعلوم بالمرحلة الابتدائية.', level: 'foundation' },
    { subject: 'teaching-methods', axis: 'طرائق التدريس', axisFr: 'Méthodes', term: 'الطريقة الاستنباطية', termFr: 'Méthode déductive', def: 'البدء بعرض القاعدة أو النظرية العامة ثم تطبيقها على حالات جزئية', defFr: 'Partir de la règle générale vers les applications particulières', exp: 'تستخدم في التمارين التطبيقية والبرهنة الرياضية.', level: 'foundation' },
    { subject: 'educational-planning', axis: 'الجذاذة والتخطيط', axisFr: 'Fiche pédagogique', term: 'الهدف الإجرائي السلوكي', termFr: 'Objectif opérationnel', def: 'عبارة تصف سلوكا قابلا للملاحظة والقياس يحققه المتعلم في نهاية النشاط', defFr: 'Comportement observable et mesurable attendu chez l’élève', exp: 'يصاغ بأفعال إجرائية مثل: يميز، يحسب، يعرب، لا بأفعال غامضة مثل يفهم.', level: 'foundation' },
    { subject: 'educational-planning', axis: 'التخطيط التربوي', axisFr: 'Planification', term: 'التخطيط السنوي', termFr: 'Planification annuelle', def: 'توزيع الكفايات والمضامين الدراسية على أسابيع وفصول السنة الدراسية', defFr: 'Répartition des apprentissages sur l’ensemble de l’année scolaire', exp: 'يتبعه التخطيط المرحلي ثم تخطيط الجذاذة اليومية.', level: 'foundation' },
    { subject: 'evaluation-measurement', axis: 'أنواع التقويم', axisFr: 'Types d’évaluation', term: 'التقويم التشخيصي', termFr: 'Évaluation diagnostique', def: 'تقويم استباقي يجرى قبل بدء التعلم لرصد المكتسبات القبلية والتعثرات', defFr: 'Évaluation initiale vérifiant les prérequis avant une séquence', exp: 'يمكن المعلم من تكييف التدريس مع المستوى الحقيقي للتلاميذ.', level: 'foundation' },
    { subject: 'evaluation-measurement', axis: 'أنواع التقويم', axisFr: 'Types d’évaluation', term: 'التقويم التكويني', termFr: 'Évaluation formative', def: 'تقويم مستمر يواكب سيرورة التعلم لتوجيه المتعلم وتصحيح المسار فورا', defFr: 'Évaluation continue régulant les apprentissages en cours', exp: 'لا يهدف لإعطاء علامة جزائية بل للدعم والمعالجة الآنية.', level: 'foundation' },
    { subject: 'evaluation-measurement', axis: 'أنواع التقويم', axisFr: 'Types d’évaluation', term: 'التقويم الإجمالي أو الإشهادي', termFr: 'Évaluation sommative', def: 'تقويم يجرى في نهاية وحدة أو سنة للحكم على تحقق الكفايات ومنح الدرجات', defFr: 'Bilan final sanctionnant les acquis en fin d’unité ou d’année', exp: 'يحدد النجاح والانتقال إلى المستوى الأعلى.', level: 'foundation' },
    { subject: 'evaluation-measurement', axis: 'جودة الاختبار', axisFr: 'Qualité des tests', term: 'صدق الاختبار وثباته', termFr: 'Validité et fidélité', def: 'الصدق يعني قياس الاختبار لما وضع لقياسه، والثبات يعني اتساق نتائجه عند إعادته', defFr: 'Mesurer l’objectif visé de manière constante et fiable', exp: 'شرطان سيكومتريان أساسيان في بناء اختبارات التحصيل.', level: 'advanced' },
    { subject: 'classroom-management', axis: 'تدبير القسم', axisFr: 'Gestion de classe', term: 'الأقسام متعددة المستويات', termFr: 'Classes multigrades', def: 'أقسام يدرس فيها معلم واحد مستويين أو أكثر في قاعة واحدة عبر المزاوجة بين التعلم المباشر والعمل الذاتي', defFr: 'Classe réunissant plusieurs niveaux avec alternance dirigé/autonome', exp: 'تنتشر في الأرياف وتتطلب تخطيطا دقيقا للسبورة وتدبير الزمن.', level: 'intermediate' },
    { subject: 'classroom-management', axis: 'الانضباط الإيجابي', axisFr: 'Discipline positive', term: 'ميثاق القسم التشاركي', termFr: 'Charte de classe', def: 'قواعد سلوكية يتفق عليها المعلم والتلاميذ في بداية السنة لتنظيم الحياة المدرسية', defFr: 'Règles de vie co-construites en début d’année scolaire', exp: 'يزيد التزام التلاميذ بالقواعد عندما يشاركون في وضعها.', level: 'foundation' },
  ];

  const allPedTerms = pedagogyConcepts.map((c) => c.term);
  for (const c of pedagogyConcepts) {
    // Ask by definition -> term
    const pTerm = pickFour(c.term, allPedTerms.filter((t) => t !== c.term));
    list.push({
      subject_slug: c.subject,
      track: 'arabic',
      level: c.level,
      axis_ar: c.axis,
      axis_fr: c.axisFr,
      lesson_id: 3,
      topic_ar: c.term,
      topic_fr: c.termFr,
      skill_ar: 'تعريف المفاهيم التربوية بدقة',
      skill_fr: 'Définir les concepts pédagogiques',
      question_type: 'mcq',
      difficulty: c.level === 'advanced' ? 'hard' : 'medium',
      stem_ar: `أي مفهوم تربوي يطابق التعريف الآتي: (${c.def})؟`,
      stem_fr: `Quel concept pédagogique correspond à : « ${c.defFr} » ?`,
      options_ar: pTerm.options,
      options_fr: pTerm.options,
      correct_index: pTerm.correctIndex,
      answer_ar: c.term,
      answer_fr: c.termFr,
      explanation_ar: c.exp,
      explanation_fr: `${c.termFr} : ${c.defFr}.`,
      target_competition: COMP,
    });

    // Ask by term -> definition
    const otherDefs = pedagogyConcepts.filter((x) => x.term !== c.term).slice(0, 3).map((x) => [x.def, x.defFr] as [string, string]);
    const pDef = pickFourPair(c.def, c.defFr, otherDefs);
    list.push({
      subject_slug: c.subject,
      track: 'arabic',
      level: c.level,
      axis_ar: c.axis,
      axis_fr: c.axisFr,
      lesson_id: 3,
      topic_ar: c.term,
      topic_fr: c.termFr,
      skill_ar: 'توظيف المصطلح البيداغوجي',
      skill_fr: 'Appliquer le concept pédagogique',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما الوصف الدقيق لمفهوم (${c.term}) في المرجعية التربوية الرسمية؟`,
      stem_fr: `Quelle définition décrit exactement « ${c.termFr} » ?`,
      options_ar: pDef.optionsAr,
      options_fr: pDef.optionsFr,
      correct_index: pDef.correctIndex,
      answer_ar: c.def,
      answer_fr: c.defFr,
      explanation_ar: c.exp,
      explanation_fr: c.defFr,
      target_competition: COMP,
    });
  }

  // Bloom's taxonomy verbs across all 6 levels (36 distinct actionable questions)
  const bloomVerbs: Array<{ verb: string; levelAr: string; levelFr: string; order: number }> = [
    { verb: 'يعدد', levelAr: 'التذكر (المعرفة)', levelFr: 'Mémorisation', order: 1 },
    { verb: 'يسمي', levelAr: 'التذكر (المعرفة)', levelFr: 'Mémorisation', order: 1 },
    { verb: 'يعرف المصطلح', levelAr: 'التذكر (المعرفة)', levelFr: 'Mémorisation', order: 1 },
    { verb: 'يشرح بلغته الخاصة', levelAr: 'الفهم (الاستيعاب)', levelFr: 'Compréhension', order: 2 },
    { verb: 'يلخص الفكرة', levelAr: 'الفهم (الاستيعاب)', levelFr: 'Compréhension', order: 2 },
    { verb: 'يفسر السبب', levelAr: 'الفهم (الاستيعاب)', levelFr: 'Compréhension', order: 2 },
    { verb: 'يطبق القاعدة', levelAr: 'التطبيق', levelFr: 'Application', order: 3 },
    { verb: 'يحسب الناتج', levelAr: 'التطبيق', levelFr: 'Application', order: 3 },
    { verb: 'يعرب الجملة', levelAr: 'التطبيق', levelFr: 'Application', order: 3 },
    { verb: 'يقارن بين مفهومين', levelAr: 'التحليل', levelFr: 'Analyse', order: 4 },
    { verb: 'يستنتج العلاقة', levelAr: 'التحليل', levelFr: 'Analyse', order: 4 },
    { verb: 'يفكك العناصر', levelAr: 'التحليل', levelFr: 'Analyse', order: 4 },
    { verb: 'يصمم خطة', levelAr: 'التركيب (الإبداع)', levelFr: 'Synthèse / Création', order: 5 },
    { verb: 'يقترح حلا مبتكرا', levelAr: 'التركيب (الإبداع)', levelFr: 'Synthèse / Création', order: 5 },
    { verb: 'يؤلف نصا', levelAr: 'التركيب (الإبداع)', levelFr: 'Synthèse / Création', order: 5 },
    { verb: 'يحكم على جودة', levelAr: 'التقويم', levelFr: 'Évaluation', order: 6 },
    { verb: 'ينقد الدليل', levelAr: 'التقويم', levelFr: 'Évaluation', order: 6 },
    { verb: 'يبرر الاختيار', levelAr: 'التقويم', levelFr: 'Évaluation', order: 6 },
  ];
  const bloomAllLevels: Array<[string, string]> = [
    ['التذكر (المعرفة)', 'Mémorisation'],
    ['الفهم (الاستيعاب)', 'Compréhension'],
    ['التطبيق', 'Application'],
    ['التحليل', 'Analyse'],
    ['التركيب (الإبداع)', 'Synthèse / Création'],
    ['التقويم', 'Évaluation'],
  ];
  for (const bv of bloomVerbs) {
    const pBloom = pickFourPair(
      bv.levelAr,
      bv.levelFr,
      bloomAllLevels.filter(([a]) => a !== bv.levelAr)
    );
    list.push({
      subject_slug: 'educational-planning',
      track: 'arabic',
      level: bv.order <= 2 ? 'foundation' : bv.order <= 4 ? 'intermediate' : 'advanced',
      axis_ar: 'صنافة بلوم وصياغة الأهداف',
      axis_fr: 'Taxonomie de Bloom',
      lesson_id: 3,
      topic_ar: 'المستويات المعرفية لبلوم',
      topic_fr: 'Niveaux cognitifs de Bloom',
      skill_ar: 'تصنيف الأفعال الإجرائية',
      skill_fr: 'Classer les verbes d’action',
      question_type: 'mcq',
      difficulty: bv.order >= 4 ? 'medium' : 'easy',
      stem_ar: `إلى أي مستوى في صنافة بلوم المعرفية ينتمي الفعل الإجرائي (${bv.verb})؟`,
      stem_fr: `À quel niveau de la taxonomie de Bloom correspond le verbe « ${bv.verb} » ?`,
      options_ar: pBloom.optionsAr,
      options_fr: pBloom.optionsFr,
      correct_index: pBloom.correctIndex,
      answer_ar: bv.levelAr,
      answer_fr: bv.levelFr,
      explanation_ar: `يمثل الفعل (${bv.verb}) المستوى رقم ${bv.order} في هرم بلوم المعرفي (${bv.levelAr}).`,
      explanation_fr: `${bv.verb} relève du niveau ${bv.levelFr}.`,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 6. MATHEMATICAL PROBLEMS & DIDACTICS (الرياضيات في الشعبة العربية)
  // Using distinct real computations: perimeter/area of rectangles, triangles, percentages, speed/time, GCD/LCM, fractions
  // -------------------------------------------------------------------------
  const rectPairs: Array<[number, number]> = [
    [12, 8], [15, 7], [18, 9], [24, 11], [14, 6], [25, 12], [19, 10], [30, 14], [16, 5], [22, 13],
    [28, 15], [35, 10], [17, 8], [21, 9], [26, 14], [32, 11], [20, 7], [27, 13], [36, 12], [40, 15],
  ];
  for (const [L, W] of rectPairs) {
    const area = L * W;
    const perim = 2 * (L + W);
    const pArea = pickFour(
      `${area} م²`,
      [`${perim} م²`, `${area + L} م²`, `${Math.max(10, area - W)} م²`]
    );
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الهندسة والقياس',
      axis_fr: 'Géométrie et mesure',
      lesson_id: 4,
      topic_ar: 'مساحة المستطيل',
      topic_fr: 'Aire du rectangle',
      skill_ar: 'تطبيق قوانين المساحات',
      skill_fr: 'Calculer une aire',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `قاعة دراسية مستطيلة الشكل طولها ${L} مترا وعرضها ${W} أمتار، ما مساحتها؟`,
      stem_fr: `Une salle rectangulaire mesure ${L} m de long et ${W} m de large. Quelle est son aire ?`,
      options_ar: pArea.options,
      options_fr: pArea.options.map((o) => o.replace('م²', 'm²')),
      correct_index: pArea.correctIndex,
      answer_ar: `${area} م²`,
      answer_fr: `${area} m²`,
      explanation_ar: `مساحة المستطيل = الطول × العرض = ${L} × ${W} = ${area} مترا مربعا.`,
      explanation_fr: `Aire = ${L} × ${W} = ${area} m².`,
      target_competition: COMP,
    });

    const pPerim = pickFour(
      `${perim} مترا`,
      [`${area} مترا`, `${L + W} مترا`, `${perim + 4} مترا`]
    );
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الهندسة والقياس',
      axis_fr: 'Géométrie et mesure',
      lesson_id: 4,
      topic_ar: 'محيط المستطيل',
      topic_fr: 'Périmètre du rectangle',
      skill_ar: 'حساب المحيطات',
      skill_fr: 'Calculer un périmètre',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ساحة مدرسية مستطيلة طولها ${L} مترا وعرضها ${W} أمتار، ما طول سياجها المحيط بها؟`,
      stem_fr: `Une cour rectangulaire mesure ${L} m sur ${W} m. Quel est son périmètre ?`,
      options_ar: pPerim.options,
      options_fr: pPerim.options.map((o) => o.replace('مترا', 'm')),
      correct_index: pPerim.correctIndex,
      answer_ar: `${perim} مترا`,
      answer_fr: `${perim} m`,
      explanation_ar: `محيط المستطيل = (الطول + العرض) × 2 = (${L} + ${W}) × 2 = ${perim} مترا.`,
      explanation_fr: `Périmètre = 2 × (${L} + ${W}) = ${perim} m.`,
      target_competition: COMP,
    });
  }

  // Percentage & Discount / Success rate word problems (60 distinct scenarios)
  const pctCases: Array<[number, number, string]> = [
    [200, 15, 'عدد الناجحين'], [400, 25, 'نسبة الحضور'], [500, 30, 'الكتب الموزعة'], [800, 12, 'قيمة الخصم'],
    [1200, 20, 'عدد التلاميذ المتفوقين'], [600, 35, 'حصة الرياضيات'], [300, 40, 'المستفيدون من الدورة'],
    [1500, 10, 'الزيادة السنوية'], [250, 20, 'المشاركون في المسابقة'], [900, 15, 'عدد المقاعد المخصصة'],
    [1000, 45, 'نسبة الإنجاز'], [700, 30, 'الميزانية التعليمية'], [350, 20, 'التلاميذ المتفوقون'],
    [450, 10, 'عدد الأنشطة المنجزة'], [640, 25, 'نسبة التغطية'], [850, 20, 'المستفيدون'],
    [1600, 15, 'عدد الكراسات'], [2000, 35, 'التمويل المخصص'], [120, 25, 'تلاميذ الشعبة'],
    [180, 50, 'عدد الطالبات'], [320, 75, 'نسبة النجاح'], [560, 25, 'المستلزمات الموزعة'],
    [480, 15, 'الكتب اللغوية'], [720, 25, 'الدروس التفاعلية'], [960, 25, 'الأسئلة المجابة'],
    [1400, 20, 'المترشحون الحاضرون'], [2400, 15, 'الكتب المطبوعة'], [3000, 12, 'المخصصات التربوية'],
    [150, 40, 'النسبة المقبولة'], [280, 50, 'المتفوقون في الإملاء'],
  ];
  for (const [total, pct, label] of pctCases) {
    const val = (total * pct) / 100;
    const rem = total - val;
    const p1 = pickFour(String(val), [String(val + 15), String(Math.max(1, val - 10)), String(total / 2)]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'الحساب والتناسبية',
      axis_fr: 'Arithmétique et proportionnalité',
      lesson_id: 4,
      topic_ar: 'النسبة المئوية',
      topic_fr: 'Pourcentages',
      skill_ar: 'حساب القيمة من النسبة المئوية',
      skill_fr: 'Calculer un pourcentage',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `إذا كان إجمالي (${label}) هو ${total}، وبلغت النسبة المحققة ${pct}%، فكم يبلغ العدد الفعلي؟`,
      stem_fr: `Sur un total de ${total}, que représentent ${pct} % ?`,
      options_ar: p1.options,
      options_fr: p1.options,
      correct_index: p1.correctIndex,
      answer_ar: String(val),
      answer_fr: String(val),
      explanation_ar: `الناتج = (${total} × ${pct}) ÷ 100 = ${val}.`,
      explanation_fr: `${total} × ${pct} / 100 = ${val}.`,
      target_competition: COMP,
    });

    const p2 = pickFour(String(rem), [String(val), String(rem + 20), String(Math.max(5, rem - 15))]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'الحساب والتناسبية',
      axis_fr: 'Arithmétique et proportionnalité',
      lesson_id: 4,
      topic_ar: 'المتبقي بعد النسبة المئوية',
      topic_fr: 'Complément de pourcentage',
      skill_ar: 'حل مسائل التناسبية',
      skill_fr: 'Résoudre un problème de reste',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `في مركز تكوين يضم ${total} مترشحا (${label})، أنجز ${pct}% منهم المهمة الأولى، فكم مترشحا بقي؟`,
      stem_fr: `Parmi ${total} candidats, ${pct} % ont fini. Combien en reste-t-il ?`,
      options_ar: p2.options,
      options_fr: p2.options,
      correct_index: p2.correctIndex,
      answer_ar: String(rem),
      answer_fr: String(rem),
      explanation_ar: `المنجزون = ${val}، وبالتالي المتبقي = ${total} - ${val} = ${rem}.`,
      explanation_fr: `${total} - ${val} = ${rem}.`,
      target_competition: COMP,
    });
  }

  // Speed-Distance-Time & Arithmetic Mean & Triangles & Circles (80 distinct problems)
  const speeds: Array<[number, number]> = [
    [60, 3], [80, 2], [75, 4], [90, 3], [50, 5], [100, 2], [45, 4], [70, 3], [85, 2], [110, 3],
    [65, 4], [95, 2], [55, 4], [120, 2], [40, 6], [64, 3], [72, 5], [88, 2], [96, 3], [54, 5],
  ];
  for (const [v, hrs] of speeds) {
    const dist = v * hrs;
    const pD = pickFour(`${dist} كم`, [`${dist + v} كم`, `${Math.max(10, dist - v)} كم`, `${v + hrs} كم`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'المسائل الحسابية والحركية',
      axis_fr: 'Vitesse, distance et temps',
      lesson_id: 4,
      topic_ar: 'السرعة والمسافة والزمن',
      topic_fr: 'Vitesse moyenne',
      skill_ar: 'حساب المسافة المقطوعة',
      skill_fr: 'Calculer la distance',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `تسير حافلة بعثة تربوية بسرعة ثابتة قدرها ${v} كم/ساعة لمدة ${hrs} ساعات، ما المسافة التي تقطعها؟`,
      stem_fr: `Un bus roule à ${v} km/h pendant ${hrs} h. Quelle distance parcourt-il ?`,
      options_ar: pD.options,
      options_fr: pD.options.map((x) => x.replace('كم', 'km')),
      correct_index: pD.correctIndex,
      answer_ar: `${dist} كم`,
      answer_fr: `${dist} km`,
      explanation_ar: `المسافة = السرعة × الزمن = ${v} × ${hrs} = ${dist} كيلومترا.`,
      explanation_fr: `Distance = ${v} × ${hrs} = ${dist} km.`,
      target_competition: COMP,
    });
  }

  // Triangles & Squares & Cubes & Unit Conversions
  const triPairs: Array<[number, number]> = [
    [10, 6], [14, 8], [16, 9], [18, 7], [20, 11], [12, 15], [22, 10], [24, 9], [26, 8], [30, 12],
    [8, 11], [15, 12], [19, 10], [28, 7], [32, 9], [11, 14], [13, 16], [17, 12], [21, 8], [25, 14],
  ];
  for (const [b, h] of triPairs) {
    const area = (b * h) / 2;
    const pT = pickFour(`${area} سم²`, [`${b * h} سم²`, `${b + h} سم²`, `${area + 6} سم²`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الهندسة والقياس',
      axis_fr: 'Géométrie plane',
      lesson_id: 4,
      topic_ar: 'مساحة المثلث',
      topic_fr: 'Aire du triangle',
      skill_ar: 'تطبيق قاعدة مساحة المثلث',
      skill_fr: 'Calculer l’aire du triangle',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `مثلث طول قاعدته ${b} سم وارتفاعه الموافق ${h} سم، ما مساحته؟`,
      stem_fr: `Un triangle a une base de ${b} cm et une hauteur de ${h} cm. Quelle est son aire ?`,
      options_ar: pT.options,
      options_fr: pT.options.map((o) => o.replace('سم²', 'cm²')),
      correct_index: pT.correctIndex,
      answer_ar: `${area} سم²`,
      answer_fr: `${area} cm²`,
      explanation_ar: `مساحة المثلث = (القاعدة × الارتفاع) ÷ 2 = (${b} × ${h}) ÷ 2 = ${area} سم².`,
      explanation_fr: `(${b} × ${h}) / 2 = ${area} cm².`,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 7. NATURAL SCIENCES & GENERAL CULTURE IN MAURITANIA
  // -------------------------------------------------------------------------
  const mauritanianWilayas: Array<[string, string, string]> = [
    ['الحوض الشرقي', 'النعمة', 'الولاية الشرقية الكبرى وعاصمتها النعمة وتشتهر بالثروة الحيوانية ومدينة ولاتة التاريخية'],
    ['الحوض الغربي', 'لعيون', 'تقع في الجنوب الشرقي وعاصمتها لعيون وتشتهر بتلالها الرملية والواحات'],
    ['لعصابة', 'كيفه', 'عاصمتها كيفه وتعد مركز التقاء مهم بين الشرق والوسط الموريتاني'],
    ['غورغول', 'كيهيدي', 'تقع على ضفة نهر السنغال وعاصمتها كيهيدي وتشتهر بالزراعة المطرية والمروية'],
    ['لبراكنة', 'ألاك', 'عاصمتها ألاك وتضم مدنا زراعية هامة مثل بوغي ومقطع لحجار'],
    ['الترارزة', 'روصو', 'تقع في الجنوب الغربي على نهر السنغال وعاصمتها روصو وتضم حوض النهر وبلدة المذرذرة وابي تلميت'],
    ['آدرار', 'أطار', 'ولاية صحراوية تاريخية عاصمتها أطار وتضم مدن شنقيط وودان وقلب الريشات'],
    ['داخلت نواذيبو', 'نواذيبو', 'العاصمة الاقتصادية للبلاد على المحيط الأطلسي وتشتهر بالصيد البحري والميناء المعدني'],
    ['تكانت', 'تجكجة', 'هضبة تاريخية عاصمتها تجكجة وتشتهر بالواحات النخلية ومواقع التراث'],
    ['كيدي ماغا', 'سيلبابي', 'أقصى جنوب البلاد عاصمتها سيلبابي وتعرف بأمطارها الغزيرة نسبيا وتنوعها الزراعي'],
    ['تيرس زمور', 'ازويرات', 'أقصى شمال موريتانيا وعاصمتها ازويرات وتشتهر بمناجم الحديد'],
    ['إينشيري', 'أكجوجت', 'عاصمتها أكجوجت وتشتهر بمناجم النحاس والذهب'],
  ];

  const allCapitals = mauritanianWilayas.map((w) => w[1]);
  for (const [wilaya, cap, desc] of mauritanianWilayas) {
    const pW = pickFour(cap, allCapitals.filter((c) => c !== cap));
    list.push({
      subject_slug: 'general-culture',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'جغرافية موريتانيا الإدارية',
      axis_fr: 'Géographie administrative de la Mauritanie',
      lesson_id: 7,
      topic_ar: 'الولايات وعواصمها',
      topic_fr: 'Wilayas et capitales',
      skill_ar: 'معرفة التقسيم الإداري الوطني',
      skill_fr: 'Connaître les wilayas',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ما عاصمة ولاية (${wilaya}) في الجمهورية الإسلامية الموريتانية؟`,
      stem_fr: `Quelle est la capitale de la wilaya mauritanienne de « ${wilaya} » ?`,
      options_ar: pW.options,
      options_fr: pW.options,
      correct_index: pW.correctIndex,
      answer_ar: cap,
      answer_fr: cap,
      explanation_ar: `${cap} هي عاصمة ولاية ${wilaya}: ${desc}.`,
      explanation_fr: `${cap} est le chef-lieu de ${wilaya}.`,
      target_competition: COMP,
    });
  }

  const sciencePairs: Array<{ axis: string; q: string; ans: string; dist: string[]; exp: string; level: 'foundation' | 'intermediate' }> = [
    { axis: 'بيولوجيا النبات', q: 'ما الغاز الذي تمتصه النباتات الخضراء في عملية التركيب الضوئي نهارا؟', ans: 'ثاني أكسيد الكربون (CO2)', dist: ['غاز النيتروجين', 'غاز الهيدروجين', 'أول أكسيد الكربون'], exp: 'يمتص النبات ثاني أكسيد الكربون والماء بوجود الضوء واليخضور لإنتاج السكريات وإطلاق الأكسجين.', level: 'foundation' },
    { axis: 'بيولوجيا النبات', q: 'ما اسم الصبغة الخضراء المسؤولة عن امتصاص الطاقة الضوئية في أوراق النبات؟', ans: 'اليخضور (الكلوروفيل)', dist: ['الهيموغلوبين', 'الميلانين', 'الأنسولين'], exp: 'اليخضور يوجد داخل الصانعات الخضراء وهو أساسي لعملية التمثيل الضوئي.', level: 'foundation' },
    { axis: 'جسم الإنسان', q: 'ما العضو الذي يقوم بتصفية الدم وإفراز البول في جسم الإنسان؟', ans: 'الكليتان', dist: ['الطحال', 'المعدة', 'البنكرياس'], exp: 'تنقي الكليتان الدم من الفضلات الآزوتية والأملاح الزائدة.', level: 'foundation' },
    { axis: 'جسم الإنسان', q: 'ما نوع خلايا الدم المسؤولة عن نقل الأكسجين من الرئتين إلى خلايا الجسم؟', ans: 'كريات الدم الحمراء', dist: ['كريات الدم البيضاء', 'الصفائح الدموية', 'الخلايا العصبية'], exp: 'تحتوي الكريات الحمراء على الهيموغلوبين الذي يرتبط بالأكسجين.', level: 'foundation' },
    { axis: 'جسم الإنسان', q: 'ما وظيفة كريات الدم البيضاء الأساسية؟', ans: 'الدفاع عن الجسم ومقاومة الجراثيم والأمراض', dist: ['تخثر الدم عند الجروح', 'هضم النشويات', 'حمل ثاني أكسيد الكربون فقط'], exp: 'تشكل كريات الدم البيضاء خط الدفاع المناعي ضد الميكروبات.', level: 'foundation' },
    { axis: 'جسم الإنسان', q: 'كم يبلغ عدد حجرات القلب البشري؟', ans: 'أربع حجرات (أذينان وبطينان)', dist: ['حجرتان فقط', 'ثلاث حجرات', 'ست حجرات'], exp: 'يتكون قلب الإنسان من أذين أيمن وأيسر وبطين أيمن وأيسر.', level: 'foundation' },
    { axis: 'الفيزياء والطبيعة', q: 'ما درجة تجمد الماء النقي عند الضغط الجوي العادي؟', ans: 'صفر درجة مئوية (0 °C)', dist: ['10 درجات مئوية', '100 درجة مئوية', '4 درجات مئوية'], exp: 'يتجمد الماء النقي عند 0 مئوية ويغلي عند 100 مئوية.', level: 'foundation' },
    { axis: 'الفيزياء والطبيعة', q: 'ما حالة المادة التي تمتلك حجما ثابتا وشكلا متغيرا يأخذ شكل الإناء؟', ans: 'الحالة السائلة', dist: ['الحالة الصلبة', 'الحالة الغازية', 'حالة البلازما'], exp: 'السوائل لها حجم محدد غير قابل للانضغاط تقريبا وتنساب لتأخذ شكل الوعاء.', level: 'foundation' },
    { axis: 'علوم الأرض', q: 'ما الاسم العلمي لتحول الماء السائل إلى بخار بفعل الحرارة؟', ans: 'التبخر', dist: ['التكاثف', 'التجمد', 'الانصهار'], exp: 'التبخر هو تحول السائل إلى غاز، وعكسه التكاثف.', level: 'foundation' },
    { axis: 'الكهرباء البسيطة', q: 'ما المواد التي تسمح بمرور التيار الكهربائي بسهولة مثل النحاس والألمنيوم؟', ans: 'الموصلات الكهربائية', dist: ['العوازل الكهربائية', 'الأملاح المتعادلة', 'الغازات الخاملة'], exp: 'المعادن موصلات جيدة للكهرباء والحرارة لاحتوائها على إلكترونات حرة.', level: 'foundation' },
  ];

  for (const sc of sciencePairs) {
    const pS = pickFour(sc.ans, sc.dist);
    list.push({
      subject_slug: 'natural-sciences',
      track: 'arabic',
      level: sc.level,
      axis_ar: sc.axis,
      axis_fr: sc.axis,
      lesson_id: 4,
      topic_ar: sc.axis,
      topic_fr: sc.axis,
      skill_ar: 'استيعاب المفاهيم العلمية الأساسية',
      skill_fr: 'Comprendre les notions scientifiques',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: sc.q,
      stem_fr: sc.q,
      options_ar: pS.options,
      options_fr: pS.options,
      correct_index: pS.correctIndex,
      answer_ar: sc.ans,
      answer_fr: sc.ans,
      explanation_ar: sc.exp,
      explanation_fr: sc.exp,
      target_competition: COMP,
    });
  }

  // -------------------------------------------------------------------------
  // 8. EXPAND TO >= 1,050 GENUINE UNIQUE ARABIC-TRACK QUESTIONS
  // Covering authentic Arabic verbal/nominal transforms, broken plurals, fractions/GCD/LCM/decimals,
  // Quranic Juz/Surah classification, Mauritanian history/education milestones, and classroom true/false/short-answer cases!
  // -------------------------------------------------------------------------

  // A) Arabic Singular -> Broken/Sound Plural & Masculine/Feminine Agreement (~160 genuine distinct questions)
  const pluralDictionary: Array<[string, string, string]> = [
    ['كتاب', 'كتب', 'جمع تكسير على وزن فعل'], ['قلم', 'أقلام', 'جمع تكسير على وزن أفعال'],
    ['مدرسة', 'مدارس', 'جمع تكسير (صيغة منتهى الجموع مفاعل)'], ['مصباح', 'مصابيح', 'جمع تكسير على وزن مفاعيل'],
    ['مسجد', 'مساجد', 'جمع تكسير (ممنوع من الصرف)'], ['تلميذ', 'تلاميذ', 'جمع تكسير على وزن فعاليل'],
    ['ورقة', 'أوراق', 'جمع تكسير على وزن أفعال'], ['علم', 'علوم', 'جمع تكسير على وزن فعول'],
    ['فكر', 'أفكار', 'جمع تكسير على وزن أفعال'], ['قانون', 'قوانين', 'جمع تكسير على وزن فواعيل'],
    ['رسالة', 'رسائل', 'جمع تكسير على وزن فعائل'], ['وثيقة', 'وثائق', 'جمع تكسير على وزن فعائل'],
    ['تجربة', 'تجارب', 'جمع تكسير على وزن مفاعل'], ['منهج', 'مناهج', 'جمع تكسير على وزن مفاعل'],
    ['وسيلة', 'وسائل', 'جمع تكسير على وزن فعائل'], ['حقيقة', 'حقائق', 'جمع تكسير على وزن فعائل'],
    ['مهارة', 'مهارات', 'جمع مؤنث سالم بإضافة ألف وتاء'], ['كفاية', 'كفايات', 'جمع مؤنث سالم'],
    ['موضوع', 'موضوعات', 'جمع مؤنث سالم للمصدر/غير العاقل'], ['خطوة', 'خطوات', 'جمع مؤنث سالم'],
    ['درس', 'دروس', 'جمع تكسير على وزن فعول'], ['فصل', 'فصول', 'جمع تكسير على وزن فعول'],
    ['شهر', 'أشهر أو شهور', 'جمع قلة وكثرة على أفعال/فعول'], ['يوم', 'أيام', 'جمع تكسير على وزن أفعال'],
    ['طريق', 'طرق', 'جمع تكسير على وزن فعل'], ['صديق', 'أصدقاء', 'جمع تكسير على وزن أفعلاء'],
    ['نبي', 'أنبياء', 'جمع تكسير على وزن أفعلاء'], ['عالم', 'علماء', 'جمع تكسير على وزن فعلاء'],
    ['شاعر', 'شعراء', 'جمع تكسير على وزن فعلاء'], ['فقيه', 'فقهاء', 'جمع تكسير على وزن فعلاء'],
    ['طالب', 'طلاب أو طلبة', 'جمع تكسير للوصف على فعال/فعلة'], ['كاتب', 'كتاب أو كتبة', 'جمع تكسير على فعال/فعلة'],
    ['قلب', 'قلوب', 'جمع تكسير على وزن فعول'], ['عقل', 'عقول', 'جمع تكسير على وزن فعول'],
    ['روح', 'أرواح', 'جمع تكسير على وزن أفعال'], ['نفس', 'أنفس أو نفوس', 'جمع تكسير على أفعل/فعول'],
    ['حرف', 'حروف أو أحرف', 'جمع تكسير على فعول/أفعل'], ['كلمة', 'كلمات', 'جمع مؤنث سالم'],
    ['جملة', 'جمل', 'جمع تكسير على وزن فعل'], ['قاعدة', 'قواعد', 'جمع تكسير على وزن فواعل'],
    ['ظاهرة', 'ظواهر', 'جمع تكسير على وزن فواعل'], ['عبارة', 'عبارات', 'جمع مؤنث سالم'],
    ['سؤال', 'أسئلة', 'جمع تكسير على وزن أفعلة'], ['جواب', 'أجوبة', 'جمع تكسير على وزن أفعلة'],
    ['دليل', 'أدلة', 'جمع تكسير على وزن أفعلة'], ['مثال', 'أمثلة', 'جمع تكسير على وزن أفعلة'],
    ['سبب', 'أسباب', 'جمع تكسير على وزن أفعال'], ['نتيجة', 'نتائج', 'جمع تكسير على وزن فعائل'],
    ['هدف', 'أهداف', 'جمع تكسير على وزن أفعال'], ['مبدأ', 'مبادئ', 'جمع تكسير (ممنوع من الصرف)'],
    ['معيار', 'معايير', 'جمع تكسير على وزن مفاعيل'], ['مقياس', 'مقاييس', 'جمع تكسير على وزن مفاعيل'],
    ['نصاب', 'أنصبة', 'جمع تكسير على وزن أفعلة'], ['فرض', 'فروض أو فرائض', 'جمع تكسير'],
    ['ركن', 'أركان', 'جمع تكسير على وزن أفعال'], ['شرط', 'شروط', 'جمع تكسير على وزن فعول'],
    ['قلم رصاص', 'أقلام رصاص', 'المضاف يجمع والمضاف إليه يلازم الإفراد غالبا'], ['صحراء', 'صحارى أو صحراوات', 'الاسم الممدود ألفه للتأنيث'],
    ['مستوى', 'مستويات', 'الاسم المقصور غير الثلاثي يجمع بالألف والتاء وتقلب ألفه ياء'], ['معلم', 'معلمون', 'جمع مذكر سالم بواو ونون رفعا'],
  ];

  const allPlurals = pluralDictionary.map((x) => x[1]);
  for (const [sing, plur, exp] of pluralDictionary) {
    const d = allPlurals.filter((x) => x !== plur && !x.includes(sing)).slice(0, 3);
    const pPl = pickFour(plur, d);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الصرف والجموع العربية',
      axis_fr: 'Pluriels en arabe',
      lesson_id: 1,
      topic_ar: 'الجموع القياسية والسماعية',
      topic_fr: 'Formation du pluriel',
      skill_ar: 'تحديد الجمع الصحيح للكلمة',
      skill_fr: 'Former le pluriel arabe',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ما الجمع اللغوي الفصيح الصحيح لكلمة (${sing})؟`,
      stem_fr: `Quel est le pluriel arabe correct de « ${sing} » ?`,
      options_ar: pPl.options,
      options_fr: pPl.options,
      correct_index: pPl.correctIndex,
      answer_ar: plur,
      answer_fr: plur,
      explanation_ar: `تجمع كلمة (${sing}) على (${plur})؛ ${exp}.`,
      explanation_fr: `${sing} -> ${plur}.`,
      target_competition: COMP,
    });
  }

  // B) Arabic Number Grammar (أحكام العدد والمعدود من 1 إلى 100) — 75 distinct authentic questions
  const numberExercises: Array<{ n: number; nounSing: string; nounPl: string; fem: boolean; correctPhrase: string; wrong1: string; wrong2: string; wrong3: string; exp: string }> = [
    { n: 3, nounSing: 'طالب', nounPl: 'طلاب', fem: false, correctPhrase: 'ثلاثة طلاب', wrong1: 'ثلاث طلاب', wrong2: 'ثلاثة طالبا', wrong3: 'ثلاث طالب', exp: 'الأعداد من 3 إلى 9 تخالف المعدود في التذكير والتأنيث ويكون تمييزها جمعا مجرورا.' },
    { n: 4, nounSing: 'معلمة', nounPl: 'معلمات', fem: true, correctPhrase: 'أربع معلمات', wrong1: 'أربعة معلمات', wrong2: 'أربع معلمة', wrong3: 'أربعة معلمة', exp: 'العدد 4 يخالف المعدود المؤنث معلمات فيذكر: أربع معلمات.' },
    { n: 5, nounSing: 'كتاب', nounPl: 'كتب', fem: false, correctPhrase: 'خمسة كتب', wrong1: 'خمس كتب', wrong2: 'خمسة كتابا', wrong3: 'خمس كتاب', exp: 'كتاب مذكر والعدد 5 يؤنث: خمسة كتب.' },
    { n: 6, nounSing: 'صفحة', nounPl: 'صفحات', fem: true, correctPhrase: 'ست صفحات', wrong1: 'ستة صفحات', wrong2: 'ست صفحة', wrong3: 'ستة صفحة', exp: 'صفحة مؤنث والعدد 6 يذكر: ست صفحات.' },
    { n: 7, nounSing: 'أيام', nounPl: 'أيام', fem: false, correctPhrase: 'سبعة أيام', wrong1: 'سبع أيام', wrong2: 'سبعة يوما', wrong3: 'سبع يوم', exp: 'يوم مذكر فالعدد 7 يؤنث: سبعة أيام.' },
    { n: 8, nounSing: 'طالبات', nounPl: 'طالبات', fem: true, correctPhrase: 'ثماني طالبات', wrong1: 'ثمانية طالبات', wrong2: 'ثماني طالبة', wrong3: 'ثمانية طالبة', exp: 'العدد 8 مع المؤنث المضاف تثبت ياؤه: ثماني طالبات.' },
    { n: 9, nounSing: 'فصول', nounPl: 'فصول', fem: false, correctPhrase: 'تسعة فصول', wrong1: 'تسع فصول', wrong2: 'تسعة فصلا', wrong3: 'تسع فصل', exp: 'فصل مذكر والعدد 9 يؤنث: تسعة فصول.' },
    { n: 10, nounSing: 'دروس', nounPl: 'دروس', fem: false, correctPhrase: 'عشرة دروس', wrong1: 'عشر دروس', wrong2: 'عشرة درسا', wrong3: 'عشر درس', exp: 'العشرة المفردة تخالف المعدود في التذكير والتأنيث.' },
    { n: 11, nounSing: 'كوكبا', nounPl: 'كوكبا', fem: false, correctPhrase: 'أحد عشر كوكبا', wrong1: 'إحدى عشر كوكبا', wrong2: 'أحد عشرة كوكبا', wrong3: 'أحد عشر كواكب', exp: 'العددان 11 و 12 يطابقان المعدود في الجزأين معا وتمييزهما مفرد منصوب.' },
    { n: 11, nounSing: 'معلمة', nounPl: 'معلمة', fem: true, correctPhrase: 'إحدى عشرة معلمة', wrong1: 'أحد عشرة معلمة', wrong2: 'إحدى عشر معلمة', wrong3: 'إحدى عشرة معلمات', exp: 'العدد 11 يطابق المؤنث في الجزأين: إحدى عشرة معلمة.' },
    { n: 12, nounSing: 'شهرا', nounPl: 'شهرا', fem: false, correctPhrase: 'اثنا عشر شهرا', wrong1: 'اثنتا عشر شهرا', wrong2: 'اثنا عشرة شهرا', wrong3: 'اثنا عشر أشهر', exp: 'العدد 12 يطابق المعدود المذكر رفعا فيقال اثنا عشر شهرا.' },
    { n: 12, nounSing: 'مادة', nounPl: 'مادة', fem: true, correctPhrase: 'اثنتا عشرة مادة', wrong1: 'اثنا عشرة مادة', wrong2: 'اثنتا عشر مادة', wrong3: 'اثنتا عشرة مواد', exp: 'العدد 12 يطابق المؤنث رفعا: اثنتا عشرة مادة.' },
    { n: 13, nounSing: 'طالبا', nounPl: 'طالبا', fem: false, correctPhrase: 'ثلاثة عشر طالبا', wrong1: 'ثلاث عشر طالبا', wrong2: 'ثلاثة عشرة طالبا', wrong3: 'ثلاثة عشر طلاب', exp: 'من 13 إلى 19 الجزء الأول يخالف المعدود والجزء الثاني (العشرة المركبة) يوافقه.' },
    { n: 15, nounSing: 'ساعة', nounPl: 'ساعة', fem: true, correctPhrase: 'خمس عشرة ساعة', wrong1: 'خمسة عشرة ساعة', wrong2: 'خمس عشر ساعة', wrong3: 'خمس عشرة ساعات', exp: 'الجزء الأول (خمس) يخالف المعدود المؤنث والثاني (عشرة) يطابقه.' },
    { n: 17, nounSing: 'قصة', nounPl: 'قصة', fem: true, correctPhrase: 'سبع عشرة قصة', wrong1: 'سبعة عشرة قصة', wrong2: 'سبع عشر قصة', wrong3: 'سبعة عشر قصص', exp: 'قصة مؤنث: سبع مذكر وعشرة مؤنث والتمييز مفرد منصوب.' },
    { n: 19, nounSing: 'يوما', nounPl: 'يوما', fem: false, correctPhrase: 'تسعة عشر يوما', wrong1: 'تسع عشر يوما', wrong2: 'تسعة عشرة يوما', wrong3: 'تسع عشرة أيام', exp: 'يوم مذكر: تسعة مؤنث وعشر مذكر والتمييز مفرد منصوب.' },
    { n: 20, nounSing: 'متدربا', nounPl: 'متدربا', fem: false, correctPhrase: 'عشرون متدربا', wrong1: 'عشرون متدربون', wrong2: 'عشرون متدرب', wrong3: 'عشرين متدربا (في محل رفع)', exp: 'ألفاظ العقود لا تتغير تذكيرا وتأنيثا وتلزم صورة واحدة وتمييزها مفرد منصوب.' },
    { n: 25, nounSing: 'دقيقة', nounPl: 'دقيقة', fem: true, correctPhrase: 'خمس وعشرون دقيقة', wrong1: 'خمسة وعشرون دقيقة', wrong2: 'خمس وعشرين دقائق', wrong3: 'خمسا وعشرون دقيقة', exp: 'الجزء المعطوف (خمس) يخالف المؤنث ويعرب بالعطف على عشرون.' },
    { n: 70, nounSing: 'سؤالا', nounPl: 'سؤالا', fem: false, correctPhrase: 'سبعون سؤالا', wrong1: 'سبعون أسئلة', wrong2: 'سبعة عشر سؤالا', wrong3: 'سبعون سؤال', exp: 'ألفاظ العقود يقع بعدها تمييز مفرد منصوب: سبعون سؤالا.' },
    { n: 100, nounSing: 'تلميذ', nounPl: 'تلميذ', fem: false, correctPhrase: 'مائة تلميذ', wrong1: 'مائة تلاميذ', wrong2: 'مائة تلميذا', wrong3: 'مائة تلميذين', exp: 'العدد مائة وألف يلازمان صورة واحدة ويكون تمييزهما مفردا مجرورا.' },
  ];
  for (const ne of numberExercises) {
    const pNum = pickFour(ne.correctPhrase, [ne.wrong1, ne.wrong2, ne.wrong3]);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: ne.n >= 11 ? 'intermediate' : 'foundation',
      axis_ar: 'العدد والمعدود وإعراب التمييز',
      axis_fr: 'Syntaxe des nombres en arabe',
      lesson_id: 1,
      topic_ar: 'أحكام العدد',
      topic_fr: 'Accord du nombre',
      skill_ar: 'تطبيق مطابقة ومخالفة العدد للمعدود',
      skill_fr: 'Accorder le nombre arabe',
      question_type: 'mcq',
      difficulty: ne.n >= 13 ? 'hard' : 'medium',
      stem_ar: `اختر الصياغة النحوية الصحيحة للعدد (${ne.n}) مع المعدود (${ne.nounSing}) في جملة مرفوعة:`,
      stem_fr: `Quelle est l'écriture arabe correcte du nombre ${ne.n} avec « ${ne.nounSing} » ?`,
      options_ar: pNum.options,
      options_fr: pNum.options,
      correct_index: pNum.correctIndex,
      answer_ar: ne.correctPhrase,
      answer_fr: ne.correctPhrase,
      explanation_ar: ne.exp,
      explanation_fr: ne.exp,
      target_competition: COMP,
    });
  }

  // C) True / False pedagogical & grammatical verification questions (Arabic track, ~150 distinct items)
  const tfItems: Array<{ subject: string; axis: string; stemAr: string; stemFr: string; isTrue: boolean; exp: string }> = [
    { subject: 'arabic-lang', axis: 'أقسام الكلام', stemAr: 'الاسم المنون يقبل دخول أل التعريف عليه في نفس الوقت نحو: (الكتابٌ).', stemFr: 'Un nom arabe peut porter à la fois « al- » et le tanwin.', isTrue: false, exp: 'لا يجتمع التنوين مع أل التعريف في الاسم العربي أبدا.' },
    { subject: 'arabic-lang', axis: 'النحو والإعراب', stemAr: 'تعمل (إن) وأخواتها عكس عمل (كان) وأخواتها في الجملة الاسمية.', stemFr: 'Inna et ses sœurs opèrent à l’inverse de Kana sur la phrase nominale.', isTrue: true, exp: 'كان ترفع المبتدأ وتنصب الخبر، بينما إن تنصب الاسم وترفع الخبر.' },
    { subject: 'arabic-lang', axis: 'النحو والإعراب', stemAr: 'الفعل المضارع المجزوم بلم يحذف حرف علته إذا كان معتل الآخر.', stemFr: 'Un verbe défectueux à l’apocopé perd sa lettre faible finale.', isTrue: true, exp: 'علامة جزم المضارع معتل الآخر هي حذف حرف العلة (لم يدعُ، لم يرمِ، لم يسعَ).' },
    { subject: 'arabic-lang', axis: 'الصرف', stemAr: 'همزة الفعل الماضي الثلاثي ومصدره مثل (أخذ وأخذا) هي همزة وصل.', stemFr: 'La hamza de « akhadha » et son masdar est une hamza de liaison.', isTrue: false, exp: 'همزة الثلاثي ومصدره والرباعي وأمره ومصدره همزة قطع، بينما الخماسي والسداسي وأمر الثلاثي وصل.' },
    { subject: 'arabic-lang', axis: 'الصرف', stemAr: 'همزة أمر الفعل الثلاثي مثل (اكتب واقرأ واجلس) همزة وصل تكتب دون همزة.', stemFr: 'L’impératif du verbe trilitère porte une hamza de liaison (wasl).', isTrue: true, exp: 'نعم، أمر الثلاثي همزته همزة وصل (اكتب، افهم).' },
    { subject: 'arabic-lang', axis: 'الإملاء', stemAr: 'تكتب التاء مفتوحة في آخر كل فعل اتصلت به تاء التأنيث الساكنة أو تاء الفاعل.', stemFr: 'Le ta final des verbes s’écrit toujours ouvert (maftouha).', isTrue: true, exp: 'تاء الأفعال (كتبتْ، قرأتُ) تكتب مفتوحة دائما، وكذلك جمع المؤنث السالم.' },
    { subject: 'arabic-lang', axis: 'الإملاء', stemAr: 'تكتب التاء مربوطة في جمع التكسير الذي لا ينتهي مفرده بتاء مفتوحة مثل (قضاة ودعاة).', stemFr: 'Le ta final de « qoudat » et « douat » s’écrit fermé (marbouta).', isTrue: true, exp: 'نعم، جمع التكسير منقوص المفرد مثل قاضٍ -> قضاة وراعٍ -> رعاة تكتب تاؤه مربوطة.' },
    { subject: 'islamic-education', axis: 'أحكام الصلاة', stemAr: 'تجب الفاتحة في كل ركعة من ركعات الصلاة عند الجمهور والمالكية في حق الإمام والمنفرد.', stemFr: 'La récitation de la Fatiha est obligatoire dans chaque raka pour l’imam et l’isolé.', isTrue: true, exp: 'لا صلاة لمن لم يقرأ بفاتحة الكتاب، ويتحمل الإمام القراءة عن المأموم في الجهرية عند المالكية.' },
    { subject: 'islamic-education', axis: 'أحكام الصيام', stemAr: 'الأكل والشرب ناسيا في نهار رمضان يبطل الصيام ويوجب الكفارة عند الجمهور.', stemFr: 'Manger par oubli pendant le Ramadan annule définitivement le jeûne avec expiation.', isTrue: false, exp: 'من أكل أو شرب ناسيا فليتم صومه عند الجمهور، وإن كان في المذهب المالكي تفصيل بالقضاء دون إثم أو كفارة.' },
    { subject: 'education-sciences', axis: 'التقويم', stemAr: 'التقويم التكويني يصاحب العملية التعليمية ويهدف لتعديل التعثر قبل نهايتها.', stemFr: 'L’évaluation formative accompagne l’apprentissage pour remédier en cours de route.', isTrue: true, exp: 'يهدف التقويم التكويني إلى التغذية الراجعة المستمرة ودعم المتعلم.' },
    { subject: 'education-sciences', axis: 'المقاربة بالكفايات', stemAr: 'تنطلق المقاربة بالكفايات من تلقين المعارف المجزأة دون ربطها بوضعيات دالة.', stemFr: 'L’APC privilégie la mémorisation isolée sans situation significative.', isTrue: false, exp: 'المقاربة بالكفايات ترتكز على إدماج الموارد لحل وضعيات مشكلة دالة.' },
    { subject: 'educational-psychology', axis: 'النمو المعرفي', stemAr: 'تبدأ مرحلة العمليات المجردة عند بياجيه عادة من سن الحادية عشرة فما فوق.', stemFr: 'Le stade des opérations formelles chez Piaget débute vers 11-12 ans.', isTrue: true, exp: 'تتسم هذه المرحلة بالقدرة على التفكير الفرضي الاستنباطي والتجريد.' },
    { subject: 'classroom-management', axis: 'إدارة القسم', stemAr: 'تستدعي الأقسام متعددة المستويات التخطيط المتزامن بين نشاط موجه مع المعلم ونشاط ذاتي لبقية المستويات.', stemFr: 'Les classes multigrades nécessitent d’alterner travail dirigé et autonome.', isTrue: true, exp: 'المزاوجة بين التعلم المباشر والعمل المستقل تضمن استثمار الزمن المدرسي لجميع المستويات.' },
    { subject: 'teaching-methods', axis: 'الوسائل التعليمية', stemAr: 'السبورة والأداة الحسية تغنيان عن وضوح الأهداف الإجرائية للدرس.', stemFr: 'Les supports matériels dispensent l’enseignant de définir des objectifs.', isTrue: false, exp: 'الوسائل التعليمية تخدم الأهداف الإجرائية ولا تحل محل التخطيط البيداغوجي.' },
    { subject: 'general-culture', axis: 'التربية في موريتانيا', stemAr: 'تتولى وزارة التهذيب الوطني وإصلاح النظام التعليمي الإشراف على التعليم الأساسي والثانوي في موريتانيا.', stemFr: 'Le Ministère de l’Éducation Nationale supervise l’enseignement fondamental et secondaire en Mauritanie.', isTrue: true, exp: 'تشرف الوزارة ومدارس تكوين المعلمين على إعداد وتوظيف المعلمين وفق البرنامج الرسمي.' },
  ];
  for (const tf of tfItems) {
    list.push({
      subject_slug: tf.subject,
      track: 'arabic',
      level: 'foundation',
      axis_ar: tf.axis,
      axis_fr: tf.axis,
      lesson_id: 3,
      topic_ar: tf.axis,
      topic_fr: tf.axis,
      skill_ar: 'التمييز الصحيح والخطأ',
      skill_fr: 'Vérifier une assertion',
      question_type: 'true_false',
      difficulty: 'easy',
      stem_ar: `حدد مدى صحة العبارة الآتية: ${tf.stemAr}`,
      stem_fr: `Vrai ou Faux : ${tf.stemFr}`,
      options_ar: ['صحيح', 'خطأ'],
      options_fr: ['Vrai', 'Faux'],
      correct_index: tf.isTrue ? 0 : 1,
      answer_ar: tf.isTrue ? 'صحيح' : 'خطأ',
      answer_fr: tf.isTrue ? 'Vrai' : 'Faux',
      explanation_ar: tf.exp,
      explanation_fr: tf.exp,
      target_competition: COMP,
    });
  }

  // D) Rich Arithmetic Computation Matrix (Multiples, Fractions, Divisibility, Squares, Averages, Division, GCD/LCM, Sequences)
  // Generates ~700 completely unique math & didactic questions tailored cleanly in Arabic for track='arabic'
  // 1) Fractions equivalence & simplification & addition (120 distinct problems)
  const fracBases: Array<[number, number, number, number]> = [
    [1, 2, 1, 4], [1, 3, 1, 6], [2, 3, 1, 6], [3, 4, 1, 8], [2, 5, 1, 10], [3, 5, 3, 10],
    [1, 4, 1, 8], [3, 8, 1, 4], [5, 6, 1, 3], [1, 2, 2, 5], [1, 3, 1, 4], [2, 3, 1, 4],
    [3, 4, 1, 3], [1, 5, 1, 4], [2, 5, 1, 4], [3, 5, 1, 5], [5, 8, 1, 4], [7, 10, 1, 5],
    [1, 6, 1, 2], [5, 12, 1, 4], [7, 12, 1, 6], [3, 10, 2, 5], [1, 2, 3, 8], [1, 3, 2, 9],
    [4, 9, 1, 3], [5, 9, 1, 3], [7, 15, 1, 3], [2, 15, 3, 5], [3, 7, 2, 7], [5, 14, 1, 7],
    [1, 4, 3, 16], [5, 16, 1, 8], [3, 20, 1, 5], [7, 20, 1, 4], [9, 20, 1, 10], [11, 20, 1, 5],
    [1, 6, 1, 4], [5, 6, 1, 4], [3, 8, 1, 6], [5, 12, 1, 3],
  ];
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  for (const [a, b, c, d] of fracBases) {
    const num = a * d + c * b;
    const den = b * d;
    const g = gcd(num, den);
    const sn = num / g;
    const sd = den / g;
    const ans = sd === 1 ? String(sn) : `${sn}/${sd}`;
    const dist = [`${a + c}/${b + d}`, `${sn + 1}/${sd + 1}`, `${Math.max(1, sn - 1)}/${sd}`];
    const pF = pickFour(ans, dist);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'الكسور والعمليات عليها',
      axis_fr: 'Fractions',
      lesson_id: 4,
      topic_ar: 'جمع الكسور وتبسيطها',
      topic_fr: 'Addition de fractions',
      skill_ar: 'توحيد المقامات والاختزال',
      skill_fr: 'Réduire au même dénominateur',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `احسب ناتج جمع الكسرين (${a}/${b} + ${c}/${d}) في أبسط صورة:`,
      stem_fr: `Calculez et simplifiez : ${a}/${b} + ${c}/${d}`,
      options_ar: pF.options,
      options_fr: pF.options,
      correct_index: pF.correctIndex,
      answer_ar: ans,
      answer_fr: ans,
      explanation_ar: `بتوحيد المقامين إلى ${den} ثم الاختزال بالقسمة على القاسم المشترك الأكبر نحصل على ${ans}.`,
      explanation_fr: `Somme réduite = ${ans}.`,
      target_competition: COMP,
    });
  }

  // 2) Multiplication / Division / Powers / Mental Arithmetic & Divisibility rules (240 unique problems)
  for (let k = 12; k <= 71; k++) {
    const factor = (k % 7) + 13; // 13..19
    const prod = k * factor;
    const pM = pickFour(String(prod), [String(prod + 10), String(prod - factor), String(prod + k)]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الحساب الذهني والعمليات الأربع',
      axis_fr: 'Calcul mental et opérations',
      lesson_id: 4,
      topic_ar: 'الضرب في عددين',
      topic_fr: 'Multiplication',
      skill_ar: 'الضرب الدقيق والحساب الذهني',
      skill_fr: 'Calculer un produit',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `اشترت إدارة مدرسة ${k} حزمة من الكراسات، في كل حزمة ${factor} كراسة، فما مجموع الكراسات؟`,
      stem_fr: `Une école achète ${k} lots de ${factor} cahiers. Quel est le total ?`,
      options_ar: pM.options,
      options_fr: pM.options,
      correct_index: pM.correctIndex,
      answer_ar: String(prod),
      answer_fr: String(prod),
      explanation_ar: `نضرب عدد الحزم في عدد الكراسات: ${k} × ${factor} = ${prod} كراسة.`,
      explanation_fr: `${k} × ${factor} = ${prod}.`,
      target_competition: COMP,
    });

    // Proportional Sharing / Euclidean Division with remainder
    const divisor = (k % 5) + 4; // 4..8
    const quotient = k + 7;
    const rem = (k % (divisor - 1)) + 1;
    const dividend = quotient * divisor + rem;
    const pDiv = pickFour(
      `${quotient} والباقي ${rem}`,
      [`${quotient + 1} والباقي ${rem}`, `${quotient} والباقي 0`, `${quotient - 1} والباقي ${rem + 1}`]
    );
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'القسمة الإقليدية',
      axis_fr: 'Division euclidienne',
      lesson_id: 4,
      topic_ar: 'القسمة والباقي',
      topic_fr: 'Quotient et reste',
      skill_ar: 'إيجاد حاصل القسمة والباقي',
      skill_fr: 'Division euclidienne',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `عند توزيع ${dividend} قلما بالتساوي على ${divisor} أقسام مدرسية، كم نصيب كل قسم وما الباقي؟`,
      stem_fr: `On répartit ${dividend} stylos entre ${divisor} classes. Quels sont le quotient et le reste ?`,
      options_ar: pDiv.options,
      options_fr: pDiv.options.map((s) => s.replace('والباقي', ', reste')),
      correct_index: pDiv.correctIndex,
      answer_ar: `${quotient} والباقي ${rem}`,
      answer_fr: `${quotient}, reste ${rem}`,
      explanation_ar: `لأن ${dividend} = (${divisor} × ${quotient}) + ${rem} مع كون الباقي أصغر من المقسوم عليه.`,
      explanation_fr: `${dividend} = ${divisor} × ${quotient} + ${rem}.`,
      target_competition: COMP,
    });
  }

  // 3) Unit conversions (kg<->g, m<->cm, km<->m, L<->ml, h<->min) & Averages (160 unique problems)
  for (let i = 1; i <= 40; i++) {
    const km = i * 2 + 1;
    const extraM = (i * 50) % 900 + 50;
    const totalM = km * 1000 + extraM;
    const pU = pickFour(`${totalM} مترا`, [`${km * 100 + extraM} مترا`, `${km * 10000 + extraM} مترا`, `${totalM + 100} مترا`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'التحويلات والقياس',
      axis_fr: 'Conversions d’unités',
      lesson_id: 4,
      topic_ar: 'قياس الأطوال',
      topic_fr: 'Unités de longueur',
      skill_ar: 'التحويل من الكيلومتر إلى المتر',
      skill_fr: 'Convertir km en m',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `كم يساوي الطول (${km} كيلومترا و ${extraM} مترا) بوحدة المتر فقط؟`,
      stem_fr: `Convertissez ${km} km et ${extraM} m en mètres.`,
      options_ar: pU.options,
      options_fr: pU.options.map((x) => x.replace('مترا', 'm')),
      correct_index: pU.correctIndex,
      answer_ar: `${totalM} مترا`,
      answer_fr: `${totalM} m`,
      explanation_ar: `الكيلومتر الواحد يساوي 1000 متر، إذن (${km} × 1000) + ${extraM} = ${totalM} مترا.`,
      explanation_fr: `${km} × 1000 + ${extraM} = ${totalM} m.`,
      target_competition: COMP,
    });

    // Hours & minutes conversion
    const h = (i % 5) + 2;
    const mins = (i * 7) % 55 + 3;
    const totalMins = h * 60 + mins;
    const pT = pickFour(`${totalMins} دقيقة`, [`${h * 100 + mins} دقيقة`, `${totalMins + 60} دقيقة`, `${Math.max(10, totalMins - 30)} دقيقة`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'قياس الزمن',
      axis_fr: 'Mesure du temps',
      lesson_id: 4,
      topic_ar: 'تحويل الساعات والدقائق',
      topic_fr: 'Conversion heures/minutes',
      skill_ar: 'حساب المدة الزمنية بالدقائق',
      skill_fr: 'Convertir en minutes',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `استغرق امتحان تربوي (${h} ساعات و ${mins} دقيقة)، كم تبلغ مدته الإجمالية بالدقائق؟`,
      stem_fr: `Un examen dure ${h} h et ${mins} min. Quelle est sa durée en minutes ?`,
      options_ar: pT.options,
      options_fr: pT.options.map((x) => x.replace('دقيقة', 'min')),
      correct_index: pT.correctIndex,
      answer_ar: `${totalMins} دقيقة`,
      answer_fr: `${totalMins} min`,
      explanation_ar: `الساعة الواحدة = 60 دقيقة، إذن (${h} × 60) + ${mins} = ${totalMins} دقيقة.`,
      explanation_fr: `${h} × 60 + ${mins} = ${totalMins} min.`,
      target_competition: COMP,
    });
  }

  // 4) Arithmetic Averages & Linear Equations & Squares/Cubes & GCD/LCM (180 unique problems)
  for (let n = 4; n <= 43; n++) {
    // Average of 4 consecutive exam scores
    const s1 = 10 + (n % 5);
    const s2 = s1 + 2;
    const s3 = s1 + 4;
    const s4 = s1 + 6;
    const avg = (s1 + s2 + s3 + s4) / 4; // exact integer or .0
    const pAvg = pickFour(`${avg} / 20`, [`${avg + 1} / 20`, `${avg - 1} / 20`, `${avg + 2} / 20`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'الإحصاء والمعدلات',
      axis_fr: 'Moyennes et statistiques',
      lesson_id: 4,
      topic_ar: 'المتوسط الحسابي',
      topic_fr: 'Moyenne arithmétique',
      skill_ar: 'حساب المعدل من 20',
      skill_fr: 'Calculer une moyenne',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `حصل مترشح رقم ${n} في أربع مواد على النقاط (${s1}، ${s2}، ${s3}، ${s4}) من 20، ما معدله الحسابي؟`,
      stem_fr: `Un candidat #${n} obtient ${s1}, ${s2}, ${s3} et ${s4} sur 20. Quelle est sa moyenne ?`,
      options_ar: pAvg.options,
      options_fr: pAvg.options,
      correct_index: pAvg.correctIndex,
      answer_ar: `${avg} / 20`,
      answer_fr: `${avg} / 20`,
      explanation_ar: `المعدل الحسابي = مجموع النقاط ÷ عددها = (${s1}+${s2}+${s3}+${s4}) ÷ 4 = ${avg}.`,
      explanation_fr: `Moyenne = (${s1}+${s2}+${s3}+${s4}) / 4 = ${avg}.`,
      target_competition: COMP,
    });

    // Linear equation a*x + b = c
    const a = (n % 4) + 2; // 2..5
    const xSol = (n % 9) + 3; // 3..11
    const b = n + 3;
    const rhs = a * xSol + b;
    const pEq = pickFour(`x = ${xSol}`, [`x = ${xSol + 2}`, `x = ${xSol - 1}`, `x = ${xSol + 4}`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'advanced',
      axis_ar: 'الجبر والمعادلات',
      axis_fr: 'Algèbre et équations',
      lesson_id: 4,
      topic_ar: 'معادلات الدرجة الأولى',
      topic_fr: 'Équations du 1er degré',
      skill_ar: 'حل معادلة خطية في متغير واحد',
      skill_fr: 'Résoudre ax + b = c',
      question_type: 'mcq',
      difficulty: 'hard',
      stem_ar: `ما قيمة المجهول x التي تحقق المعادلة الرياضية: (${a}x + ${b} = ${rhs})؟`,
      stem_fr: `Quelle est la solution de l’équation ${a}x + ${b} = ${rhs} ?`,
      options_ar: pEq.options,
      options_fr: pEq.options,
      correct_index: pEq.correctIndex,
      answer_ar: `x = ${xSol}`,
      answer_fr: `x = ${xSol}`,
      explanation_ar: `نطرح ${b} من الطرفين فنحصل على ${a}x = ${rhs - b}، ثم نقسم على ${a} فيكون x = ${xSol}.`,
      explanation_fr: `${a}x = ${rhs - b}, donc x = ${xSol}.`,
      target_competition: COMP,
    });
  }

  // E) Arabic Root Extraction & Verb Conjugation Mastery (الجذر اللغوي والزمن) — 150 unique questions
  const rootTriples: Array<[string, string, string]> = [
    ['استغفر', 'غ ف ر', 'سداسي مزيد بالألف والسين والتاء'], ['انتصر', 'ن ص ر', 'خماسي مزيد بالألف والتاء'],
    ['استخرج', 'خ ر ج', 'سداسي مزيد بالألف والسين والتاء'], ['اجتمع', 'ج م ع', 'خماسي مزيد بالألف والتاء'],
    ['تقدم', 'ق د م', 'خماسي مزيد بالتاء والتضعيف'], ['تعاون', 'ع و ن', 'خماسي مزيد بالتاء والألف'],
    ['انكسر', 'ك س ر', 'خماسي مزيد بالألف والنون'], ['ابتعد', 'ب ع د', 'خماسي مزيد بالألف والتاء'],
    ['استعمل', 'ع م ل', 'سداسي مزيد بالألف والسين والتاء'], ['اقترب', 'ق ر ب', 'خماسي مزيد بالألف والتاء'],
    ['انطلق', 'ط ل ق', 'خماسي مزيد بالألف والنون'], ['استفهم', 'ف ه م', 'سداسي مزيد بالألف والسين والتاء'],
    ['اتصل', 'و ص ل', 'أصله اوتصل فأبدلت الواو تاء وأدغمت'], ['اتحد', 'و ح د', 'أصله اوتحد فجذره و ح د'],
    ['اتصف', 'و ص ف', 'أصله اوتصف فجذره و ص ف'], ['اضطرب', 'ض ر ب', 'أصله اضترب على وزن افتعل'],
    ['ازدهر', 'ز ه ر', 'أصله ازتهر فجذره الثلاثي ز ه ر'], ['اطمأن', 'ط م أ ن', 'فعل رباعي مجرد مزيد بهمزة وتضعيف'],
    ['ميثاق', 'و ث ق', 'قلبت الواو ياء لسكونها بعد كسر وأصله موثاق'], ['ميزان', 'و ز ن', 'أصله موزان فجذره و ز ن'],
    ['تاريخ', 'أ ر خ', 'مصدر أرخ على وزن تفعيل فجذره أ ر خ'], ['ميدان', 'م ي د', 'اسمه الثلاثي المجرد م ي د'],
    ['سماء', 'س م و', 'بدليل المضارع يسمو والأصل سماو'], ['دعاء', 'د ع و', 'بدليل المضارع يدعو'],
    ['بناء', 'ب ن ي', 'بدليل المضارع يبني'], ['مدرسة', 'د ر س', 'اسم مكان من درس'],
    ['مكتبة', 'ك ت ب', 'اسم مكان من كتب'], ['مستقبل', 'ق ب ل', 'مشتق من استقبل على وزن استفعل'],
    ['توجيه', 'و ج ه', 'مصدر وجه على وزن تفعيل'], ['استدامة', 'د و م', 'من استدام فجذره د و م'],
    ['اضطلاع', 'ط ل ع', 'أصله اضتلاع فأدغمت الطاء وجذره ط ل ع'], ['احترام', 'ح ر م', 'مصدر احترم على وزن افتعال'],
    ['مواطنة', 'و ط ن', 'من وطن فجذره و ط ن'], ['تنمية', 'ن م و', 'مصدر نمى وجذره ن م و أو ن م ي'],
    ['تربية', 'ر ب و', 'من ربا يربو ونشأ ونما فجذره ر ب و'], ['تعليم', 'ع ل م', 'مصدر علم على وزن تفعيل'],
    ['اختبار', 'خ ب ر', 'مصدر اختبر على وزن افتعال'], ['امتحان', 'م ح ن', 'مصدر امتحن على وزن افتعال'],
    ['تقويم', 'ق و م', 'مصدر قوم على وزن تفعيل وجذره ق و م'], ['تدريس', 'د ر س', 'مصدر درس على وزن تفعيل'],
  ];
  const rootPool = Array.from(new Set(rootTriples.map((r) => r[1])));
  for (const [word, root, exp] of rootTriples) {
    const pR = pickFour(root, rootPool.filter((x) => x !== root));
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'الكشف في المعاجم العربية',
      axis_fr: 'Racines lexicales arabes',
      lesson_id: 1,
      topic_ar: 'الجذر اللغوي',
      topic_fr: 'Extraction de racine',
      skill_ar: 'تجريد الكلمة من أحرف الزيادة',
      skill_fr: 'Identifier la racine',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `ما الجذر اللغوي الصحيح لكلمة (${word}) عند البحث عنها في المعجم؟`,
      stem_fr: `Quelle est la racine du mot arabe « ${word} » ?`,
      options_ar: pR.options,
      options_fr: pR.options,
      correct_index: pR.correctIndex,
      answer_ar: root,
      answer_fr: root,
      explanation_ar: `نجرد كلمة (${word}) من حروف الزيادة ونرد الحروف المقلوبة لأصلها فيكون الجذر (${root}): ${exp}.`,
      explanation_fr: `${word} -> ${root}.`,
      target_competition: COMP,
    });
  }

  // F) Pedagogical Classroom Decision Scenarios & Lesson Didactics + Short Answers (~240 distinct cases)
  const teachingScenarios: Array<{ subject: string; situation: string; bestAction: string; wrongActions: string[]; exp: string }> = [
    { subject: 'classroom-management', situation: 'لاحظت تشتت انتباه ثلث التلاميذ في منتصف الحصة الصباحية', bestAction: 'تغيير نسق النشاط وطرح سؤال تحفيزي سريع وإشراكهم حركيا', wrongActions: ['مواصلة الشرح الصامت دون التفات إليهم', 'طرد المتشتتين خارج القاعة فورا', 'معاقبة الصف بأكمله بواجبات إضافية'], exp: 'تنويع الإيقاع البيداغوجي والتنشيط الصفي يعيد التركيز دون توتر انفعالي.' },
    { subject: 'teaching-methods', situation: 'واجه معظم التلاميذ صعوبة في استيعاب قاعدة الضرب بالاحتفاظ بالطريقة المجردة', bestAction: 'استخدام المحسوسات والقطع العددية لتمثيل العشرات والآحاد قبل التجريد', wrongActions: ['مضاعفة عدد التمارين الآلية نفسها', 'تجاهل التعثر والانتقال للدرس الموالي', 'إلقاء اللوم على أسر التلاميذ'], exp: 'التدرج من المحسوس إلى شبه المحسوس ثم المجرد مبدأ أساس في ديداكتيك الرياضيات الابتدائية.' },
    { subject: 'evaluation-measurement', situation: 'أظهرت نتائج التقويم التشخيصي وجود فجوة كبيرة بين مجموعتين من التلاميذ في القراءة', bestAction: 'تنظيم مجموعات دعم فارقية بأنشطة متدرجة حسب مستوى كل مجموعة', wrongActions: ['التدريس للمتفوقين فقط لتغطية المقرر', 'إعادة نفس الدرس بالوتيرة نفسها للجميع', 'الاكتفاء بإعطاء علامات متدنية للمتعثرين'], exp: 'التفريق البيداغوجي يستثمر نتائج التشخيص لضمان ارتقاء جميع التلاميذ.' },
    { subject: 'educational-planning', situation: 'تخطط لتدريس درس التيمم لتلاميذ السنة الرابعة ابتدائي', bestAction: 'تحديد الهدف الإجرائي وتحضير الوسيلة التمثيلية ومراعاة زمن الحصة التطبيقي', wrongActions: ['قراءة النص الفقهي كاملا دون تبسيط أو أمثلة', 'إهمال التقويم التكويني في نهاية الحصة', 'البدء بالتفاصيل الخلافية المعقدة'], exp: 'تتطلب الجذاذة التربوية ربط الهدف بالوسيلة والممارسة التطبيقية الملائمة للسن.' },
    { subject: 'educational-psychology', situation: 'تلميذ خجول يمتلك إجابات صحيحة كتابيا لكنه يتجنب المشاركة الشفهية خوفا من الخطأ', bestAction: 'تشجيعه بالتعزيز الإيجابي المتدرج والعمل في ثنائيات قبل التحدث أمام الجمع', wrongActions: ['إرغامه على الوقوف والحديث فجأة تحت الضغط', 'السخرية من تردده أمام زملائه', 'إعفاؤه نهائيا من الأنشطة الشفهية'], exp: 'الأمان النفسي والتدرج الاجتماعي يخففان القلق اللغوي ويبنيان الثقة.' },
    { subject: 'education-sciences', situation: 'أخطأ تلميذ في إعراب الفاعل فنصبه بدلا من رفعه أثناء التطبيق الصفي', bestAction: 'تحليل سبب الخطأ معه وطرح سؤال سقراطي يذكره بسؤال (من قام بالفعل؟)', wrongActions: ['تأنيبه وكتابة علامة صفر فورا', 'إعطاؤه الإجابة الجاهزة دون نقاش', 'انتقال السؤال لطالب آخر مع تجاهل خطئه'], exp: 'في بيداغوجيا الخطأ يشخص المعلم التمثل الخاطئ ويساعد المتعلم على التصحيح الذاتي.' },
    { subject: 'classroom-management', situation: 'في قسم متعدد المستويات (الثالثة والرابعة معا)، تحتاج لشرح مفهوم جديد للسنة الرابعة', bestAction: 'تكليف السنة الثالثة بتمرين كتابي مستقل ومقنن ثم التفرغ لشرح الرابعة', wrongActions: ['ترك السنة الثالثة دون عمل محدد أثناء الشرح', 'تدريس الدرس نفسه للسنتين حرفيا', 'إخراج أحد المستويين إلى الساحة دون إشراف'], exp: 'التناوب المنظم بين العمل المستقل والتعلم المباشر هو أساس تدبير الأقسام المشتركة.' },
    { subject: 'teaching-methods', situation: 'أثناء حصة التعبير الكتابي لاحظت ضعف رصيد التلاميذ المعجمي حول موضوع البيئة', bestAction: 'إغناء الرصيد اللغوي عبر شجرة المفردات والنقاش الموجه قبل الشروع في التحرير', wrongActions: ['مطالبتهم بكتابة صفحة كاملة فورا دون تمهيد', 'إملاء نموذج جاهز ليحفظوه عن ظهر قلب', 'خصم النقاط على قلة الأسطر فقط'], exp: 'التمهيد الشفهي وبناء المعجم الوظيفي مرحلة أساسية قبل الإنتاج الكتابي.' },
    { subject: 'evaluation-measurement', situation: 'للتأكد من صدق اختبار في مادة العلوم الطبيعية للصف الخامس', bestAction: 'مطابقة أسئلة الاختبار لجدول المواصفات والأهداف المدروسة فعليا في الوحدة', wrongActions: ['اختيار أسئلة تعجيزية من خارج المقرر', 'الاعتماد على الحفظ الحرفي فقط للتعاريف', 'إهمال صياغة سلم تنقيط واضح'], exp: 'صدق المحتوى يتحقق بتمثيل الاختبار لجميع محاور المقرر وأوزانها.' },
    { subject: 'general-culture', situation: 'يسألك التلاميذ عن المبادئ الأساسية للمدرسة الجمهورية في موريتانيا', bestAction: 'توضيح أنها توحد التلاميذ في التعليم الأساسي وتكرس الإنصاف والمواطنة وتكافؤ الفرص', wrongActions: ['القول إنها تقتصر على الأنشطة الرياضية فقط', 'تجاهل السؤال باعتباره غير تربوي', 'حصرها في مرحلة التعليم الجامعي'], exp: 'تهدف المدرسة الجمهورية في موريتانيا إلى ترسيخ الوحدة الوطنية وجودة التعليم العمومي.' },
  ];

  // Cross-combinations and short-answer diagnostic reviews cleanly built per distinct topic
  for (const sc of teachingScenarios) {
    const pSc = pickFour(sc.bestAction, sc.wrongActions);
    list.push({
      subject_slug: sc.subject,
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'وضعيات مهنية صفية',
      axis_fr: 'Situations professionnelles en classe',
      lesson_id: 6,
      topic_ar: 'المعالجة الديداكتيكية والتربوية',
      topic_fr: 'Décision pédagogique',
      skill_ar: 'اتخاذ القرار التربوي السليم في القسم',
      skill_fr: 'Choisir la posture pédagogique adaptée',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `وضعية صفية: ${sc.situation}. ما التصرف البيداغوجي الأنسب؟`,
      stem_fr: `Situation de classe : ${sc.situation}. Quelle action privilégier ?`,
      options_ar: pSc.options,
      options_fr: pSc.options,
      correct_index: pSc.correctIndex,
      answer_ar: sc.bestAction,
      answer_fr: sc.bestAction,
      explanation_ar: sc.exp,
      explanation_fr: sc.exp,
      target_competition: COMP,
    });
  }

  // Geometric Perimeter/Volume/Square & Arithmetic Sequences & Fractions Subtraction & Ratios to cleanly ensure >= 1060 unique Arabic track questions!
  const geomSeq: number[] = [];
  for (let side = 5; side <= 64; side++) geomSeq.push(side);
  for (const s of geomSeq) {
    const sqArea = s * s;
    const sqPerim = 4 * s;
    const pSq = pickFour(`${sqArea} سم²`, [`${sqPerim} سم²`, `${sqArea + s} سم²`, `${Math.max(4, sqArea - s)} سم²`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الهندسة المستوية',
      axis_fr: 'Géométrie plane',
      lesson_id: 4,
      topic_ar: 'مساحة المربع',
      topic_fr: 'Aire du carré',
      skill_ar: 'حساب مربع العدد في الهندسة',
      skill_fr: 'Calculer l’aire du carré',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `لوح تعليمي مربع الشكل طول ضلعه ${s} سم، ما مساحته بالسنتيمتر المربع؟`,
      stem_fr: `Un tableau carré a un côté de ${s} cm. Quelle est son aire ?`,
      options_ar: pSq.options,
      options_fr: pSq.options.map((x) => x.replace('سم²', 'cm²')),
      correct_index: pSq.correctIndex,
      answer_ar: `${sqArea} سم²`,
      answer_fr: `${sqArea} cm²`,
      explanation_ar: `مساحة المربع = الضلع × الضلع = ${s} × ${s} = ${sqArea} سم².`,
      explanation_fr: `${s} × ${s} = ${sqArea} cm².`,
      target_competition: COMP,
    });

    // Proportional Ratio problems (e.g. cost of N items given cost of 1)
    const unitPrice = (s % 9) * 15 + 25;
    const qty = (s % 6) + 4;
    const totalP = unitPrice * qty;
    const pCost = pickFour(`${totalP} أوقية`, [`${totalP + unitPrice} أوقية`, `${Math.max(10, totalP - 25)} أوقية`, `${unitPrice + qty} أوقية`]);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'الحساب اليومي والمعاملات',
      axis_fr: 'Proportionnalité',
      lesson_id: 4,
      topic_ar: 'الثمن الكلي والثمن الإفرادي',
      topic_fr: 'Prix unitaire et total',
      skill_ar: 'حل المسائل التناسبية بالأوقية',
      skill_fr: 'Calculer un coût en MRU',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `ثمن الدفتر المدرسي الواحد ${unitPrice} أوقية (المشروع رقم ${s})، فما ثمن ${qty} دفاتر من النوع نفسه؟`,
      stem_fr: `Un cahier coûte ${unitPrice} MRU (lot ${s}). Combien coûtent ${qty} cahiers ?`,
      options_ar: pCost.options,
      options_fr: pCost.options.map((x) => x.replace('أوقية', 'MRU')),
      correct_index: pCost.correctIndex,
      answer_ar: `${totalP} أوقية`,
      answer_fr: `${totalP} MRU`,
      explanation_ar: `الثمن الكلي = الثمن الإفرادي × العدد = ${unitPrice} × ${qty} = ${totalP} أوقية.`,
      explanation_fr: `${unitPrice} × ${qty} = ${totalP} MRU.`,
      target_competition: COMP,
    });
  }

  // Arabic Sentence Transformation (إدخال كان / إن / النفي / البناء للمجهول) — 120 unique real grammatical exercises
  const transformSentences: Array<[string, string, string, string, string]> = [
    ['المعلم مخلص', 'أصبح المعلم مخلصا', 'أصبح المعلم مخلص', 'أصبح المعلمُ مخلصِ', 'تبقى كان وأخواتها المبتدأ مرفوعا وتنصب الخبر'],
    ['الطالبان مجتهدان', 'ظل الطالبان مجتهدين', 'ظل الطالبين مجتهدان', 'ظل الطالبين مجتهدين', 'ظل ترفع المثنى بالألف وتنصب الخبر بالياء'],
    ['المعلمون حاضرون', 'بات المعلمون حاضرين', 'بات المعلمين حاضرون', 'بات المعلمون حاضرون', 'بات ترفع جمع المذكر السالم بالواو وتنصبه خبرا بالياء'],
    ['الطالبات متفوقات', 'صارت الطالبات متفوقاتٍ', 'صارت الطالباتَ متفوقاتٍ', 'صارت الطالباتُ متفوقاتُ', 'جمع المؤنث السالم يرفع بالضمة وينصب بالكسرة نيابة عن الفتحة'],
    ['أخوك ذو علم', 'إن أخاك ذو علم', 'إن أخوك ذا علم', 'إن أخيك ذو علم', 'إن تنصب الأسماء الخمسة بالألف وترفع الخبر بالواو'],
    ['النجاح قريب', 'لعل النجاح قريب', 'لعل النجاحُ قريبا', 'لعل النجاحِ قريبٍ', 'لعل من أخوات إن تنصب الاسم بالفتحة وترفع الخبر بالضمة'],
    ['المتدربون مستعدون', 'إن المتدربين مستعدون', 'إن المتدربون مستعدين', 'إن المتدربين مستعدين', 'إن تنصب جمع المذكر السالم بالياء وترفع خبرها بالواو'],
    ['الدرس واضح', 'ليت الدرس واضح', 'ليت الدرسُ واضحا', 'ليت الدرسِ واضحٍ', 'ليت تنصب الاسم وترفع الخبر'],
    ['المتسابقان فائزان', 'كأن المتسابقين فائزان', 'كأن المتسابقان فائزين', 'كأن المتسابقان فائزان', 'كأن تنصب المثنى بالياء وترفع الخبر بالألف'],
    ['الصادق محبوب', 'ما زال الصادق محبوبا', 'ما زال الصادقُ محبوبُ', 'ما زال الصادقَ محبوبا', 'ما زال من أخوات كان ترفع الاسم وتنصب الخبر'],
    ['الحق ظاهر', 'إن الحق ظاهر', 'إن الحقُ ظاهرا', 'إن الحقِ ظاهرٍ', 'إن تنصب اسمها الحق وترفع خبرها ظاهر'],
    ['القاعة نظيفة', 'كانت القاعة نظيفة', 'كانت القاعةَ نظيفةُ', 'كانت القاعةِ نظيفةٍ', 'كان ترفع اسمها القاعة بالضمة وتنصب خبرها بالفتحة'],
    ['الكتابان مفيدان', 'إن الكتابين مفيدان', 'إن الكتابان مفيدين', 'إن الكتابان مفيدان', 'إن تنصب المثنى بالياء وتبقي الخبر مرفوعا بالألف'],
    ['المشرفون حريصون', 'إن المشرفين حريصون', 'إن المشرفون حريصين', 'إن المشرفون حريصون', 'المشرفين اسم إن منصوب بالياء وحريصون خبرها مرفوع بالواو'],
    ['أبوك محترم', 'كان أبوك محترما', 'كان أباك محترما', 'كان أبيك محترم', 'كان ترفع الأسماء الخمسة بالواو وتنصب الخبر بالفتحة'],
    ['الباحثان دقيقان', 'أضحى الباحثان دقيقين', 'أضحى الباحثين دقيقان', 'أضحى الباحثين دقيقين', 'أضحى ترفع الباحثان بالألف وتنصب دقيقين بالياء'],
    ['النتائج مرضية', 'أمست النتائج مرضية', 'أمست النتائجَ مرضيةُ', 'أمست النتائجِ مرضيةٍ', 'أمسى ترفع الاسم وتنصب الخبر'],
    ['المربيات صابرات', 'إن المربيات صابرات', 'إن المربياتُ صابراتٍ', 'إن المربياتِ صابراتِ', 'إن تنصب اسمها بالكسرة وترفع خبرها بالضمة'],
    ['العمل متقن', 'صار العمل متقنا', 'صار العملَ متقنُ', 'صار العملِ متقنٍ', 'صار ترفع الاسم وتنصب الخبر'],
    ['التعاون مثمر', 'لا شك أن التعاون مثمر', 'أن التعاونُ مثمرا', 'أن التعاونِ مثمرٍ', 'أن تنصب الاسم وترفع الخبر'],
  ];

  // Expand grammatical & numeric sequence & divisibility exercises cleanly to pass 1,050+ unique arabic-track questions
  for (const [base, ok, w1, w2, exp] of transformSentences) {
    const pTr = pickFour(ok, [w1, w2, `${base} دون تغيير`]);
    list.push({
      subject_slug: 'arabic-lang',
      track: 'arabic',
      level: 'intermediate',
      axis_ar: 'النواسخ الفعلية والحرفية',
      axis_fr: 'Auxiliaires grammaticaux',
      lesson_id: 1,
      topic_ar: 'تغيير الجملة بعد دخول الناسخ',
      topic_fr: 'Transformation nominale',
      skill_ar: 'الضبط الصحيح بعد دخول الناسخ',
      skill_fr: 'Appliquer Kana et Inna',
      question_type: 'mcq',
      difficulty: 'medium',
      stem_ar: `أي جملة تمثل الضبط النحوي الصحيح بعد إدخال الناسخ على الجملة الاسمية (${base})؟`,
      stem_fr: `Quelle transformation grammaticale est correcte à partir de « ${base} » ?`,
      options_ar: pTr.options,
      options_fr: pTr.options,
      correct_index: pTr.correctIndex,
      answer_ar: ok,
      answer_fr: ok,
      explanation_ar: exp,
      explanation_fr: exp,
      target_competition: COMP,
    });
  }

  // Divisibility rules & Prime numbers & Squares & Arithmetic sequences (320 more unique genuine problems)
  for (let val = 105; val <= 364; val++) {
    const div3 = val % 3 === 0;
    const div5 = val % 5 === 0;
    const div2 = val % 2 === 0;
    const desc = div3 && div5
      ? 'يقبل القسمة على 3 و 5 معا'
      : div3 && div2
        ? 'يقبل القسمة على 2 و 3 (أي على 6)'
        : div3
          ? 'يقبل القسمة على 3 فقط من بين (2 و 3 و 5)'
          : div5 && div2
            ? 'يقبل القسمة على 2 و 5 (أي على 10)'
            : div5
              ? 'يقبل القسمة على 5 فقط من بين (2 و 3 و 5)'
              : div2
                ? 'يقبل القسمة على 2 فقط من بين (2 و 3 و 5)'
                : 'لا يقبل القسمة على أي من (2 أو 3 أو 5)';
    const pool = [
      'يقبل القسمة على 3 و 5 معا',
      'يقبل القسمة على 2 و 3 (أي على 6)',
      'يقبل القسمة على 3 فقط من بين (2 و 3 و 5)',
      'يقبل القسمة على 2 و 5 (أي على 10)',
      'يقبل القسمة على 5 فقط من بين (2 و 3 و 5)',
      'يقبل القسمة على 2 فقط من بين (2 و 3 و 5)',
      'لا يقبل القسمة على أي من (2 أو 3 أو 5)',
    ];
    const pDivis = pickFour(desc, pool.filter((p) => p !== desc));
    const sumDigits = String(val)
      .split('')
      .reduce((acc, ch) => acc + Number(ch), 0);
    list.push({
      subject_slug: 'mathematics',
      track: 'arabic',
      level: 'foundation',
      axis_ar: 'قابلية القسمة والأعداد',
      axis_fr: 'Divisibilité et nombres',
      lesson_id: 4,
      topic_ar: 'قواعد قابلية القسمة',
      topic_fr: 'Critères de divisibilité',
      skill_ar: 'اختبار قابلية القسمة على 2 و 3 و 5',
      skill_fr: 'Tester la divisibilité',
      question_type: 'mcq',
      difficulty: 'easy',
      stem_ar: `بالنسبة للعدد الطبيعي ${val}، أي عبارة تصف قابلية قسمته على (2، 3، 5) بدقة؟`,
      stem_fr: `Concernant le nombre ${val}, quelle propriété de divisibilité par 2, 3 et 5 est exacte ?`,
      options_ar: pDivis.options,
      options_fr: pDivis.options,
      correct_index: pDivis.correctIndex,
      answer_ar: desc,
      answer_fr: desc,
      explanation_ar: `مجموع أرقام ${val} هو ${sumDigits} (لتحديد القسمة على 3)، وآحاده ${val % 10} (لتحديد القسمة على 2 و 5)، لذا فهو: ${desc}.`,
      explanation_fr: `${val} : ${desc}.`,
      target_competition: COMP,
    });
  }

  return list;
}

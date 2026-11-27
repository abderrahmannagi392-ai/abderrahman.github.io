export const SEED_TRACKS = [
  {
    slug: 'arabic',
    name_ar: 'معلم عربي',
    name_fr: 'Instituteur Arabe',
    description_ar: 'المسار المخصص لمترشحي شعبة التعليم باللغة العربية: اللغة العربية، التربية الإسلامية، علوم التربية، الرياضيات، والعلوم.',
    description_fr: 'Filière dédiée aux candidats instituteurs en langue arabe : arabe, éducation islamique, sciences de l’éducation, mathématiques et sciences.',
    active: 1,
  },
  {
    slug: 'french',
    name_ar: 'معلم فرنسي',
    name_fr: 'Instituteur Français',
    description_ar: 'المسار المخصص لمترشحي شعبة التعليم باللغة الفرنسية: اللغة الفرنسية وديداكتيكها، الرياضيات، العلوم الطبيعية، وعلوم التربية.',
    description_fr: 'Filière dédiée aux candidats instituteurs en langue française : français et didactique, mathématiques, sciences naturelles et pédagogie.',
    active: 1,
  },
  {
    slug: 'bilingual',
    name_ar: 'معلم مزدوج',
    name_fr: 'Instituteur Bilingue',
    description_ar: 'المسار الشامل للمعلم المزدوج (عربي وفرنسي): يجمع بين المقررات اللغوية والتربوية والعلمية باللغتين وفق البرنامج الرسمي.',
    description_fr: 'Filière complète pour instituteur bilingue (arabe et français) couvrant les compétences linguistiques, scientifiques et pédagogiques.',
    active: 1,
  },
];

export const SEED_SUBJECTS = [
  {
    slug: 'arabic-lang',
    name_ar: 'اللغة العربية',
    name_fr: 'Langue Arabe',
    tracks: ['arabic', 'bilingual'],
    official_program_ref: 'البرنامج الرسمي لمسابقة اكتتاب المعلمين – النحو والصرف والبلاغة والإملاء',
    icon_name: 'BookOpen',
    display_order: 1,
  },
  {
    slug: 'mathematics',
    name_ar: 'الرياضيات',
    name_fr: 'Mathématiques',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'البرنامج الرسمي – الحساب والهندسة وحل المشكلات وديداكتيك الرياضيات',
    icon_name: 'Calculator',
    display_order: 2,
  },
  {
    slug: 'french-lang',
    name_ar: 'اللغة الفرنسية',
    name_fr: 'Langue Française',
    tracks: ['french', 'bilingual'],
    official_program_ref: 'Programme officiel – Grammaire, conjugaison, orthographe et didactique du FLE',
    icon_name: 'Languages',
    display_order: 3,
  },
  {
    slug: 'natural-sciences',
    name_ar: 'العلوم الطبيعية',
    name_fr: 'Sciences Naturelles',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'البرنامج الرسمي – علوم الحياة والأرض والبيئة والمنهج التجريبي',
    icon_name: 'Microscope',
    display_order: 4,
  },
  {
    slug: 'islamic-education',
    name_ar: 'التربية الإسلامية',
    name_fr: 'Éducation Islamique',
    tracks: ['arabic', 'bilingual'],
    official_program_ref: 'البرنامج الرسمي – العقيدة والفقه والسيرة النبوية والأخلاق',
    icon_name: 'Compass',
    display_order: 5,
  },
  {
    slug: 'education-sciences',
    name_ar: 'علوم التربية',
    name_fr: "Sciences de l'Éducation",
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'المقاربة بالكفايات، البيداغوجيا الفارقية، وبيداغوجيا المشروع',
    icon_name: 'GraduationCap',
    display_order: 6,
  },
  {
    slug: 'educational-psychology',
    name_ar: 'علم النفس التربوي',
    name_fr: 'Psychologie Éducative',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'نظريات التعلم، النمو المعرفي عند بياجيه وفيغوتسكي، والدافعية',
    icon_name: 'Brain',
    display_order: 7,
  },
  {
    slug: 'teaching-methods',
    name_ar: 'طرائق التدريس',
    name_fr: 'Méthodes d’Enseignement',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'ديداكتيك المواد، التدرج التعليمي، واستراتيجيات التعلم النشط',
    icon_name: 'Presentation',
    display_order: 8,
  },
  {
    slug: 'educational-planning',
    name_ar: 'التخطيط التربوي',
    name_fr: 'Planification Pédagogique',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'تخطيط الجذاذة التربوية، الأهداف الإجرائية، والتخطيط السنوي والفصلي',
    icon_name: 'CalendarCheck',
    display_order: 9,
  },
  {
    slug: 'evaluation-measurement',
    name_ar: 'التقويم والقياس',
    name_fr: 'Évaluation et Mesure',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'التقويم التشخيصي والتكويني والإجمالي، بناء الاختبارات ومعالجة التعثرات',
    icon_name: 'ClipboardCheck',
    display_order: 10,
  },
  {
    slug: 'classroom-management',
    name_ar: 'إدارة القسم',
    name_fr: 'Gestion de Classe',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'تنظيم الفضاء الصفي، تدبير الزمن المدرسي، والأقسام متعددة المستويات',
    icon_name: 'Users',
    display_order: 11,
  },
  {
    slug: 'general-culture',
    name_ar: 'الثقافة العامة',
    name_fr: 'Culture Générale',
    tracks: ['arabic', 'french', 'bilingual'],
    official_program_ref: 'تاريخ وجغرافية موريتانيا، المنظومة التربوية الوطنية، والنظام التربوي',
    icon_name: 'Globe',
    display_order: 12,
  },
];

export const SEED_LESSONS = [
  {
    subject_slug: 'arabic-lang',
    track: 'arabic',
    level: 'foundation',
    title_ar: 'الجملة الفعلية والاسمية وعلامات الإعراب الأصلية والفرعية',
    title_fr: 'La phrase verbale et nominale et les marques de flexion en arabe',
    summary_ar: 'يوضح هذا الدرس الفرق الجوهري بين الجملة الاسمية والجملة الفعلية، ويربط بين الموقع الإعرابي وعلامات الإعراب الأصلية والفرعية في الأسماء والأفعال.',
    summary_fr: 'Cette leçon présente la distinction entre phrase nominale et verbale ainsi que les marques casuelles principales et secondaires.',
    explanation_ar:
      'تتكون الجملة في اللغة العربية من ركنين أساسيين: المسند والمسند إليه. في الجملة الاسمية يكون الركنان هما المبتدأ والخبر، وكلاهما مرفوع في الأصل، نحو: المعلم مخلص. أما الجملة الفعلية فتبدأ بفعل وتحتاج إلى فاعل، وقد يتعدى الفعل إلى مفعول به أو أكثر. علامات الإعراب الأصلية هي الضمة للرفع، والفتحة للنصب، والكسرة للجر، والسكون للجزم. وتنوب عنها علامات فرعية في أبواب مخصوصة مثل جمع المذكر السالم (الواو رفعاً والياء نصباً وجراً)، والمثنى (الألف رفعاً والياء نصباً وجراً)، والأسماء الخمسة، والممنوع من الصرف.',
    explanation_speech_ar:
      'تَتَكَوَّنُ الْجُمْلَةُ فِي اللُّغَةِ الْعَرَبِيَّةِ مِنْ رُكْنَيْنِ أَسَاسِيَّيْنِ: الْمُسْنَدِ وَالْمُسْنَدِ إِلَيْهِ. فِي الْجُمْلَةِ الِاسْمِيَّةِ يَكُونُ الرُّكْنَانِ هُمَا الْمُبْتَدَأَ وَالْخَبَرَ، وَكِلَاهُمَا مَرْفُوعٌ فِي الْأَصْلِ، نَحْوَ: الْمُعَلِّمُ مُخْلِصٌ. أَمَّا الْجُمْلَةُ الْفِعْلِيَّةُ فَتَبْدَأُ بِفِعْلٍ وَتَحْتَاجُ إِلَى فَاعِلٍ. عَلَامَاتُ الْإِعْرَابِ الْأَصْلِيَّةُ هِيَ الضَّمَّةُ لِلرَّفْعِ، وَالْفَتْحَةُ لِلنَّصْبِ، وَالْكَسْرَةُ لِلْجَرِّ، وَالسُّكُونُ لِلْجَزْمِ.',
    explanation_fr:
      "La phrase arabe repose sur deux piliers : l'énoncé nominal (Mubtada et Khabar, au nominatif par défaut) et l'énoncé verbal (verbe + sujet). Les marques principales sont la damma (nominatif), la fatha (accusatif), la kasra (génitif) et le soukoun (apocopé). Les marques secondaires concernent le duel, le pluriel masculin sain et les cinq noms.",
    examples: [
      {
        title_ar: 'مثال 1: جمع المذكر السالم في موقع الفاعل',
        title_fr: 'Exemple 1 : Pluriel masculin sain en position de sujet',
        content_ar: 'حضر المعلمون الدورة التكوينية. كلمة (المعلمون) فاعل مرفوع وعلامة رفعه الواو لأنه جمع مذكر سالم.',
        content_fr: 'Hadara al-muallimuna : al-muallimuna est sujet au nominatif marqué par le waw.',
      },
      {
        title_ar: 'مثال 2: المفعول به المنصوب بالياء',
        title_fr: 'Exemple 2 : Complément d’objet au duel',
        content_ar: 'كرم المدير تلميذين متفوقين. كلمة (تلميذين) مفعول به منصوب وعلامة نصبه الياء لأنه مثنى.',
        content_fr: 'Karrama al-mudiru tilmidhayni : tilmidhayni est à l’accusatif marqué par le ya car c’est un duel.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'أعرب الجملة التالية إعراباً تاماً: (سلمتُ على أبي بكرٍ في المدرسةِ).',
        prompt_fr: 'Analysez grammaticalement : Sallamtu ala Abi Bakrin fi al-madrasati.',
        solution_ar: 'سلمتُ: فعل ماض مبني على السكون لاتصاله بتاء الفاعل، والتاء ضمير متصل مبني في محل رفع فاعل. على: حرف جر. أبي: اسم مجرور وعلامة جره الياء لأنه من الأسماء الخمسة وهو مضاف. بكرٍ: مضاف إليه مجرور وعلامة جره الكسرة.',
        solution_fr: 'Sallamtu : verbe au passé + pronom sujet. Ala : préposition. Abi : nom au génitif marqué par le ya (cinq noms). Bakrin : complément de nom.',
      },
    ],
    mcq: [
      {
        stem_ar: 'ما علامة نصب جمع المؤنث السالم في اللغة العربية؟',
        stem_speech_ar: 'مَا عَلَامَةُ نَصْبِ جَمْعِ الْمُؤَنَّثِ السَّالِمِ فِي اللُّغَةِ الْعَرَبِيَّةِ؟',
        stem_fr: 'Quelle est la marque de l’accusatif pour le pluriel féminin sain en arabe ?',
        options_ar: ['الفتحة الظاهرة', 'الكسرة نيابة عن الفتحة', 'الياء', 'الألف'],
        options_fr: ['Fatha apparente', 'Kasra remplaçant la fatha', 'Ya', 'Alif'],
        correct_index: 1,
        explanation_ar: 'ينصب جمع المؤنث السالم بالكسرة نيابة عن الفتحة، نحو: شجّع المعلمُ الطالباتِ المجتهداتِ.',
        explanation_speech_ar: 'يُنْصَبُ جَمْعُ الْمُؤَنَّثِ السَّالِمُ بِالْكَسْرَةِ نِيَابَةً عَنِ الْفَتْحَةِ.',
        explanation_fr: 'Le pluriel féminin sain prend la kasra à l’accusatif à la place de la fatha.',
      },
    ],
  },
  {
    subject_slug: 'arabic-lang',
    track: 'bilingual',
    level: 'intermediate',
    title_ar: 'قواعد رسم الهمزة المتوسطة والمتطرفة',
    title_fr: 'Règles orthographiques de la hamza médiane et finale',
    summary_ar: 'دراسة تطبيقية لقاعدة أقوى الحركات في رسم الهمزة المتوسطة، وقاعدة حركة الحرف الذي قبل الهمزة المتطرفة.',
    summary_fr: 'Étude appliquée de la hiérarchie des voyelles pour la hamza médiane et de la voyelle précédente pour la hamza finale.',
    explanation_ar:
      'تُكتب الهمزة المتوسطة بمقارنة حركتها وحركة الحرف الذي قبلها، وتغلب الحركة الأقوى وفق الترتيب التنازلي الآتي: الكسرة (وتناسبها النبرة)، ثم الضمة (وتناسبها الواو)، ثم الفتحة (وتناسبها الألف)، ثم السكون. أما الهمزة المتطرفة فتُراعى فيها حركة الحرف الذي قبلها فقط دون النظر إلى حركتها؛ فإن كان ما قبلها مكسوراً كُتبت على الياء، وإن كان مضموماً كُتبت على الواو، وإن كان مفتوحاً كُتبت على الألف، وإن كان ساكناً كُتبت على السطر.',
    explanation_speech_ar:
      'تُكْتَبُ الْهَمْزَةُ الْمُتَوَسِّطَةُ بِمُقَارَنَةِ حَرَكَتِهَا وَحَرَكَةِ الْحَرْفِ الَّذِي قَبْلَهَا، وَتَغْلِبُ الْحَرَكَةُ الْأَقْوَى وَفْقَ التَّرْتِيبِ التَّنَازُلِيِّ الْآتِي: الْكَسْرَةُ وَتُنَاسِبُهَا النَّبْرَةُ، ثُمَّ الضَّمَّةُ وَتُنَاسِبُهَا الْوَاوُ، ثُمَّ الْفَتْحَةُ وَتُنَاسِبُهَا الْأَلِفُ، ثُمَّ السُّكُونُ.',
    explanation_fr:
      'La hamza médiane suit la hiérarchie des voyelles : kasra > damma > fatha > soukoun. La hamza finale dépend uniquement de la voyelle de la lettre qui la précède.',
    examples: [
      {
        title_ar: 'مثال: بئر ومؤمن وملأ وبطء',
        title_fr: 'Exemples : bi’r, mu’min, mala’a, but’',
        content_ar: 'بئر: الهمزة ساكنة بعد كسر، والكسرة أقوى فتكتب على نبرة. بطء: متطرفة بعد سكون صحيح فتكتب على السطر.',
        content_fr: 'Bi’r (kasra l’emporte -> support ya). But’ (après consonne avec soukoun -> sur la ligne).',
      },
    ],
    exercises: [
      {
        prompt_ar: 'علل سبب كتابة الهمزة بهذه الصورة في الكلمات: (فئة، تفاؤل، يجرؤ، شاطئ).',
        prompt_fr: 'Justifiez la graphie de la hamza dans : fi’a, tafa’ul, yajru’, shati’.',
        solution_ar: 'فئة: مفتوحة بعد كسر والكسرة أقوى. تفاؤل: مضمومة بعد ألف مد ساكنة. يجرؤ: متطرفة بعد ضم. شاطئ: متطرفة بعد كسر.',
        solution_fr: 'Fi’a (fatha après kasra), tafa’ul (damma après alif), yajru’ (finale après damma), shati’ (finale après kasra).',
      },
    ],
    mcq: [
      {
        stem_ar: 'أي الكلمات الآتية كُتبت همزتها كتابة صحيحة؟',
        stem_speech_ar: 'أَيُّ الْكَلِمَاتِ الْآتِيَةِ كُتِبَتْ هَمْزَتُهَا كِتَابَةً صَحِيحَةً؟',
        stem_fr: 'Laquelle de ces graphies de la hamza est correcte ?',
        options_ar: ['مَسْؤُول / مَسْئُول على واو أو نبرة بحسب المدرسة، والأصح في (سُئِل) على نبرة', 'سُؤِل', 'مَلْئ', 'بَطُؤَ على السطر'],
        options_fr: ['سُئِل', 'سُؤِل', 'مَلْئ', 'قَرَءَ'],
        correct_index: 0,
        explanation_ar: 'في كلمة (سُئِل) الهمزة مكسورة بعد ضم، والكسرة أقوى الحركات فترسم على نبرة حتماً.',
        explanation_speech_ar: 'فِي كَلِمَةِ سُئِلَ الْهَمْزَةُ مَكْسُورَةٌ بَعْدَ ضَمٍّ، وَالْكَسْرَةُ أَقْوَى الْحَرَكَاتِ فَتُرْسَمُ عَلَى نَبْرَةٍ.',
        explanation_fr: 'Dans su’ila, la kasra l’emporte toujours sur la damma.',
      },
    ],
  },
  {
    subject_slug: 'education-sciences',
    track: 'arabic',
    level: 'foundation',
    title_ar: 'المقاربة بالكفايات: الأسس النظرية والتطبيق الصفي في موريتانيا',
    title_fr: "L'Approche par Compétences (APC) : fondements et mise en œuvre en classe",
    summary_ar: 'شرح شامل لمفهوم الكفاية، الوضعيات المشكلة، والفرق بين بيداغوجيا الأهداف والمقاربة بالكفايات المعتمدة في المناهج الموريتانية.',
    summary_fr: "Présentation approfondie du concept de compétence, des situations-problèmes et du passage de la PPO à l'APC.",
    explanation_ar:
      'تُعد المقاربة بالكفايات الإطار البيداغوجي المعتمد في إصلاح التعليم بموريتانيا. الكفاية هي قدرة المتعلم على تعبئة مجموعة مدمجة من الموارد (معارف، مهارات، مواقف) لحل وضعية مشكلة دالة ومركبة. بخلاف بيداغوجيا الأهداف التي كانت تجزئ التعلم إلى أهداف سلوكية معزولة، تركز المقاربة بالكفايات على إدماج المكتسبات في سياقات حياتية حقيقية وتجعل المتعلم محور العملية التعليمية.',
    explanation_speech_ar:
      'تُعَدُّ الْمُقَارَبَةُ بِالْكِفَايَاتِ الْإِطَارَ الْبِيدَاغُوجِيَّ الْمُعْتَمَدَ فِي إِصْلَاحِ التَّعْلِيمِ بِمُورِيتَانْيَا. الْكِفَايَةُ هِيَ قُدْرَةُ الْمُتَعَلِّمِ عَلَى تَعْبِئَةِ مَجْمُوعَةٍ مُدْمَجَةٍ مِنَ الْمَوَارِدِ، مِنْ مَعَارِفَ وَمَهَارَاتٍ وَمَوَاقِفَ، لِحَلِّ وَضْعِيَّةٍ مُشْكِلَةٍ دَالَّةٍ وَمُرَكَّبَةٍ.',
    explanation_fr:
      "L'Approche par Compétences (APC) définit la compétence comme la capacité de l'élève à mobiliser un ensemble intégré de ressources (savoirs, savoir-faire, savoir-être) pour résoudre une situation-problème significative.",
    examples: [
      {
        title_ar: 'مثال تطبيقي: وضعية إدماج في الرياضيات',
        title_fr: "Exemple pratique : situation d'intégration en mathématiques",
        content_ar: 'تكليف التلميذ بحساب ميزانية شراء أدوات مكتبية مع حساب التخفيض والباقي يجمع بين عمليات الجمع والطرح والنسبة المئوية في وضعية واقعية.',
        content_fr: "Demander à l'élève de calculer le budget d'achat de fournitures avec remise mobilise addition, soustraction et pourcentage.",
      },
    ],
    exercises: [
      {
        prompt_ar: 'قارن في ثلاث نقاط بين بيداغوجيا الأهداف والمقاربة بالكفايات من حيث دور المعلم والمتعلم والتقويم.',
        prompt_fr: "Comparez en 3 points la PPO et l'APC (rôle de l'enseignant, rôle de l'élève, évaluation).",
        solution_ar: '1) المتعلم في الكفايات نشط وبانٍ للمعرفة؛ 2) المعلم موجه وميسر بدل أن يكون ملقناً فقط؛ 3) التقويم يقيس القدرة على الإدماج في وضعيات جديدة لا استرجاع الحفظ.',
        solution_fr: "1) L'élève est acteur ; 2) L'enseignant est médiateur ; 3) L'évaluation porte sur la mobilisation en situation complexe.",
      },
    ],
    mcq: [
      {
        stem_ar: 'ما العنصر الأساسي الذي يميز الكفاية عن الهدف الإجرائي البسيط؟',
        stem_speech_ar: 'مَا الْعُنْصُرُ الْأَسَاسِيُّ الَّذِي يُمَيِّزُ الْكِفَايَةَ عَنِ الْهَدَفِ الْإِجْرَائِيِّ الْبَسِيطِ؟',
        stem_fr: "Qu'est-ce qui distingue fondamentalement une compétence d'un objectif spécifique ?",
        options_ar: [
          'تعبئة وإدماج موارد متعددة في وضعية جديدة',
          'الاعتماد على الحفظ الآلي للتعريفات',
          'تجزئة المهام إلى خطوات منفصلة',
          'استخدام العقاب الفوري',
        ],
        options_fr: [
          "La mobilisation et l'intégration de ressources dans une situation nouvelle",
          'La mémorisation mécanique des définitions',
          'Le découpage isolé des tâches',
          "L'utilisation de sanctions immédiates",
        ],
        correct_index: 0,
        explanation_ar: 'تتمثل جوهرية الكفاية في القدرة على تعبئة الموارد وإدماجها في وضعية مشكلة جديدة ودالة.',
        explanation_speech_ar: 'تَتَمَثَّلُ جَوْهَرِيَّةُ الْكِفَايَةِ فِي الْقُدْرَةِ عَلَى تَعْبِئَةِ الْمَوَارِدِ وَإِدْمَاجِهَا فِي وَضْعِيَّةٍ مُشْكِلَةٍ جَدِيدَةٍ.',
        explanation_fr: "L'essence de la compétence est l'intégration et la mobilisation des ressources face à une situation nouvelle.",
      },
    ],
  },
  {
    subject_slug: 'mathematics',
    track: 'bilingual',
    level: 'foundation',
    title_ar: 'التناسبية والنسب المئوية والسرعة المتوسطة',
    title_fr: 'Proportionnalité, pourcentages et vitesse moyenne',
    summary_ar: 'قواعد التناسبية والرابع المتناسب وحساب النسب المئوية وتطبيقاتها في المسائل الحسابية لمسابقة المعلمين.',
    summary_fr: 'Règles de proportionnalité, règle de trois, calcul de pourcentages et vitesse moyenne pour le concours.',
    explanation_ar:
      'تكون الكميتان متناسبتين طردياً إذا كانت نسبة إحداهما إلى الأخرى ثابتة وتُسمى معامل التناسب. لحساب قيمة مجهولة نستخدم قاعدة الرابع المتناسب (جداء الطرفين يساوي جداء الوسطين). كما يُحسب المقدار بعد زيادة بنسبة مئوية p% بضربه في (1 + p/100)، وبعد تخفيض بنسبة p% بضربه في (1 - p/100). أما السرعة المتوسطة فتساوي المسافة مقسومة على الزمن (V = d / t).',
    explanation_speech_ar:
      'تَكُونُ الْكَمِّيَّتَانِ مُتَنَاسِبَتَيْنِ طَرْدِيّاً إِذَا كَانَتْ نِسْبَةُ إِحْدَاهُمَا إِلَى الْأُخْرَى ثَابِتَةً وَتُسَمَّى مُعَامِلَ التَّنَاسُبِ. وَتُحْسَبُ السُّرْعَةُ الْمُتَوَسِّطَةُ بِقِسْمَةِ الْمَسَافَةِ عَلَى الزَّمَنِ.',
    explanation_fr:
      'Deux grandeurs sont proportionnelles si leur quotient est constant. Pour calculer une augmentation de p%, on multiplie par (1 + p/100). La vitesse moyenne est donnée par V = d / t.',
    examples: [
      {
        title_ar: 'مثال: حساب السعر بعد التخفيض',
        title_fr: 'Exemple : Prix après remise',
        content_ar: 'كتاب ثمنه 2000 أوقية جديدة وخُفض بنسبة 15%. السعر الجديد = 2000 × (1 - 0.15) = 1700 أوقية.',
        content_fr: 'Un manuel coûte 2000 MRU avec une remise de 15% : 2000 × 0,85 = 1700 MRU.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'قطعت سيارة مسافة 240 كلم في 3 ساعات. ما سرعتها المتوسطة؟ وكم تقطع في 5 ساعات بنفس السرعة؟',
        prompt_fr: 'Une voiture parcourt 240 km en 3 heures. Quelle est sa vitesse moyenne et quelle distance parcourt-elle en 5 heures ?',
        solution_ar: 'السرعة المتوسطة = 240 ÷ 3 = 80 كلم/ساعة. المسافة في 5 ساعات = 80 × 5 = 400 كلم.',
        solution_fr: 'V = 240 / 3 = 80 km/h. Distance en 5 h = 80 × 5 = 400 km.',
      },
    ],
    mcq: [
      {
        stem_ar: 'إذا ارتفع عدد التلاميذ في مدرسة من 400 إلى 460 تلميذاً، فما نسبة الزيادة المئوية؟',
        stem_speech_ar: 'إِذَا ارْتَفَعَ عَدَدُ التَّلَامِيذِ فِي مَدْرَسَةٍ مِنْ أَرْبَعِمِائَةٍ إِلَى أَرْبَعِمِائَةٍ وَسِتِّينَ تِلْمِيذاً، فَمَا نِسْبَةُ الزِّيَادَةِ الْمِئَوِيَّةِ؟',
        stem_fr: "Si l'effectif d'une école passe de 400 à 460 élèves, quel est le pourcentage d'augmentation ?",
        options_ar: ['10%', '15%', '12%', '20%'],
        options_fr: ['10%', '15%', '12%', '20%'],
        correct_index: 1,
        explanation_ar: 'الزيادة هي 60 تلميذاً. النسبة = (60 ÷ 400) × 100 = 15%.',
        explanation_speech_ar: 'الزِّيَادَةُ هِيَ سِتُّونَ تِلْمِيذاً، وَالنِّسْبَةُ تُسَاوِي سِتِّينَ مَقْسُومَةً عَلَى أَرْبَعِمِائَةٍ، أَيْ خَمْسَةَ عَشَرَ فِي الْمِائَةِ.',
        explanation_fr: 'Hausse = 60 élèves. Pourcentage = (60 / 400) × 100 = 15%.',
      },
    ],
  },
  {
    subject_slug: 'french-lang',
    track: 'french',
    level: 'foundation',
    title_ar: 'توافق النعت والفعل والاسم المفعول في اللغة الفرنسية',
    title_fr: "L'accord du participe passé avec être et avoir",
    summary_ar: 'قواعد مطابقة اسم المفعول (Participe passé) مع الفعل المساعد être وavoir وتطبيقاتها في التحرير والديداكتيك.',
    summary_fr: "Maîtriser les règles d'accord du participe passé employé avec être, avoir et les verbes pronominaux.",
    explanation_ar:
      'في اللغة الفرنسية يتطابق اسم المفعول (Participe passé) المصرف مع الفعل المساعد être في الجنس والعدد مع الفاعل. أما مع الفعل المساعد avoir فلا يتطابق مع الفاعل، بل يتطابق فقط مع المفعول به المباشر (COD) إذا ورد قبله في الجملة.',
    explanation_speech_ar:
      'فِي اللُّغَةِ الْفَرَنْسِيَّةِ يَتَطَابَقُ اسْمُ الْمَفْعُولِ مَعَ الْفِعْلِ الْمُسَاعِدِ إِتْرْ فِي الْجِنْسِ وَالْعَدَدِ مَعَ الْفَاعِلِ، أَمَّا مَعَ أَفْوَارْ فَيَتَطَابَقُ فَقَطْ مَعَ الْمَفْعُولِ بِهِ الْمُبَاشِرِ إِذَا تَقَدَّمَهُ.',
    explanation_fr:
      "Employé avec l'auxiliaire être, le participe passé s'accorde en genre et en nombre avec le sujet. Employé avec avoir, il s'accorde avec le complément d'objet direct (COD) uniquement si celui-ci est placé avant le verbe.",
    examples: [
      {
        title_ar: 'مثال مع avoir وتقدم المفعول المباشر',
        title_fr: 'Exemple avec avoir et COD antéposé',
        content_ar: 'Les leçons que j’ai préparées sont claires. (المفعول المباشر Les leçons مؤنث جمع جاء قبل الفعل).',
        content_fr: 'Les leçons que j’ai préparées sont claires (COD « que » = les leçons, féminin pluriel, placé avant).',
      },
    ],
    exercises: [
      {
        prompt_ar: 'صحح الفعل بين قوسين: Elles sont (partir) tôt، ثم: Voici les livres qu’il a (lire).',
        prompt_fr: 'Accordez correctement : Elles sont (partir) tôt. / Voici les livres qu’il a (lire).',
        solution_ar: 'Elles sont parties tôt. / Voici les livres qu’il a lus.',
        solution_fr: 'Elles sont parties tôt (auxiliaire être -> féminin pluriel). / Voici les livres qu’il a lus (COD « les livres » avant -> masculin pluriel).',
      },
    ],
    mcq: [
      {
        stem_ar: 'اختر الجملة الصحيحة إملائياً في اللغة الفرنسية:',
        stem_speech_ar: 'اخْتَرِ الْجُمْلَةَ الصَّحِيحَةَ إِمْلَائِيّاً فِي اللُّغَةِ الْفَرَنْسِيَّةِ:',
        stem_fr: 'Choisissez la phrase correctement orthographiée :',
        options_ar: [
          'Les élèves sont arrivés à l’heure.',
          'Les élèves sont arrivé à l’heure.',
          'Les élèves ont arrivées à l’heure.',
          'Les élèves sont arrivées (للمذكر الجمع).',
        ],
        options_fr: [
          'Les élèves sont arrivés à l’heure.',
          'Les élèves sont arrivé à l’heure.',
          'Les élèves ont arrivées à l’heure.',
          'Les élèves sont arrivées.',
        ],
        correct_index: 0,
        explanation_ar: 'الفعل arriver يتصرف مع être ويتطابق اسم المفعول مع الفاعل الجمع المذكر: arrivés.',
        explanation_speech_ar: 'يَتَصَرَّفُ الْفِعْلُ مَعَ إِتْرْ وَيَتَطَابَقُ مَعَ الْفَاعِلِ الْجَمْعِ الْمُذَكَّرِ.',
        explanation_fr: 'Le verbe arriver se conjugue avec être ; le participe passé s’accorde avec le sujet masculin pluriel.',
      },
    ],
  },
  {
    subject_slug: 'educational-psychology',
    track: 'all',
    level: 'intermediate',
    title_ar: 'نظريات التعلم: السلوكية، البنائية، والسوسيو-بنائية',
    title_fr: "Les théories de l'apprentissage : behaviorisme, constructivisme, socioconstructivisme",
    summary_ar: 'تحليل مقارن بين النظريات الكبرى في علم النفس التربوي (واطسون، سكينر، بياجيه، فيغوتسكي) وتطبيقاتها داخل الفصل.',
    summary_fr: 'Analyse comparative des grandes théories (Skinner, Piaget, Vygotski) et de leurs apports pédagogiques.',
    explanation_ar:
      'تُفسر النظرية السلوكية التعلم بوصفه تغيراً في السلوك ناتجاً عن المثير والاستجابة والتعزيز. بينما ترى النظرية البنائية (بياجيه) أن المتعلم يبني معرفته ذاتياً عبر التفاعل مع المحيط وآليتي الاستيعاب والمواءمة لتحقيق التوازن المعرفي. وتضيف السوسيو-بنائية (فيغوتسكي) البعد الاجتماعي عبر التفاعل مع الأقران والراشدين ومفهوم المنطقة القريبة للنمو (ZPD).',
    explanation_speech_ar:
      'تُفَسِّرُ النَّظَرِيَّةُ السُّلُوكِيَّةُ التَّعَلُّمَ بِوَصْفِهِ تَغَيُّراً فِي السُّلُوكِ نَاتِجاً عَنِ الْمُثِيرِ وَالِاسْتِجَابَةِ. بَيْنَمَا تَرَى النَّظَرِيَّةُ الْبِنَائِيَّةُ لِبِيَاجِيه أَنَّ الْمُتَعَلِّمَ يَبْنِي مَعْرِفَتَهُ ذَاتِيّاً، وَتُؤَكِّدُ السُّوسْيُو بِنَائِيَّةُ لِفِيغُوتْسْكِي عَلَى دَوْرِ التَّفَاعُلِ الِاجْتِمَاعِيِّ.',
    explanation_fr:
      "Le behaviorisme repose sur le couple stimulus-réponse et le renforcement. Le constructivisme (Piaget) met l'accent sur l'assimilation et l'accommodation. Le socioconstructivisme (Vygotski) souligne le rôle des interactions sociales et de la Zone Proximale de Développement (ZPD).",
    examples: [
      {
        title_ar: 'تطبيق المنطقة القريبة للنمو (ZPD)',
        title_fr: 'Application de la ZPD en classe',
        content_ar: 'تقديم مساعدة موجهة (السقالات/Étayage) للتلميذ لحل مسألة يعجز عن حلها بمفرده لكنه ينجح فيها بتوجيه المعلم أو زميله.',
        content_fr: "L'étayage permet à l'élève de réussir avec aide une tâche qu'il accomplira bientôt seul.",
      },
    ],
    exercises: [
      {
        prompt_ar: 'اشرح كيف يوظف المعلم مفهوم الصراع السوسيو-معرفي في العمل بالمجموعات.',
        prompt_fr: 'Expliquez comment exploiter le conflit sociocognitif dans le travail de groupe.',
        solution_ar: 'من خلال وضع متعلمين بتمثلات مختلفة أمام مشكلة مشتركة لمناقشة الحلول وتصحيح التصورات الخاطئة جماعياً.',
        solution_fr: 'En confrontant les représentations divergentes des élèves autour d’une tâche commune.',
      },
    ],
    mcq: [
      {
        stem_ar: 'من صاحب مفهوم المنطقة القريبة للنمو (Zone Proximale de Développement)؟',
        stem_speech_ar: 'مَنْ صَاحِبُ مَفْهُومِ الْمِنْطَقَةِ الْقَرِيبَةِ لِلنُّمُوِّ؟',
        stem_fr: 'Quel psychologue a théorisé la Zone Proximale de Développement (ZPD) ?',
        options_ar: ['جان بياجيه', 'ليف فيغوتسكي', 'بورهوس سكينر', 'إيفان بافلوف'],
        options_fr: ['Jean Piaget', 'Lev Vygotski', 'B.F. Skinner', 'Ivan Pavlov'],
        correct_index: 1,
        explanation_ar: 'ليف فيغوتسكي هو مؤسس السوسيو-بنائية وصاحب مفهوم المنطقة القريبة للنمو.',
        explanation_speech_ar: 'لِيفْ فِيغُوتْسْكِي هُوَ مُؤَسِّسُ السُّوسْيُو بِنَائِيَّةِ وَصَاحِبُ مَفْهُومِ الْمِنْطَقَةِ الْقَرِيبَةِ لِلنُّمُوِّ.',
        explanation_fr: 'Lev Vygotski a développé le concept de ZPD dans le cadre du socioconstructivisme.',
      },
    ],
  },
  {
    subject_slug: 'evaluation-measurement',
    track: 'all',
    level: 'advanced',
    title_ar: 'أنواع التقويم التربوي ومعالجة التعثرات (الدعم البيداغوجي)',
    title_fr: "Types d'évaluation pédagogique et remédiation",
    summary_ar: 'التقويم التشخيصي، التكويني، والإجمالي، وبناء شبكة التحقق، وخطة المعالجة البيداغوجية.',
    summary_fr: 'Évaluations diagnostique, formative et sommative, critères de correction et dispositifs de remédiation.',
    explanation_ar:
      'يؤدي التقويم التربوي ثلاث وظائف رئيسية حسب توقيته: التقويم التشخيصي في بداية السنة أو الدرس لرصد المكتسبات القبلية، والتقويم التكويني أثناء التعلم لتعديل المسار الفوري وتوجيه الدعم، والتقويم الإجمالي أو الإشهادي في نهاية المرحلة لقياس تحقق الكفايات وإصدار القرار.',
    explanation_speech_ar:
      'يُؤَدِّي التَّقْوِيمُ التَّرْبَوِيُّ ثَلَاثَ وَظَائِفَ رَئِيسِيَّةٍ: التَّقْوِيمُ التَّشْخِيصِيُّ فِي الْبِدَايَةِ، وَالتَّقْوِيمُ التَّكْوِينِيُّ أَثْنَاءَ التَّعَلُّمِ، وَالتَّقْوِيمُ الْإِجْمَالِيُّ فِي النِّهَايَةِ.',
    explanation_fr:
      "L'évaluation remplit trois fonctions : diagnostique (en début d'apprentissage), formative (en cours de processus pour réguler) et sommative/certificative (en fin de séquence pour attester des acquis).",
    examples: [
      {
        title_ar: 'استثمار أخطاء التلاميذ في التقويم التكويني',
        title_fr: "Exploitation de l'erreur en évaluation formative",
        content_ar: 'بدل الاكتفاء بوضع علامة، يصنف المعلم الأخطاء (أخطاء فهم التعليمة، أخطاء منهجية، أخطاء حسابية) لبناء مجموعات دعم هادفة.',
        content_fr: "L'enseignant classe les erreurs (compréhension, procédure, calcul) pour organiser une remédiation ciblée.",
      },
    ],
    exercises: [
      {
        prompt_ar: 'صمم خطة معالجة بيداغوجية من 3 مراحل لتلاميذ تعثروا في الطرح بالاستلاف.',
        prompt_fr: 'Concevez un plan de remédiation en 3 étapes pour la soustraction avec retenue.',
        solution_ar: '1) تشخيص نوع الخطأ؛ 2) العودة إلى التمثيل الملموس بالعشرات والآحاد؛ 3) تمارين متدرجة ومراجعة فردية.',
        solution_fr: '1) Diagnostic du type d’erreur ; 2) Manipulation concrète des dizaines/unités ; 3) Exercices gradués.',
      },
    ],
    mcq: [
      {
        stem_ar: 'أي نوع من التقويم يهدف أساساً إلى تعديل مسار التدريس أثناء الحصة؟',
        stem_speech_ar: 'أَيُّ نَوْعٍ مِنَ التَّقْوِيمِ يَهْدِفُ أَسَاساً إِلَى تَعْدِيلِ مَسَارِ التَّدْرِيسِ أَثْنَاءَ الْحِصَّةِ؟',
        stem_fr: "Quel type d'évaluation vise principalement à réguler l'enseignement en cours d'apprentissage ?",
        options_ar: ['التقويم التكويني', 'التقويم الإشهادي', 'التقويم النهائي', 'الترتيب التنافسي'],
        options_fr: ['Évaluation formative', 'Évaluation certificative', 'Évaluation finale', 'Classement normatif'],
        correct_index: 0,
        explanation_ar: 'التقويم التكويني يرافق سيرورة التعلم لتقديم التغذية الراجعة والمعالجة الفورية.',
        explanation_speech_ar: 'التَّقْوِيمُ التَّكْوِينِيُّ يُرَافِقُ سَيْرُورَةَ التَّعَلُّمِ لِتَقْدِيمِ التَّغْذِيَةِ الرَّاجِعَةِ.',
        explanation_fr: "L'évaluation formative accompagne le processus pour ajuster l'enseignement et aider l'élève.",
      },
    ],
  },
  {
    subject_slug: 'islamic-education',
    track: 'arabic',
    level: 'foundation',
    title_ar: 'مقاصد الشريعة وأصول تدريس التربية الإسلامية في المرحلة الابتدائية',
    title_fr: "Fondements de l'éducation islamique et méthodologie d'enseignement",
    summary_ar: 'الكليات الخمس في مقاصد الشريعة ومنهجية تدريس القرآن الكريم والعقيدة والعبادات للتلاميذ.',
    summary_fr: 'Les cinq finalités de la Charia et la didactique du Coran, de la foi et des pratiques cultuelles.',
    explanation_ar:
      'تهدف التربية الإسلامية في المدرسة الابتدائية إلى ترسيخ القيم الإيمانية والأخلاقية وربط العبادة بالسلوك القويم. وتقوم مقاصد الشريعة على حفظ الضروريات الخمس: الدين، والنفس، والعقل، والنسل، والمال. وفي تدريس القرآن الكريم يبدأ المعلم بالتهيئة، ثم التلاوة النموذجية، فالترديد والمحاكاة، ثم شرح المفردات واستخلاص القيم.',
    explanation_speech_ar:
      'تَهْدِفُ التَّرْبِيَةُ الْإِسْلَامِيَّةُ إِلَى تَرْسِيخِ الْقِيَمِ الْإِيمَانِيَّةِ وَالْأَخْلَاقِيَّةِ. وَتَقُومُ مَقَاصِدُ الشَّرِيعَةِ عَلَى حِفْظِ الضَّرُورِيَّاتِ الْخَمْسِ: الدِّينِ، وَالنَّفْسِ، وَالْعَقْلِ، وَالنَّسْلِ، وَالْمَالِ.',
    explanation_fr:
      "L'éducation islamique vise l'enracinement des valeurs spirituelles et morales. Les cinq finalités essentielles sont la préservation de la religion, de la vie, de la raison, de la descendance et des biens.",
    examples: [
      {
        title_ar: 'مراحل حصة السورة القرآنية',
        title_fr: "Étapes d'une séance de sourate coranique",
        content_ar: 'التسميع التمهيدي -> قراءة نموذجية مجودة من المعلم -> قراءات فردية مصححة -> استخلاص المعنى الإجمالي والقيمة التربوية.',
        content_fr: 'Rappel -> Lecture modèle -> Lectures individuelles corrigées -> Sens global et valeur morale.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'اذكر الفرق بين الفرض العين والفرض الكفائي مع مثال لكل منهما.',
        prompt_fr: 'Distinguez obligation individuelle (Fard Ayn) et collective (Fard Kifaya) avec un exemple.',
        solution_ar: 'فرض العين مطلوب من كل مكلف بعينه كالصلوات الخمس، وفرض الكفاية إذا قام به البعض سقط عن الباقين كصلاة الجنازة.',
        solution_fr: 'Fard Ayn concerne chaque individu (ex: les 5 prières) ; Fard Kifaya incombe à la communauté (ex: prière funéraire).',
      },
    ],
    mcq: [
      {
        stem_ar: 'ما عدد الضروريات الخمس في مقاصد الشريعة الإسلامية؟',
        stem_speech_ar: 'مَا الضَّرُورِيَّاتُ الْخَمْسُ فِي مَقَاصِدِ الشَّرِيعَةِ الْإِسْلَامِيَّةِ؟',
        stem_fr: 'Lequel de ces éléments ne fait PAS partie des 5 finalités nécessaires (Daruriyyat) ?',
        options_ar: ['حفظ الدين والنفس والعقل والنسل والمال', 'حفظ التجارة فقط', 'حفظ العادات والتقاليد', 'حفظ الألقاب'],
        options_fr: ['Religion, vie, raison, descendance, biens', 'Commerce uniquement', 'Coutumes locales', 'Titres honorifiques'],
        correct_index: 0,
        explanation_ar: 'الضروريات الخمس هي: الدين، النفس، العقل، النسل، والمال.',
        explanation_speech_ar: 'الضَّرُورِيَّاتُ الْخَمْسُ هِيَ: الدِّينُ، وَالنَّفْسُ، وَالْعَقْلُ، وَالنَّسْلُ، وَالْمَالُ.',
        explanation_fr: 'Les cinq finalités sont : la religion, la vie, la raison, la descendance et les biens.',
      },
    ],
  },
  {
    subject_slug: 'natural-sciences',
    track: 'bilingual',
    level: 'intermediate',
    title_ar: 'المنهج التجريبي ووظائف التغذية والتنفس في العلوم الطبيعية',
    title_fr: 'La démarche expérimentale et les fonctions de nutrition et respiration',
    summary_ar: 'خطوات المنهج التجريبي (OHERIC) وتطبيقاتها في تدريس العلوم الطبيعية بالابتدائي.',
    summary_fr: "Les étapes de la démarche d'investigation scientifique et la physiologie de base.",
    explanation_ar:
      'يعتمد تدريس العلوم الطبيعية على منهج التقصي التجريبي الذي ينطلق من الملاحظة وصياغة التساؤل، ثم اقتراح الفرضيات، فالتجريب أو الملاحظة الموجهة لاختبار الفرضيات، ثم استخلاص النتائج وتعميمها. وفي جسم الإنسان يتحول الغذاء عبر الهضم الميكانيكي والكيميائي إلى مغذيات تمتصها الخملات المعوية، بينما يؤمن التنفس الخلوي إنتاج الطاقة.',
    explanation_speech_ar:
      'يَعْتَمِدُ تَدْرِيسُ الْعُلُومِ الطَّبِيعِيَّةِ عَلَى مَنْهَجِ التَّقَصِّي التَّجْرِيبِيِّ الَّذِي يَنْطَلِقُ مِنَ الْمُلَاحَظَةِ، ثُمَّ صِيَاغَةِ التَّسَاؤُلِ، فَاقْتِرَاحِ الْفَرَضِيَّاتِ، فَالتَّجْرِيبِ، فَاسْتِخْلَاصِ النَّتَائِجِ.',
    explanation_fr:
      "La démarche expérimentale suit : Observation, Problématisation, Hypothèse, Expérimentation, Résultats, Interprétation et Conclusion. En biologie, la digestion transforme les aliments en nutriments absorbés au niveau de l'intestin grêle.",
    examples: [
      {
        title_ar: 'نشاط علمي: إثبات حاجة النبات للضوء',
        title_fr: 'Activité : Mettre en évidence le besoin de lumière chez la plante',
        content_ar: 'وضع نبتة في الضوء وأخرى متماثلة في الظلام مع تساوي السقي والتربة (تغيير متغير واحد فقط).',
        content_fr: 'Placer deux plantes identiques, l’une à la lumière et l’autre à l’obscurité, en gardant les autres facteurs constants.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'رتب خطوات المنهج التجريبي التالية: (التجريب، الفرضية، الملاحظة، الاستنتاج).',
        prompt_fr: 'Ordonnez ces étapes : Expérimentation, Hypothèse, Observation, Conclusion.',
        solution_ar: 'الملاحظة -> الفرضية -> التجريب -> الاستنتاج.',
        solution_fr: 'Observation -> Hypothèse -> Expérimentation -> Conclusion.',
      },
    ],
    mcq: [
      {
        stem_ar: 'أين يتم امتصاص المغذيات الناتجة عن عملية الهضم بشكل رئيسي؟',
        stem_speech_ar: 'أَيْنَ يَتِمُّ امْتِصَاصُ الْمُغَذِّيَاتِ النَّاتِجَةِ عَنْ عَمَلِيَّةِ الْهَضْمِ بِشَكْلٍ رَئِيسِيٍّ؟',
        stem_fr: "Où s'effectue principalement l'absorption des nutriments issus de la digestion ?",
        options_ar: ['في المعدة', 'في المعي الدقيق', 'في المريء', 'في الفم'],
        options_fr: ["Dans l'estomac", "Dans l'intestin grêle", "Dans l'œsophage", 'Dans la bouche'],
        correct_index: 1,
        explanation_ar: 'يتم الامتصاص المعوي للمغذيات على مستوى المعي الدقيق عبر الخملات المعوية.',
        explanation_speech_ar: 'يَتِمُّ الِامْتِصَاصُ الْمَعَوِيُّ لِلْمُغَذِّيَاتِ عَلَى مُسْتَوَى الْمَعْيِ الدَّقِيقِ.',
        explanation_fr: "L'absorption intestinale se produit dans l'intestin grêle grâce aux villosités.",
      },
    ],
  },
  {
    subject_slug: 'classroom-management',
    track: 'all',
    level: 'intermediate',
    title_ar: 'إدارة القسم وتدبير الأقسام متعددة المستويات في الوسط الريفي',
    title_fr: 'Gestion de classe et pilotage des classes multigrades',
    summary_ar: 'تقنيات ضبط الصف، تدبير الزمن المدرسي، وتنظيم العمل في الأقسام المشتركة بفاعلية.',
    summary_fr: 'Techniques de gestion disciplinaire positive, gestion du temps et organisation des classes multigrades.',
    explanation_ar:
      'تشمل إدارة القسم تنظيم الفضاء المادي، إرساء ميثاق القسم بتشاور مع التلاميذ، تدبير التفاعلات الصفية، والوقاية من السلوكات المعرقلة. في موريتانيا تكتسي إدارة القسم متعدد المستويات أهمية بالغة، حيث يوفق المعلم بين التعلم الذاتي الموجه لمستوى والتعلم المباشر للمستوى الآخر عبر جذاذات متزامنة.',
    explanation_speech_ar:
      'تَشْمَلُ إِدَارَةُ الْقِسْمِ تَنْظِيمَ الْفَضَاءِ الْمَادِّيِّ، وَإِرْسَاءَ مِيثَاقِ الْقِسْمِ، وَتَدْبِيرَ التَّفَاعُلَاتِ الصَّفِّيَّةِ، وَخَاصَّةً فِي الْأَقْسَامِ مُتَعَدِّدَةِ الْمُسْتَوَيَاتِ.',
    explanation_fr:
      "La gestion de classe englobe l'aménagement spatial, la charte de classe, la régulation des comportements et, en contexte multigrade, l'alternance entre travail dirigé et travail autonome.",
    examples: [
      {
        title_ar: 'تدبير قسم مشترك (السنة 3 والسنة 4)',
        title_fr: 'Gestion d’une classe double niveau (3e et 4e AF)',
        content_ar: 'بينما يقدم المعلم درساً جديداً للسنة 3، يشتغل تلاميذ السنة 4 على تمرين تطبيقي في دفترهم ثم يتبادلان الأدوار.',
        content_fr: 'Pendant que la 3e AF suit une leçon dirigée, la 4e AF réalise un exercice en autonomie.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'اقترح ثلاث قواعد إيجابية لصياغة ميثاق القسم مع تلاميذ الابتدائي.',
        prompt_fr: 'Proposez 3 règles positives pour rédiger une charte de classe.',
        solution_ar: '1) أرفع يدي قبل الكلام؛ 2) أحترم رأي زميلي؛ 3) أحافظ على نظافة قسمي وأدواتي.',
        solution_fr: '1) Je lève la main pour parler ; 2) J’écoute mes camarades ; 3) Je respecte le matériel.',
      },
    ],
    mcq: [
      {
        stem_ar: 'ما المبدأ الأساسي في تدبير قسم متعدد المستويات بنجاح؟',
        stem_speech_ar: 'مَا الْمَبْدَأُ الْأَسَاسِيُّ فِي تَدْبِيرِ قِسْمٍ مُتَعَدِّدِ الْمُسْتَوَيَاتِ بِنَجَاحٍ؟',
        stem_fr: 'Quel principe est clé pour réussir dans une classe multigrade ?',
        options_ar: [
          'المناوبة المخططة بين العمل الموجه والاستقلالي',
          'إلغاء تدريس أحد المستويين',
          'تقديم نفس الدرس الحرفي للجميع دون تمييز',
          'ترك التلاميذ دون مهام',
        ],
        options_fr: [
          'Alternance planifiée entre travail dirigé et travail autonome',
          "Supprimer les cours d'un niveau",
          'Donner exactement le même cours sans différenciation',
          'Laisser les élèves sans consignes',
        ],
        correct_index: 0,
        explanation_ar: 'نجاح القسم المشترك يعتمد على التناوب المحكم بين أنشطة التعلم المباشر وأنشطة التعلم الذاتي.',
        explanation_speech_ar: 'نَجَاحُ الْقِسْمِ الْمُشْتَرَكِ يَعْتَمِدُ عَلَى التَّنَاوُبِ الْمُحْكَمِ بَيْنَ التَّعَلُّمِ الْمُبَاشِرِ وَالتَّعَلُّمِ الذَّاتِيِّ.',
        explanation_fr: "La réussite en multigrade repose sur l'alternance structurée entre apprentissage dirigé et autonomie.",
      },
    ],
  },
  {
    subject_slug: 'educational-planning',
    track: 'all',
    level: 'foundation',
    title_ar: 'إعداد الجذاذة التربوية وصياغة الأهداف الإجرائية',
    title_fr: "Élaboration de la fiche pédagogique et formulation d'objectifs opérationnels",
    summary_ar: 'مكونات الجذاذة البيداغوجية، معايير الهدف الإجرائي (قابل للملاحظة والقياس)، والتخطيط الزمني للحصة.',
    summary_fr: 'Composantes de la fiche pédagogique, critères SMART d’un objectif opérationnel et gestion du temps de séance.',
    explanation_ar:
      'الجذاذة التربوية هي السيناريو المسبق الذي يعده المعلم لضمان سير الحصة بنجاعة. تتضمن: الترويسة (المادة، المستوى، العنوان، المدة)، الأهداف التعلمية، الوسائل الديداكتيكية، والمراحل التنفيذية (التمهيد، البناء، التطبيق، التقويم). يُصاغ الهدف الإجرائي بصيغة: أن + فعل سلوكي قابل للملاحظة والقياس + التلميذ + المحتوى + شرط الإنجاز.',
    explanation_speech_ar:
      'الْجُذَاذَةُ التَّرْبَوِيَّةُ هِيَ السِّينَارْيُو الْمُسْبَقُ الَّذِي يُعِدُّهُ الْمُعَلِّمُ لِضَمَانِ سَيْرِ الْحِصَّةِ بِنَجَاعَةٍ. وَيُصَاغُ الْهَدَفُ الْإِجْرَائِيُّ بِفِعْلٍ سُلُوكِيٍّ قَابِلٍ لِلْمُلَاحَظَةِ وَالْقِيَاسِ.',
    explanation_fr:
      "La fiche pédagogique est l'outil de préparation de la séance. Un objectif opérationnel comporte un verbe d'action observable et mesurable, le sujet apprenant, le contenu et les conditions de réalisation.",
    examples: [
      {
        title_ar: 'مقارنة هدف غامض بهدف إجرائي دقيق',
        title_fr: 'Objectif vague vs objectif opérationnel',
        content_ar: 'خطأ: أن يفهم التلميذ الجمع. صواب: أن يحسب التلميذ مجموع عددين من رقمين دون خطأ في 5 دقائق.',
        content_fr: 'Incorrect : comprendre l’addition. Correct : calculer la somme de deux nombres à deux chiffres sans erreur en 5 min.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'حول الهدف التالي إلى هدف إجرائي قابل للقياس: (أن يعرف التلميذ الفاعل).',
        prompt_fr: "Transformez en objectif opérationnel : « connaître le sujet de la phrase ».",
        solution_ar: 'أن يستخرج التلميذ الفاعل من ثلاث جمل فعلية ويعربه إعراباً صحيحاً.',
        solution_fr: 'Identifier et souligner le sujet dans trois phrases simples sans erreur.',
      },
    ],
    mcq: [
      {
        stem_ar: 'أي من الأفعال الآتية يصلح لصياغة هدف إجرائي قابل للقياس؟',
        stem_speech_ar: 'أَيٌّ مِنَ الْأَفْعَالِ الْآتِيَةِ يَصْلُحُ لِصِيَاغَةِ هَدَفٍ إِجْرَائِيٍّ قَابِلٍ لِلْقِيَاسِ؟',
        stem_fr: "Lequel de ces verbes convient à la formulation d'un objectif opérationnel mesurable ?",
        options_ar: ['يُصنّف', 'يفهم', 'يعرف', 'يُدرك'],
        options_fr: ['Classer', 'Comprendre', 'Connaître', 'Saisir'],
        correct_index: 0,
        explanation_ar: 'الفعل (يصنف) سلوك ملاحظ وقابل للقياس، بينما (يفهم ويعرف ويدرك) أفعال ذهنية غير مباشرة.',
        explanation_speech_ar: 'الْفِعْلُ يُصَنِّفُ سُلُوكٌ مُلَاحَظٌ وَقَابِلٌ لِلْقِيَاسِ.',
        explanation_fr: 'Le verbe « classer » désigne une action observable et évaluable.',
      },
    ],
  },
  {
    subject_slug: 'teaching-methods',
    track: 'all',
    level: 'advanced',
    title_ar: 'البيداغوجيا الفارقية وتنويع طرائق التدريس النشط',
    title_fr: 'Pédagogie différenciée et méthodes d’enseignement actif',
    summary_ar: 'تكييف المضامين والطرائق والأدوات مع الفروق الفردية للمتعلمين داخل القسم الدراسي.',
    summary_fr: "Adapter les contenus, les processus et les productions aux différences individuelles des apprenants.",
    explanation_ar:
      'تقوم البيداغوجيا الفارقية على الإقرار بوجود فروق فردية بين المتعلمين في الإيقاع والذكاءات وأساليب التعلم. يمكن التفريق على مستوى المضامين، أو سيرورات التعلم والوسائل، أو المنتوج المطلوب، أو تنظيم المجموعات، مع الحفاظ على بلوغ نفس الكفايات الأساسية.',
    explanation_speech_ar:
      'تَقُومُ الْبِيدَاغُوجْيَا الْفَارِقِيَّةُ عَلَى الْإِقْرَارِ بِوُجُودِ فُرُوقٍ فَرْدِيَّةٍ بَيْنَ الْمُتَعَلِّمِينَ فِي الْإِيقَاعِ وَالذَّكَاءَاتِ وَأَسَالِيبِ التَّعَلُّمِ.',
    explanation_fr:
      'La pédagogie différenciée adapte les situations d’apprentissage aux rythmes et profils des élèves tout en maintenant des objectifs communs exigeants.',
    examples: [
      {
        title_ar: 'التفريق في المسار (Processus)',
        title_fr: 'Différenciation des processus',
        content_ar: 'إتاحة بطاقات إرشادية أو وسائل حسية للمتعثرين بينما يعمل المتفوقون على مهام إثرائية مفتوحة.',
        content_fr: 'Fournir des fiches-guides aux élèves en difficulté et des tâches d’approfondissement aux plus avancés.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'اذكر ثلاثة مداخل لتطبيق البيداغوجيا الفارقية في حصة القراءة.',
        prompt_fr: 'Citez trois leviers pour différencier une séance de lecture.',
        solution_ar: '1) تنويع طول النص؛ 2) تدرج أسئلة الفهم؛ 3) مجموعات القراءة التشاركية.',
        solution_fr: '1) Longueur du texte ; 2) Degré de guidage des questions ; 3) Groupes de besoin.',
      },
    ],
    mcq: [
      {
        stem_ar: 'ما الهدف الرئيسي من البيداغوجيا الفارقية؟',
        stem_speech_ar: 'مَا الْهَدَفُ الرَّئِيسِيُّ مِنَ الْبِيدَاغُوجْيَا الْفَارِقِيَّةِ؟',
        stem_fr: 'Quel est l’objectif principal de la pédagogie différenciée ?',
        options_ar: [
          'مراعاة الفروق الفردية لتحقيق تكافؤ الفرص والنجاح للجميع',
          'تصنيف التلاميذ وإقصاء المتعثرين',
          'توحيد وتيرة واحدة قسرية للجميع',
          'الاستغناء عن التقويم',
        ],
        options_fr: [
          'Prendre en compte les différences pour mener chacun vers la réussite',
          'Exclure les élèves en difficulté',
          'Imposer un rythme unique rigide',
          'Supprimer toute évaluation',
        ],
        correct_index: 0,
        explanation_ar: 'تسعى البيداغوجيا الفارقية إلى منح كل متعلم المسار الملائم لبلوغ الكفايات المطلوبة.',
        explanation_speech_ar: 'تَسْعَى الْبِيدَاغُوجْيَا الْفَارِقِيَّةُ إِلَى مَنْحِ كُلِّ مُتَعَلِّمٍ الْمَسَارَ الْمُلَائِمَ لِبُلُوغِ الْكِفَايَاتِ.',
        explanation_fr: 'Elle vise la réussite de tous en adaptant les parcours aux besoins de chacun.',
      },
    ],
  },
  {
    subject_slug: 'general-culture',
    track: 'all',
    level: 'foundation',
    title_ar: 'المنظومة التربوية الموريتانية والقانون التوجيهي للتعليم',
    title_fr: "Le système éducatif mauritanien et la loi d'orientation",
    summary_ar: 'هيكلة التعليم الأساسي والثانوي في موريتانيا، المدرسة الجمهورية، وتاريخ إصلاحات التعليم الوطنية.',
    summary_fr: 'Structure de l’enseignement fondamental et secondaire en Mauritanie et principes de l’École Républicaine.',
    explanation_ar:
      'يتكون التعليم في موريتانيا من التعليم الأساسي (6 سنوات من السنة الأولى إلى السادسة تتوج بمسابقة دخول السنة الأولى إعدادي)، يليه التعليم الثانوي بمرحلتيه الإعدادية والتأهيلية. كما يؤكد القانون التوجيهي للتعليم والمدرسة الجمهورية على مجانية وإلزامية التعليم الأساسي وتوحيد التنشئة الوطنية في السنوات الأولى.',
    explanation_speech_ar:
      'يَتَكَوَّنُ التَّعْلِيمُ فِي مُورِيتَانْيَا مِنَ التَّعْلِيمِ الْأَسَاسِيِّ، وَمُدَّتُهُ سِتُّ سَنَوَاتٍ، يَلِيهِ التَّعْلِيمُ الثَّانَوِيُّ بِمَرْحَلَتَيْهِ الْإِعْدَادِيَّةِ وَالتَّأْهِيلِيَّةِ.',
    explanation_fr:
      "Le système éducatif mauritanien comprend l'enseignement fondamental (6 ans), suivi du secondaire (collège et lycée). La loi d'orientation de l'École Républicaine consacre l'obligation et la gratuité du fondamental.",
    examples: [
      {
        title_ar: 'مسابقة دخول الإعدادية (Concours d’entrée en 1ère AS)',
        title_fr: 'Concours d’entrée au collège',
        content_ar: 'تُختتم السنة السادسة ابتدائي بامتحان وطني يقيس كفايات التلميذ في اللغات والرياضيات والعلوم والتربية.',
        content_fr: 'La 6e année fondamentale est sanctionnée par le concours national d’entrée en 1ère AS.',
      },
    ],
    exercises: [
      {
        prompt_ar: 'اذكر ثلاث مهام أساسية لمدارس تكوين المعلمين (ENI) في موريتانيا.',
        prompt_fr: 'Citez trois missions des Écoles Normales d’Instituteurs (ENI) en Mauritanie.',
        solution_ar: 'التكوين الأساسي للمعلمين، التكوين المستمر، والبحث التربوي التطبيقي.',
        solution_fr: 'Formation initiale des instituteurs, formation continue et recherche pédagogique appliquée.',
      },
    ],
    mcq: [
      {
        stem_ar: 'كم تبلغ مدة الدراسة في مرحلة التعليم الأساسي (الابتدائي) في موريتانيا؟',
        stem_speech_ar: 'كَمْ تَبْلُغُ مُدَّةُ الدِّرَاسَةِ فِي مَرْحَلَةِ التَّعْلِيمِ الْأَسَاسِيِّ فِي مُورِيتَانْيَا؟',
        stem_fr: "Quelle est la durée du cycle de l'enseignement fondamental en Mauritanie ?",
        options_ar: ['5 سنوات', '6 سنوات', '7 سنوات', '4 سنوات'],
        options_fr: ['5 ans', '6 ans', '7 ans', '4 ans'],
        correct_index: 1,
        explanation_ar: 'يمتد التعليم الأساسي في موريتانيا لست سنوات (من السنة الأولى إلى السنة السادسة).',
        explanation_speech_ar: 'يَمْتَدُّ التَّعْلِيمُ الْأَسَاسِيُّ فِي مُورِيتَانْيَا لِسِتِّ سَنَوَاتٍ.',
        explanation_fr: "L'enseignement fondamental dure 6 années en Mauritanie.",
      },
    ],
  },
];

export const SEED_SUMMARIES = [
  {
    subject_slug: 'arabic-lang',
    track: 'arabic',
    level: 'foundation',
    title_ar: 'ملخص شامل لقواعد النحو والإعراب للمبتدئين',
    title_fr: 'Résumé complet de grammaire arabe et déclinaisons',
    content_ar: 'خلاصة مركزة لعلامات الإعراب الأصلية والفرعية، كان وأخواتها، إن وأخواتها، والمفاعيل الخمسة.',
    content_speech_ar: 'خُلَاصَةٌ مُرَكَّزَةٌ لِعَلَامَاتِ الْإِعْرَابِ الْأَصْلِيَّةِ وَالْفَرْعِيَّةِ وَالنَّوَاسِخِ وَالْمَفَاعِيلِ.',
    content_fr: 'Synthèse des marques casuelles, auxiliaires (Kana/Inna) et compléments.',
    key_points: [
      { ar: 'المبتدأ والخبر مرفوعان؛ ترفع كان المبتدأ وتنصب الخبر.', fr: 'Kana laisse le sujet au nominatif et met le prédicat à l’accusatif.' },
      { ar: 'إن وأخواتها تنصب الاسم وترفع الخبر.', fr: 'Inna met le sujet à l’accusatif et le prédicat au nominatif.' },
      { ar: 'الممنوع من الصرف يجر بالفتحة نيابة عن الكسرة ما لم يُعرّف أو يُضف.', fr: 'Le diptote prend la fatha au génitif sauf s’il est défini.' },
    ],
  },
  {
    subject_slug: 'education-sciences',
    track: 'all',
    level: 'intermediate',
    title_ar: 'ملخص المرجعيات البيداغوجية ونظريات التعلم',
    title_fr: 'Fiche de synthèse : pédagogies et théories de l’apprentissage',
    content_ar: 'مقارنة سريعة بين المقاربة بالمضامين والأهداف والكفايات، وأبرز رواد علم النفس التربوي.',
    content_speech_ar: 'مُقَارَنَةٌ سَرِيعَةٌ بَيْنَ الْمُقَارَبَةِ بِالْمَضَامِينِ وَالْأَهْدَافِ وَالْكِفَايَاتِ.',
    content_fr: 'Comparatif rapide entre PPO et APC et grands théoriciens.',
    key_points: [
      { ar: 'بياجيه: التعلم يتم عبر الاستيعاب والمواءمة والتوازن.', fr: 'Piaget : assimilation, accommodation, équilibration.' },
      { ar: 'فيغوتسكي: المنطقة القريبة للنمو والتعلم بالتفاعل الاجتماعي.', fr: 'Vygotski : ZPD et médiation sociale.' },
      { ar: 'بلوم: صنافة الأهداف المعرفية (تذكر، فهم، تطبيق، تحليل، تركيب، تقويم).', fr: 'Bloom : taxonomie cognitive en 6 niveaux.' },
    ],
  },
  {
    subject_slug: 'mathematics',
    track: 'bilingual',
    level: 'foundation',
    title_ar: 'ملخص قوانين الهندسة والمساحات والحجوم والحساب',
    title_fr: 'Formulaire de géométrie, aires, volumes et arithmétique',
    content_ar: 'جميع القوانين الهندسية الأساسية وحساب النسب المئوية والكسور والسرعة والمسافة.',
    content_speech_ar: 'جَمِيعُ الْقَوَانِينِ الْهَنْدَسِيَّةِ الْأَسَاسِيَّةِ وَحِسَابُ النِّسَبِ الْمِئَوِيَّةِ.',
    content_fr: 'Toutes les formules essentielles d’aires, périmètres, volumes et pourcentages.',
    key_points: [
      { ar: 'مساحة المثلث = (القاعدة × الارتفاع) ÷ 2.', fr: 'Aire du triangle = (base × hauteur) / 2.' },
      { ar: 'مساحة الدائرة = π × نق² والمحيط = 2 × π × نق.', fr: 'Aire disque = π × r² et périmètre = 2 × π × r.' },
      { ar: 'حجم متوازي المستطيلات = الطول × العرض × الارتفاع.', fr: 'Volume pavé droit = L × l × h.' },
    ],
  },
  {
    subject_slug: 'french-lang',
    track: 'french',
    level: 'intermediate',
    title_ar: 'ملخص أزمنة الأفعال والتوافق في الفرنسية',
    title_fr: 'Synthèse des temps verbaux et règles d’accord',
    content_ar: 'خلاصة تصريف المجموعات الثلاث، الفرق بين Passé composé و Imparfait، وقواعد توافق اسم المفعول.',
    content_speech_ar: 'خُلَاصَةُ تَصْرِيفِ الْأَفْعَالِ وَقَوَاعِدِ التَّوَافُقِ فِي اللُّغَةِ الْفَرَنْسِيَّةِ.',
    content_fr: 'Conjugaison des 3 groupes, valeurs du passé composé et de l’imparfait, accords.',
    key_points: [
      { ar: 'Imparfait للوصف والعادة في الماضي؛ Passé composé للحدث المحدود والمنتهي.', fr: 'Imparfait : description/habitude ; Passé composé : action achevée.' },
      { ar: 'اسم المفعول مع être يتطابق دائماً مع الفاعل.', fr: 'Avec être, le participe passé s’accorde avec le sujet.' },
    ],
  },
];

export const SEED_EXAM_CONFIGS = [
  {
    title_ar: 'الامتحان الرسمي المحاكي الشامل لمسابقة اكتتاب المعلمين (70 سؤالاً)',
    title_fr: 'Simulation Officielle Complète du Concours des Instituteurs (70 Questions)',
    mode: 'official_sim',
    track: 'all',
    subject_slug: 'all',
    level: 'all',
    question_count: 70,
    duration_minutes: 90,
    max_score: 20,
    require_camera_check: 1,
    is_active: 1,
  },
  {
    title_ar: 'اختبار تحديد المستوى الشامل (تشخيص الكفايات)',
    title_fr: 'Test de Positionnement et Diagnostic des Compétences',
    mode: 'placement',
    track: 'all',
    subject_slug: 'all',
    level: 'all',
    question_count: 20,
    duration_minutes: 25,
    max_score: 20,
    require_camera_check: 0,
    is_active: 1,
  },
  {
    title_ar: 'امتحان تجريبي: علوم التربية وعلم النفس والديداكتيك',
    title_fr: 'Examen Blanc : Sciences de l’Éducation et Psychologie',
    mode: 'mock',
    track: 'all',
    subject_slug: 'education-sciences',
    level: 'all',
    question_count: 10,
    duration_minutes: 15,
    max_score: 20,
    require_camera_check: 0,
    is_active: 1,
  },
  {
    title_ar: 'امتحان تجريبي: اللغة العربية وآدابها وقواعدها',
    title_fr: 'Examen Blanc : Langue Arabe',
    mode: 'mock',
    track: 'arabic',
    subject_slug: 'arabic-lang',
    level: 'all',
    question_count: 10,
    duration_minutes: 15,
    max_score: 20,
    require_camera_check: 0,
    is_active: 1,
  },
  {
    title_ar: 'امتحان تجريبي: الرياضيات والحساب والهندسة',
    title_fr: 'Examen Blanc : Mathématiques',
    mode: 'mock',
    track: 'bilingual',
    subject_slug: 'mathematics',
    level: 'all',
    question_count: 10,
    duration_minutes: 15,
    max_score: 20,
    require_camera_check: 0,
    is_active: 1,
  },
  {
    title_ar: 'امتحان تجريبي: اللغة الفرنسية وديداكتيكها',
    title_fr: 'Examen Blanc : Langue Française et Didactique',
    mode: 'mock',
    track: 'french',
    subject_slug: 'french-lang',
    level: 'all',
    question_count: 10,
    duration_minutes: 15,
    max_score: 20,
    require_camera_check: 0,
    is_active: 1,
  },
];

export const SEED_NOTIFICATIONS = [
  {
    title_ar: 'افتتاح بنك الأسئلة الرسمي المحاكي (70 سؤالاً فريداً)',
    title_fr: 'Ouverture de la simulation officielle complète (70 questions uniques)',
    body_ar: 'أصبح بإمكان المترشحين الآن اجتياز المحاكاة الكاملة لمسابقة اكتتاب المعلمين بـ 70 سؤالاً فريداً غير مكرر وتصحيح تلقائي على 20.',
    body_fr: 'Les candidats peuvent désormais passer l’examen blanc officiel de 70 questions uniques avec correction automatique sur 20.',
    type: 'exam',
  },
  {
    title_ar: 'تحديث دروس المقاربة بالكفايات والأقسام متعددة المستويات',
    title_fr: 'Mise à jour des leçons APC et classes multigrades',
    body_ar: 'تمت إضافة شروح مفصلة ونصوص صوتية مراجعة لغوياً بالعربية والفرنسية في قسم علوم التربية وإدارة القسم.',
    body_fr: 'Des explications détaillées et un audio bilingue révisé ont été ajoutés dans les modules de pédagogie.',
    type: 'info',
  },
];

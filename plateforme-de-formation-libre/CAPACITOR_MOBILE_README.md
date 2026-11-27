# تطبيق تدريبي للهاتف (Android و iPhone)

## كيف تعمل النسخ الثلاث الآن؟

| المكان | ما الذي يظهر؟ |
|---|---|
| **الموقع على الكمبيوتر** (قبل تسجيل الدخول) | الموقع التعريفي الكامل بالشريط العلوي |
| **الكمبيوتر بعد تسجيل الدخول** | واجهة التطبيق: شريط جانبي بالأدوات، وفي الأسفل زر الحساب يفتح الإعدادات وقائمة الحساب |
| **الهاتف** (المتصفح أو الإضافة إلى الشاشة الرئيسية) | تطبيق الهاتف تلقائياً، سواء فتحت الرابط الرئيسي أو `/mobile` |
| **التطبيق الأصلي** (Android / iOS) | تطبيق الهاتف نفسه، مغلف بـ Capacitor |

- الهاتف يُكتشف تلقائياً من متصفحه (انظر `src/lib/deviceMode.ts`).
- لإجبار هاتف على فتح نسخة الكمبيوتر أضف `?desktop=1` إلى الرابط، والعودة لنسخة الهاتف بـ `?desktop=0`.

---

## 1. التثبيت من المتصفح (PWA) — بديل مؤقت

### Android (Chrome)
1. افتح رابط الموقع.
2. قائمة المتصفح `⋮` ← **تثبيت التطبيق** (Install app).

### iPhone (Safari)
1. افتح الرابط في **Safari** حصراً.
2. زر **المشاركة** ← **إضافة إلى الشاشة الرئيسية**.

> هذه الطريقة تضيف أيقونة فقط؛ التطبيق الحقيقي من المتجر يحتاج الخطوات التالية.

---

## 2. بناء التطبيق الأصلي (Android و iOS)

### المتطلبات
- **Android**: Node.js + [Android Studio](https://developer.android.com/studio) (يعمل على Windows و macOS و Linux).
- **iOS**: جهاز **macOS** مع **Xcode** وحساب Apple Developer (لا يمكن بناء تطبيق iPhone على Windows).

### الخطوات (مرة واحدة)
```bash
npm install                 # أو: bun install
npx cap add android         # إنشاء مشروع Android في مجلد android/
npx cap add ios             # إنشاء مشروع iOS في مجلد ios/ (على macOS فقط)
```

### بعد كل تعديل على الكود
```bash
npm run cap:sync            # بناء الواجهة ونسخها إلى المشروعين الأصليين
npm run cap:android         # يفتح Android Studio
npm run cap:ios             # يفتح Xcode (macOS)
```

### إخراج الملف النهائي
- **Android**: من Android Studio اختر **Build ← Generate Signed App Bundle / APK** وارفع ملف `.aab` إلى **Google Play Console**.
- **iOS**: من Xcode اختر **Product ← Archive** ثم **Distribute App** لرفعه إلى **App Store Connect / TestFlight**.

### ملاحظات مهمة
- الواجهة تُحمَّل من الملفات المدمجة في التطبيق (`dist/`)، والبيانات تأتي من الخادم الإنتاجي (`https://api.tadribi.chtbqi.com`)، ويمكن تغييره عبر `VITE_API_BASE_URL` عند البناء.
- الخادم يقبل الطلبات من أصول التطبيق الأصلي (`https://localhost` و `capacitor://localhost`) في `server.ts`.
- عند تغيير أيقونة التطبيق أو اسمه، عدّل `capacitor.config.ts` ثم شغّل `npx cap sync`.

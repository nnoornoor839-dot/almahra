# اختبار قواعد Firestore محلياً

من جذر المستودع في PowerShell، بعد توفر Node.js وJava وFirebase CLI:

```powershell
Set-Location D:\almahra
npm.cmd install --prefix tests/rules --no-package-lock --ignore-scripts --no-audit --no-fund
firebase emulators:exec --only firestore --project demo-almahra-rules "node --test tests/rules"
```

إن لم يكن Firebase CLI مثبتاً، استبدل أمر التشغيل الأخير بهذا الأمر (لا يضيف CLI إلى اعتماديات الاختبار):

```powershell
npm.cmd exec --yes --package firebase-tools@14.22.0 -- firebase emulators:exec --only firestore --project demo-almahra-rules "node --test tests/rules"
```

الاختبارات تستخدم بيانات وهمية فقط، ومشروعاً ثابتاً يبدأ بـ`demo-`، ومحاكياً على `127.0.0.1:8080`. لا تحتاج تسجيل دخول. تُقرأ القواعد من `../../firestore.rules`، وتُزرع البيانات عبر `withSecurityRulesDisabled` قبل كل اختبار. لا تشغّل هذه الحزمة على محاكي يحتوي بيانات تريد الاحتفاظ بها: تُمسح بيانات المشروع التجريبي بين الحالات.

الإصداران مثبتان: `@firebase/rules-unit-testing@4.0.1` و`firebase@11.10.0`. الأول يطلب `firebase: ^11.0.0` وفق [تعريف الحزمة الرسمي](https://github.com/firebase/firebase-js-sdk/blob/%40firebase%2Frules-unit-testing%404.0.1/packages/rules-unit-testing/package.json). اعتماديات التطوير هاتان فقط، ولا يلزم ملف lock لهذا التسليم. `node_modules/` مستبعد بالفعل في `.gitignore` بالمستودع.

تشمل الحالات: إنشاء وتحديث وحذف المستويات الثلاثة، إنشاء general وموسمه الأول بدفعة واحدة، رفض دفعة مختلطة كاملة، قراءات المشرف وقائمة الطلاب في البرامج الثلاثة، رفض غير المشرف والزائر، صلاحيات users، والمجموعات القديمة والمسارات غير المعرّفة.

نتيجة جلسة الكتابة: لم يُشغّل اختبار القواعد على المحاكي؛ رُفض تثبيت الحزم وجلب CLI بخطأ npm `EACCES`. التشغيل المباشر لـ`node --test tests/rules` توقف عند `MODULE_NOT_FOUND` لاعتمادية `@firebase/rules-unit-testing`، قبل تنفيذ أي حالة قواعد. يلزم تشغيل الأمر أعلاه لدى المدير.

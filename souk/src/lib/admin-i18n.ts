/**
 * Admin UI translations. Keys are the French source strings (the admin is authored in French),
 * so adding a language = adding one more map. Missing keys fall back to French.
 */
export type AdminLang = "fr" | "ar";

const AR: Record<string, string> = {
  "(ou un": "(أو سجل", "+ Ajouter un champ": "+ إضافة حقل", "+ Ajouter un produit…": "+ إضافة منتج…", "+ Ajouter une catégorie": "+ إضافة قسم",
  "+ Ajouter une offre": "+ إضافة عرض", "+ Ajouter une option": "+ إضافة خيار", "+ Commande manuelle": "+ طلب يدوي", "+ Nouveau produit": "+ منتج جديد",
  "Accès": "الصلاحيات", "Actif": "مفعّل", "Actif (visible)": "نشط (ظاهر)", "Active": "مفعّلة", "Adresse": "العنوان", "Ajouter": "إضافة", "Ajouter :": "إضافة :",
  "Ajouter une note": "إضافة ملاحظة", "Ajoutez le domaine ci-dessous.": "أضف النطاق أدناه.", "Ajouté ✓": "تمت الإضافة ✓", "Aperçu": "معاينة",
  "Aperçu (mis à jour après enregistrement)": "معاينة (تُحدَّث بعد الحفظ)", "Appeler": "اتصال", "Archivé": "مؤرشف", "Attributs personnalisés": "خصائص مخصصة",
  "Attributs produits": "خصائص المنتجات", "Aucune commande": "لا توجد طلبات", "Avec bordure": "بإطار", "Bandeau d'annonce FR": "شريط الإعلان (فرنسي)",
  "Boutique": "المتجر", "Boutons": "الأزرار", "Brouillon": "مسودة", "CA": "رقم الأعمال", "Carte produit": "بطاقة المنتج", "Catégorie": "القسم", "Catégories": "الأقسام",
  "Chez votre registrar, créez un enregistrement": "لدى مزوّد النطاق، أنشئ سجل", "Client": "الزبون", "Clients": "الزبائن",
  "Clients ayant saisi leur numéro sans valider la commande. Appelez-les pour récupérer la vente.": "زبائن أدخلوا رقمهم دون تأكيد الطلب. اتصل بهم لاسترجاع البيع.",
  "Cliquez sur « Vérifier » (la propagation DNS peut prendre quelques heures).": "اضغط « تحقق » (قد يستغرق انتشار DNS بضع ساعات).",
  "Cmd": "طلبات", "Code": "الكود", "Colonnes de la grille (desktop)": "أعمدة الشبكة (حاسوب)", "Commandes": "الطلبات", "Commandes par jour": "الطلبات يومياً",
  "Compte": "الحساب", "Confirmateur (commandes)": "مؤكِّد (الطلبات)", "Confirmations": "التأكيدات", "Connecter votre propre domaine": "ربط نطاقك الخاص",
  "Contour": "إطار", "Couleurs": "الألوان", "Coupons": "كوبونات", "Coût d'achat (DA)": "سعر الشراء (دج)", "Créer": "إنشاء", "DA": "دج", "Date": "التاريخ",
  "Demi-largeur": "نصف العرض", "Description (FR)": "الوصف (فرنسي)", "Domaine": "النطاق", "Domaines": "النطاقات", "Domicile": "المنزل", "Domicile (DA)": "المنزل (دج)",
  "Dépensé": "المُنفق", "Email": "البريد الإلكتروني", "Enregistrer": "حفظ", "Enregistré ✓": "تم الحفظ ✓",
  "Ex : 2 pièces à 7 000 DA au lieu de 7 800 DA. Affiché comme choix sur la page produit.": "مثال: قطعتان بـ 7000 دج بدل 7800 دج. يظهر كخيار في صفحة المنتج.",
  "Expire": "ينتهي", "Expire le": "ينتهي في", "Expédition": "الشحن", "Formulaire de commande": "استمارة الطلب", "Français": "الفرنسية",
  "Générer une URL de webhook": "إنشاء رابط Webhook", "Images": "الصور", "Intégrations": "الربط والتكامل",
  "Laissez un prix vide pour désactiver ce mode de livraison dans la wilaya. Mettez 0 pour la livraison gratuite.": "اترك السعر فارغاً لتعطيل هذا النوع من التوصيل في الولاية. ضع 0 للتوصيل المجاني.",
  "Langue par défaut": "اللغة الافتراضية", "Langues": "اللغات", "Libellé": "التسمية", "Libellé FR": "التسمية (فرنسي)", "Libellé FR (ex: Pack duo)": "التسمية (فرنسي)",
  "Livraison": "التوصيل", "Livraison gratuite": "توصيل مجاني", "Livrées": "المُسلَّمة", "Magasin": "المحل", "Manager": "مدير", "Marge": "الهامش",
  "Meta access token": "رمز Meta", "Min.": "الحد الأدنى", "Min. commande": "أدنى مبلغ للطلب", "Montant": "المبلغ", "Montant (DA)": "مبلغ (دج)",
  "Mot de passe (nouveau compte)": "كلمة المرور (حساب جديد)", "Nom": "الاسم", "Nom (FR)": "الاسم (فرنسي)", "Nom ou téléphone": "الاسم أو الهاتف",
  "Note (ex: rappeler à 18h)": "ملاحظة (مثال: إعادة الاتصال على 18:00)", "Nouveau produit": "منتج جديد", "Nouvelle commande manuelle": "طلب يدوي جديد",
  "N° de suivi": "رقم التتبع", "N°, nom ou téléphone": "الرقم، الاسم أو الهاتف", "OK": "موافق", "Obligatoire": "إجباري", "Offres de quantité": "عروض الكمية",
  "Optionnel. Améliore le suivi des achats quand les bloqueurs de pub empêchent le pixel du navigateur. Les pixel IDs se règlent dans Paramètres.": "اختياري. يحسّن تتبع المشتريات عندما تمنع حاجبات الإعلانات البكسل. معرفات البكسل في الإعدادات.",
  "Options & variantes": "الخيارات والمتغيرات", "Options (une par ligne : valeur|libellé FR|libellé AR)": "الخيارات (سطر لكل خيار: القيمة|فرنسي|عربي)",
  "Page d'accueil": "الصفحة الرئيسية", "Paniers abandonnés": "السلات المتروكة", "Par produit (livrées)": "حسب المنتج (المُسلَّمة)", "Par statut": "حسب الحالة",
  "Par wilaya": "حسب الولاية", "Paramètres": "الإعدادات", "Parcours de commande": "طريقة الطلب", "Pilule": "دائري", "Pleine largeur": "عرض كامل", "Pleins": "ممتلئة",
  "Police arabe": "الخط العربي", "Police latine": "الخط اللاتيني", "Prix": "السعر", "Prix (DA)": "السعر (دج)", "Prix barré (DA)": "السعر قبل التخفيض (دج)",
  "Produit": "المنتج", "Produits": "المنتجات", "Proposer le Stop desk": "اقتراح التوصيل للمكتب", "Préréglages": "قوالب جاهزة", "Qté": "الكمية", "Quantité": "الكمية",
  "Rapports": "التقارير", "Rechercher": "بحث", "Rechercher (slug)": "بحث", "Remise": "تخفيض", "Renommez les statuts et changez leurs couleurs.": "أعد تسمية الحالات وغيّر ألوانها.",
  "Retirer": "إزالة", "Retours": "المرتجعات", "Rien pour l'instant 🎉": "لا شيء حالياً 🎉", "Rôle": "الدور", "Simple": "بسيطة", "Slogan FR": "الشعار (فرنسي)",
  "Slug (URL)": "الرابط (URL)", "Source": "المصدر", "Sous-total": "المجموع الفرعي", "Statut": "الحالة", "Statut :": "الحالة :", "Statuts de commande": "حالات الطلب",
  "Stock": "المخزون", "Stock (produits)": "المخزون (المنتجات)", "Stop desk": "مكتب التوصيل", "Stop desk (DA)": "مكتب التوصيل (دج)", "Style": "الشكل",
  "Suivant →": "التالي ←", "Suivi & appels": "المتابعة والمكالمات", "Suivi publicitaire": "تتبع الإعلانات", "Suivre le stock": "تتبع المخزون", "Supprimer": "حذف",
  "Tableau de bord": "لوحة التحكم", "Tarifs de livraison": "أسعار التوصيل", "Taux": "النسبة", "Texte sur image": "نص على الصورة", "Thème & couleurs": "المظهر والألوان",
  "Top produits": "الأكثر مبيعاً", "Top wilayas": "أكثر الولايات طلباً", "Total": "المجموع", "Tous": "الكل", "Toutes": "الكل", "Transporteur": "شركة التوصيل",
  "Transporteur par défaut": "شركة التوصيل الافتراضية", "Transporteurs": "شركات التوصيل", "Type": "النوع", "Téléphone": "الهاتف", "Utilisations max": "أقصى استعمال",
  "Utilisé": "مستعمل", "Valeur": "القيمة", "Valeurs séparées par des virgules": "قيم مفصولة بفواصل", "Variante": "المتغير", "Ventes": "المبيعات", "Visible": "ظاهر",
  "Voir dans la boutique ↗": "عرض في المتجر ↗", "Vérifier": "تحقق", "Wilaya": "الولاية", "clé (ex: taille_pied)": "المفتاح (مثال: shoe_size)", "doublon?": "مكرر؟",
  "pièces pour": "قطع بـ", "pointant vers": "يشير إلى", "récupéré": "مُسترجَع", "vers": "إلى", "À relancer": "للمتابعة", "Équipe": "الفريق",
  "Événements serveur (Conversions API)": "أحداث الخادم (Conversions API)", "الاسم (AR)": "الاسم (عربي)", "التسمية AR": "التسمية (عربي)", "الشعار AR": "الشعار (عربي)",
  "الوصف (AR)": "الوصف (عربي)", "شريط الإعلان AR": "شريط الإعلان (عربي)", "← Commandes": "→ الطلبات", "← Précédent": "→ السابق", "↗ Voir la boutique": "↗ عرض المتجر",
  "⛔ blacklist": "⛔ قائمة سوداء", "⬇ Export CSV": "⬇ تصدير CSV", "💬 WhatsApp": "💬 واتساب", "📞 Enregistrer un appel": "📞 تسجيل مكالمة", "🖨 Imprimer": "🖨 طباعة",
  // strings used from code (nav, KPIs, statuses)
  "📊 Tableau de bord": "📊 لوحة التحكم", "🧾 Commandes": "🧾 الطلبات", "📵 Paniers abandonnés": "📵 السلات المتروكة", "📦 Produits": "📦 المنتجات",
  "👥 Clients": "👥 الزبائن", "🏷️ Coupons": "🏷️ الكوبونات", "🚚 Livraison": "🚚 التوصيل", "📈 Rapports": "📈 التقارير", "🎨 Thème & couleurs": "🎨 المظهر والألوان",
  "🧱 Page d'accueil": "🧱 الصفحة الرئيسية", "📝 Formulaire de commande": "📝 استمارة الطلب", "⚙️ Paramètres": "⚙️ الإعدادات", "🔌 Intégrations": "🔌 الربط",
  "🌐 Domaines": "🌐 النطاقات", "🧑‍💼 Équipe": "🧑‍💼 الفريق", "Déconnexion": "تسجيل الخروج", "À confirmer": "في انتظار التأكيد", "Taux de confirmation": "نسبة التأكيد",
  "Taux de livraison": "نسبة التسليم", "CA livré": "رقم الأعمال المُسلَّم", "Panier moyen": "متوسط السلة", "Aujourd'hui": "اليوم", "jours": "يوم",
  "CA livré (hors livraison)": "المبيعات المُسلَّمة (دون التوصيل)", "Coût des produits": "تكلفة المنتجs", "Frais de retour": "مصاريف الإرجاع", "Bénéfice estimé": "الربح التقديري",
  "Expédier les commandes confirmées": "شحن الطلبات المؤكدة", "Envoyer au transporteur": "إرسال لشركة التوصيل", "Créer la commande": "إنشاء الطلب",
  "Historique": "السجل", "livrée(s)": "مُسلَّمة", "retour(s)": "مرتجع", "Retirer de la blacklist": "إزالة من القائمة السوداء", "⛔ Blacklister ce numéro": "⛔ حظر هذا الرقم",
  "Débloquer": "إلغاء الحظر", "Blacklister": "حظر", "Désactiver": "تعطيل", "Activer": "تفعيل", "Enregistrer & publier": "حفظ ونشر", "Publié ✓": "تم النشر ✓",
  "Commande": "الطلب", "Imprimer": "طباعة", "commande(s)": "طلب", "page": "صفحة",
};
AR["Recevez chaque nouvelle commande sur Telegram. Créez un bot avec @BotFather, puis envoyez-lui un message et récupérez votre chat ID."] = "استقبل كل طلب جديد على تيليغرام. أنشئ بوت عبر @BotFather ثم أرسل له رسالة واحصل على chat ID.";
AR["Nouvelle page"] = "صفحة جديدة";
AR["Titre (FR) ex: Politique de retour"] = "العنوان (فرنسي) مثال: Politique de retour";
Object.assign(AR, {
  "Ajouter votre premier produit": "أضف منتجك الأول", "Renseigner le téléphone et les réseaux sociaux": "أدخل الهاتف وروابط التواصل الاجتماعي",
  "Personnaliser les couleurs de la boutique": "خصّص ألوان المتجر", "Connecter le pixel Facebook ou TikTok": "اربط بكسل فيسبوك أو تيك توك",
  "Connecter un transporteur ou Telegram": "اربط شركة توصيل أو تيليغرام", "Recevoir votre première commande": "استقبل طلبك الأول", "Démarrage": "البداية",
});
AR["Action groupée…"] = "إجراء جماعي…";
AR["Appliquer à la sélection"] = "تطبيق على المحدد";
AR["Modifier la commande"] = "تعديل الطلب";
AR["Frais de livraison"] = "مصاريف التوصيل";
AR["Annuler"] = "إلغاء";
AR["Stock faible"] = "مخزون منخفض";
Object.assign(AR, { "Mes commandes": "طلباتي", "Assignée à": "مُسندة إلى", "Répartition automatique des nouvelles commandes entre les confirmateurs": "توزيع تلقائي للطلبات الجديدة على المؤكِّدين", "Activée": "مفعّلة", "Désactivée": "معطّلة" });
AR["Coût des produits"] = "تكلفة المنتجات";
AR["Attributs produits personnalisés"] = "خصائص المنتجات المخصصة";

export function makeT(lang: AdminLang) {
  return (s: string) => (lang === "ar" ? AR[s] ?? s : s);
}

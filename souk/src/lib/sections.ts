/**
 * Registry of storefront section types. Each declares editable props as FieldDefs
 * so the admin page-builder can render a form for any section automatically.
 */
import type { FieldDef } from "./forms";

const L = (ar: string, fr: string) => ({ ar, fr });
const f = (key: string, type: FieldDef["type"], label: { ar: string; fr: string }, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ key, type, label, required: false, enabled: true, width: "full", ...extra });

export const sectionTypes: Record<string, { label: { ar: string; fr: string }; fields: FieldDef[]; defaults: Record<string, unknown> }> = {
  hero: {
    label: L("واجهة رئيسية", "Bannière principale"),
    fields: [
      f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)")),
      f("subtitle_ar", "textarea", L("النص (عربي)", "Sous-titre (AR)")), f("subtitle_fr", "textarea", L("النص (فرنسي)", "Sous-titre (FR)")),
      f("image", "text", L("رابط الصورة", "URL de l'image")),
      f("cta_ar", "text", L("نص الزر (عربي)", "Bouton (AR)")), f("cta_fr", "text", L("نص الزر (فرنسي)", "Bouton (FR)")),
      f("cta_link", "text", L("رابط الزر", "Lien du bouton")),
      f("align", "select", L("المحاذاة", "Alignement"), { options: [{ value: "start", label: L("بداية", "Début") }, { value: "center", label: L("وسط", "Centre") }] }),
    ],
    defaults: { title_ar: "مرحباً بكم", title_fr: "Bienvenue", align: "center", cta_link: "/products" },
  },
  product_grid: {
    label: L("شبكة منتجات", "Grille de produits"),
    fields: [
      f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)")),
      f("category", "text", L("القسم (slug)", "Catégorie (slug)")),
      f("limit", "number", L("العدد", "Nombre"), { min: 1, max: 48 }),
    ],
    defaults: { title_ar: "منتجاتنا", title_fr: "Nos produits", limit: 8 },
  },
  categories: {
    label: L("الأقسام", "Catégories"),
    fields: [f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)"))],
    defaults: { title_ar: "تسوق حسب القسم", title_fr: "Acheter par catégorie" },
  },
  rich_text: {
    label: L("نص", "Texte"),
    fields: [f("body_ar", "textarea", L("النص (عربي)", "Texte (AR)")), f("body_fr", "textarea", L("النص (فرنسي)", "Texte (FR)"))],
    defaults: {},
  },
  trust_badges: {
    label: L("شارات الثقة", "Badges de confiance"),
    fields: [],
    defaults: {},
  },
  testimonials: {
    label: L("آراء الزبائن", "Témoignages"),
    fields: [
      f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)")),
      f("items", "textarea", L("اسم|ولاية|رأي في كل سطر", "Nom|Wilaya|Avis (une ligne par avis)")),
    ],
    defaults: { title_ar: "آراء زبائننا", title_fr: "Ils nous font confiance", items: "Amina|Alger|Produit conforme et livraison rapide 👍\nYacine|Oran|Très bonne qualité, je recommande" },
  },
  countdown: {
    label: L("عد تنازلي", "Compte à rebours"),
    fields: [
      f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)")),
      f("ends_at", "date", L("ينتهي في", "Se termine le")),
      f("hours", "number", L("أو: مدة متجددة بالساعات", "Ou : durée glissante (heures)"), { min: 1, max: 240 }),
    ],
    defaults: { title_ar: "⏰ العرض ينتهي قريباً", title_fr: "⏰ L'offre se termine bientôt", hours: 24 },
  },
  image_text: {
    label: L("صورة ونص", "Image + texte"),
    fields: [
      f("image", "text", L("رابط الصورة", "URL de l'image")),
      f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)")),
      f("body_ar", "textarea", L("النص (عربي)", "Texte (AR)")), f("body_fr", "textarea", L("النص (فرنسي)", "Texte (FR)")),
      f("reverse", "checkbox", L("الصورة على الجهة الأخرى", "Image de l'autre côté")),
    ],
    defaults: {},
  },
  video: {
    label: L("فيديو", "Vidéo"),
    fields: [f("youtube", "text", L("رابط يوتيوب", "Lien YouTube"))],
    defaults: {},
  },
  faq: {
    label: L("أسئلة شائعة", "FAQ"),
    fields: [
      f("title_ar", "text", L("العنوان (عربي)", "Titre (AR)")), f("title_fr", "text", L("العنوان (فرنسي)", "Titre (FR)")),
      f("items_ar", "textarea", L("سؤال|جواب في كل سطر (عربي)", "Question|Réponse par ligne (AR)")),
      f("items_fr", "textarea", L("سؤال|جواب في كل سطر (فرنسي)", "Question|Réponse par ligne (FR)")),
    ],
    defaults: {},
  },
};

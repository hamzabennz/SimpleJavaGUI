import { cookies } from "next/headers";
import type { Localized } from "./forms";
import type { CurrentTenant } from "./tenant";

export type Lang = "ar" | "fr";

const dict = {
  ar: {
    home: "الرئيسية", products: "المنتجات", cart: "السلة", order_now: "اطلب الآن", add_to_cart: "أضف إلى السلة",
    checkout: "إتمام الطلب", quantity: "الكمية", subtotal: "المجموع الفرعي", delivery: "التوصيل", total: "المجموع",
    home_delivery: "توصيل للمنزل", desk_delivery: "مكتب التوصيل (Stop desk)", free: "مجاني", choose: "اختر...",
    empty_cart: "سلتك فارغة", continue_shopping: "متابعة التسوق", out_of_stock: "نفذ من المخزون",
    order_received: "تم استلام طلبك", order_number: "رقم الطلب", track_order: "تتبع الطلب", search: "بحث",
    all: "الكل", required: "هذا الحقل مطلوب", invalid_phone: "رقم الهاتف غير صحيح", invalid_email: "بريد إلكتروني غير صحيح",
    invalid_option: "اختيار غير صالح", invalid_format: "صيغة غير صحيحة", not_delivered: "التوصيل غير متوفر لهذه الولاية",
    remove: "حذف", status: "الحالة", phone: "رقم الهاتف", find: "بحث", not_found: "لم يتم العثور على الطلب",
    cod: "الدفع عند الاستلام", related: "منتجات ذات صلة", sending: "جارٍ الإرسال...", coupon: "كود التخفيض", discount: "تخفيض",
    store_unavailable: "المتجر غير متاح حالياً", out_of_stock_short: "الكمية غير متوفرة", product_unavailable: "المنتج غير متوفر", blocked: "لا يمكن إتمام الطلب، اتصل بنا", too_many_requests: "محاولات كثيرة، حاول لاحقاً",
  },
  fr: {
    home: "Accueil", products: "Produits", cart: "Panier", order_now: "Commander", add_to_cart: "Ajouter au panier",
    checkout: "Finaliser la commande", quantity: "Quantité", subtotal: "Sous-total", delivery: "Livraison", total: "Total",
    home_delivery: "Livraison à domicile", desk_delivery: "Stop desk (bureau)", free: "Gratuite", choose: "Choisir...",
    empty_cart: "Votre panier est vide", continue_shopping: "Continuer vos achats", out_of_stock: "Rupture de stock",
    order_received: "Commande reçue", order_number: "N° de commande", track_order: "Suivre ma commande", search: "Rechercher",
    all: "Tous", required: "Champ obligatoire", invalid_phone: "Numéro de téléphone invalide", invalid_email: "Email invalide",
    invalid_option: "Option invalide", invalid_format: "Format invalide", not_delivered: "Livraison indisponible pour cette wilaya",
    remove: "Retirer", status: "Statut", phone: "Téléphone", find: "Rechercher", not_found: "Commande introuvable",
    cod: "Paiement à la livraison", related: "Produits similaires", sending: "Envoi...", coupon: "Code promo", discount: "Remise",
    store_unavailable: "Boutique momentanément indisponible", out_of_stock_short: "Quantité indisponible", product_unavailable: "Produit indisponible", blocked: "Commande impossible, contactez-nous", too_many_requests: "Trop de tentatives, réessayez plus tard",
  },
} as const;

export type Dict = Record<keyof (typeof dict)["ar"], string>;

export async function getLang(tenant: CurrentTenant): Promise<Lang> {
  const c = (await cookies()).get("lang")?.value as Lang | undefined;
  const enabled = tenant.config.locale.enabled;
  if (c && enabled.includes(c)) return c;
  return tenant.config.locale.default;
}

export function getDict(lang: Lang): Dict {
  return dict[lang];
}

/** Pick the right translation with fallback to any non-empty value */
export function tr(v: unknown, lang: Lang): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const o = v as Partial<Localized>;
  return o[lang] || o.ar || o.fr || o.en || "";
}

// Intencao de cupom na busca ("cupom", "cupom kabum"). Roda sem .env: `npm run test:coupon-intent`.
import { hasCouponIntent, findStoreInTerm } from "../src/lib/site/couponIntent";
const stores = [
  { slug: "kabum", label: "KaBuM!", productCount: 4412, couponCount: 8, couponsWithCode: 8 },
  { slug: "shopee", label: "Shopee", productCount: 1762, couponCount: 0, couponsWithCode: 0 },
  { slug: "balaroti", label: "BALAROTI", productCount: 0, couponCount: 2, couponsWithCode: 2 },
  { slug: "malwee", label: "Malwee", productCount: 0, couponCount: 4, couponsWithCode: 2 },
];
let fail = 0;
const check = (l: string, ok: boolean, x?: unknown) => { console.log(ok ? "ok  " : "FAIL", l, x ?? ""); if (!ok) fail++; };
check("cupom", hasCouponIntent("cupom"));
check("Cupons", hasCouponIntent("Cupons"));
check("cupom kabum", hasCouponIntent("cupom kabum"));
check("impressora de cupom tem intencao (mostra os dois)", hasCouponIntent("impressora de cupom"));
check("cupomx nao", !hasCouponIntent("cupomx"));
check("fone bluetooth nao", !hasCouponIntent("fone bluetooth"));
check("voucher", hasCouponIntent("voucher shopee"));
check("loja kabum", findStoreInTerm("cupom kabum", stores)?.slug === "kabum");
check("loja KaBuM! por rotulo", findStoreInTerm("cupons da KaBuM!", stores)?.slug === "kabum");
check("loja malwee", findStoreInTerm("cupom malwee kids", stores)?.slug === "malwee");
check("shopee sem cupom ativo -> null", findStoreInTerm("cupom shopee", stores) === null);
check("sem loja -> null", findStoreInTerm("cupom", stores) === null);
console.log(fail ? `FAIL ${fail}` : "ALL OK"); process.exit(fail ? 1 : 0);

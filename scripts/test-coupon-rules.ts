// Teste das regras de cupom contra cupons e produtos REAIS copiados do banco em 2026-09-26
// (ver FEITO.md). Roda sem .env: `npm run test:coupon-rules`.
import { parseCouponRule, describeRule, ruleMatchesProduct, estimatePriceWithCoupon, isAwinOpenEnded } from "../src/lib/site/couponRules";
import { pickCouponsForProduct } from "../src/components/site/ProductCoupons";
let fail = 0;
const check = (label: string, ok: boolean, extra?: unknown) => { console.log(ok ? "ok  " : "FAIL", label, extra !== undefined ? JSON.stringify(extra) : ""); if (!ok) fail++; };
// ---- cupons REAIS do banco (2026-09-26) ----
const K = (id: string, title: string, code: string | null, endsAt = "2027-09-26T02:59:59+00:00") => ({ id, advertiserName: "Kabum BR", platform: "kabum", title, description: title, code, urlTracking: "u", endsAt, status: "active", fetchedAt: "2026-09-25T11:25:40.052+00:00" });
const kabum = [
  K("playninja", "10% de desconto em itens da linha PlayNinja. Oferta por tempo limitado!", "PLAYNINJA10"),
  K("apple", "12% OFF em produtos Apple selecionados usando o cupom COMPREJUNTOAPPLE aproveite a oferta especial por tempo limitado", "COMPREJUNTOAPPLE", "2026-10-15T13:00:00+00:00"),
  K("jbl", "25% OFF em produtos JBL. Oferta válida até o fim do mês!", "JBL25"),
  K("asrock", "R$100 de desconto em produtos ASRock. Aproveite!", "ASROCK100"),
  K("sacy", "15% OFF em produtos da Sacy. Promoção relâmpago!", "SACY15"),
  K("vga", "8% de desconto exclusivo em produtos de VGA. Só hoje!", "VGA8"),
  K("disc50", "R$50 OFF em itens da promoção. Válido até 20/09!", "DISC50"),
  K("50yotei", "R$50 de desconto em produtos selecionados. Não perca!", "50YOTEI"),
];
const malwee = [
  { id: "m1", advertiserName: "Malwee", platform: "lomadee", title: "Dia das crianças Malwee Em compras acima de R$ 499 Ganhe uma mini câmera", description: null, code: null, urlTracking: "u", endsAt: "2026-10-13T02:30:00+00:00", status: "active", fetchedAt: "2026-09-25T11:28:54.672+00:00" },
  { id: "m2", advertiserName: "Malwee", platform: "lomadee", title: "Malwee Active com 20% OFF na compra de 2 Peças", description: null, code: "ACTIVE20", urlTracking: "u", endsAt: "2026-09-28T02:30:00+00:00", status: "active", fetchedAt: "2026-09-24T11:29:06.633+00:00" },
];
// ---- produtos REAIS do banco ----
const cases: Array<[string, string, number, string, string[], number | null]> = [
  // [caso, nome real, preço real, loja, cupons esperados na ordem, preço estimado do primeiro]
  ["JBL PartyBox (elegível por marca)", "Caixa de Som Torre JBL PartyBox Ultimate, Bluetooth, LED, 1100W, IPX4, Dolby Atmos, Preto - JBLPARTYBOXULTBR", 9399.9, "kabum", ["jbl", "disc50", "50yotei"], 7049.92],
  ["iPhone (Apple 'selecionados' → sem estimativa)", "iPhone 18 Pro Max Apple 256GB, Câmera de 48MP, A20 Pro, Tela 6.9\" Super Retina XDR, Glacial", 11699.1, "kabum", ["apple", "disc50", "50yotei"], null],
  ["ASRock (valor fixo, sem restrição)", "Placa-Mãe ASRock A620AM-HVS, Ryzen AM5 A620A, Micro ATX, DDR5 - 90-MXBSR0-A0UAYZ", 512.99, "kabum", ["asrock", "disc50", "50yotei"], 412.99],
  ["Adaptador VGA (categoria, NÃO deve casar)", "Adaptador HUB Baseus 4K HDMI para VGA, Micro USB e P2, Preto - CAHUB-AH01", 49.9, "kabum", ["disc50", "50yotei"], null],
  ["SSD (só genéricos, máx 2, sem estimativa)", "SSD SanDisk SN350, 1TB, M.2 2280, PCIe 3.0 x4, NVMe, Leitura: 2400 MB/s, Gravação: 1850 MB/s, Verde - WDS100T2G0C", 1599.99, "kabum", ["disc50", "50yotei"], null],
  ["Shopee (nenhum cupom de loja)", "TWS X55 Fones De Ouvido Sono Sem Fio", 15.44, "shopee", [], null],
];
for (const [label, name, price, store, expected, est] of cases) {
  const picks = pickCouponsForProduct({ coupons: [...kabum, ...malwee], storeSlug: store, productName: name, price });
  const ids = picks.map((p) => p.coupon.id);
  const first = picks[0]?.estimated ?? null;
  check(label, ids.join() === expected.join() && first === est, { ids, estimated: picks.map((p) => p.estimated) });
}
// abaixo do mínimo e teto (sintético, não há cupom real com teto hoje)
const rMin = parseCouponRule({ title: "R$25 OFF em compras acima de R$150", code: "X" });
check("abaixo do mínimo → null", estimatePriceWithCoupon(rMin, 100) === null && estimatePriceWithCoupon(rMin, 180) === 155);
const rCap = parseCouponRule({ title: "15% OFF limitado a R$20", code: "X" });
check("teto respeitado", estimatePriceWithCoupon(rCap, 180) === 160);
// Malwee: mínimo sem desconto → sem estimativa; "na compra de 2 peças" → restrito
check("malwee min sem valor", estimatePriceWithCoupon(parseCouponRule({ title: malwee[0].title }), 600) === null);
check("malwee 2 peças restrito", parseCouponRule({ title: malwee[1].title, code: "ACTIVE20" }).eligibilityRestricted === true);
// VGA é categoria; JBL é marca; "relâmpago" é validade desconhecida
check("vga = categoria", parseCouponRule({ title: kabum[5].title, code: "VGA8" }).scopeKind === "category");
check("jbl = marca", parseCouponRule({ title: kabum[2].title, code: "JBL25" }).scopeKind === "brand");
check("sacy validade desconhecida", parseCouponRule({ title: kabum[4].title, code: "SACY15" }).validityUnknown === true);
// marcador Awin vs validade real distante
check("awin open-ended", isAwinOpenEnded("2027-09-26T02:59:59+00:00", "2026-09-25T11:25:40.052+00:00") === true);
check("brinox 21/12 é validade real", isAwinOpenEnded("2026-12-21T02:30:00+00:00", "2026-09-25T11:28:59.79+00:00") === false);
check("apple 15/10 é validade real", isAwinOpenEnded("2026-10-15T13:00:00+00:00", "2026-09-25T11:25:40.052+00:00") === false);
check("describe apple", describeRule(parseCouponRule({ title: kabum[1].title, code: "X" })) === "12% OFF · em Apple · itens selecionados", describeRule(parseCouponRule({ title: kabum[1].title, code: "X" })));
check("jbl não casa em 'jblue'", ruleMatchesProduct(parseCouponRule({ title: kabum[2].title, code: "X" }), "Caixa JBLUE") === "no");
console.log(fail ? `FAIL ${fail}` : "ALL OK"); process.exit(fail ? 1 : 0);

import type { AttractorType, LureType } from "../engine";

export interface LureEntry {
  id: string;
  brand: string;
  name: string;
  type: LureType;
  /** Left blank unless sources agree; the engine learns per-lure behaviour from logs. */
  weightOz?: number;
  lengthIn?: number;
  /** Manufacturer/retailer rating for casting or mono trolling: NOT depth on leadcore. */
  ratedDive?: { min?: number; max: number };
  /** Manufacturer product page, when we found one. */
  mfrUrl?: string;
  /** Retailer listing the numbers came from (fallback when no manufacturer page). */
  source?: string;
  custom?: boolean;
}

interface Spec {
  w?: number;
  len?: number;
  dive?: { min?: number; max: number };
  src?: string;
  mfr?: string;
}

export interface AttractorEntry {
  id: string;
  brand: string;
  name: string;
  type: AttractorType;
  custom?: boolean;
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const L = (brand: string, name: string, type: LureType, spec: Spec = {}): LureEntry => ({
  id: slug(`${brand} ${name}`),
  brand,
  name,
  type,
  weightOz: spec.w,
  lengthIn: spec.len,
  ratedDive: spec.dive,
  source: spec.src,
  mfrUrl: spec.mfr,
});

/**
 * Commonly trolled lures. Names/types are from memory. Sizes, weights and
 * rated dive depths are only filled in where retailer listings agreed (source
 * link on each); other entries are left blank rather than guessed.
 * Rated dive depths are for casting/mono trolling and do not apply to leadcore.
 */
export const LURES: LureEntry[] = [
  // Spoons
  L("Williams", "Wabler W40", "spoon", { w: 0.25, len: 2.25, src: "https://uslures.com/williams-wabler-w40-10001.html" }),
  L("Williams", "Wabler W50", "spoon", { w: 0.5, len: 2.75, src: "https://uslures.com/williams-wabler-w50-8674.html" }),
  L("Williams", "Wabler W60", "spoon", { w: 0.75, len: 3.25, src: "https://uslures.com/williams-wabler-w60-1767.html" }),
  L("Williams", "Whitefish", "spoon"),
  L("Williams", "Ice Spoon", "spoon"),
  L("Acme", "Little Cleo 1/4 oz", "spoon", { w: 0.25, src: "https://www.fishusa.com/ACME-Little-Cleo-Spoons/" , mfr: "https://www.acmetackle.com/products/little-cleo" }),
  L("Acme", "Little Cleo 1/3 oz", "spoon", { w: 1 / 3, src: "https://www.fishusa.com/ACME-Little-Cleo-Spoons/" , mfr: "https://www.acmetackle.com/products/little-cleo" }),
  L("Acme", "Little Cleo 3/4 oz", "spoon", { w: 0.75, src: "https://www.fishusa.com/ACME-Little-Cleo-Spoons/" , mfr: "https://www.acmetackle.com/products/little-cleo" }),
  L("Eppinger", "Dardevle", "spoon"),
  L("Eppinger", "Dardevle Imp Klicker", "spoon", { w: 0.4, len: 2.25, src: "https://uslures.com/dardevle-imp-klicker-22370.html" , mfr: "https://dardevle.com/product/dardevle-imp-klicker-2-5oz/" }),
  L("Eppinger", "Dardevle Devle Dog", "spoon", { w: 1 / 3, len: 2, src: "https://uslures.com/dardevle-devle-dog-5300-0409.html" , mfr: "https://dardevle.com/product-category/devle_dog/" }),
  L("Luhr-Jensen", "Krocodile", "spoon"),
  L("Northport", "Nailer", "spoon"),
  L("Northern King", "Spoon", "spoon"),
  L("Michigan Stinger", "Scorpion", "spoon"),
  L("Moonshine", "Spoon", "spoon"),
  L("Silver Streak", "Spoon", "spoon"),
  L("Sutton", "Spoon", "spoon"),
  L("Yakima Bait", "Wedding Ring", "spoon"),
  // Crankbaits / plugs
  L("Rapala", "Shad Rap SR07", "crankbait", { w: 0.3125, len: 2.75, dive: { min: 5, max: 11 }, src: "https://discounttackle.com/collections/all/products/rapala-shad-rap-sr07" , mfr: "https://www.rapala.com/us_en/shad-rap" }),
  L("Rapala", "Deep Tail Dancer DTD07", "crankbait", { w: 0.3125, len: 2.75, dive: { max: 15 }, src: "https://joessportinggoods.com/products/1-161737-deep-tail-dancer-07" , mfr: "https://www.rapala.com/rapala/lures/tail-dancer-series/deep-tail-dancer/Deep+Tail+Dancer.html" }),
  L("Rapala", "Deep Tail Dancer DTD09", "crankbait", { w: 0.4375, len: 3.5, dive: { max: 20 }, src: "https://joessportinggoods.com/es/products/1-161738-deep-tail-dancer-09" , mfr: "https://www.rapala.com/rapala/lures/tail-dancer-series/deep-tail-dancer/Deep+Tail+Dancer.html" }),
  L("Rapala", "Scatter Rap", "crankbait"),
  L("Rapala", "Fat Rap", "crankbait"),
  L("Rapala", "Countdown", "crankbait"),
  L("Reef Runner", "Ripshad 200", "crankbait", { w: 0.25, len: 3.375, dive: { max: 16 }, src: "https://www.campsaver.com/reef-runner-rip-shad.html" , mfr: "https://www.acmetackle.com/products/reef-runner-ripshad" }),
  L("Reef Runner", "Ripshad 400", "crankbait", { w: 0.375, len: 4, dive: { max: 18 }, src: "https://www.acmetackle.com/products/reef-runner-ripshad" , mfr: "https://www.acmetackle.com/products/reef-runner-ripshad" }),
  L("Reef Runner", "Ripshad 44 Mag", "crankbait", { w: 0.625, len: 3.625, dive: { max: 30 }, src: "https://north40.com/acme-tackle-reef-runner-44-mag-ripshad-fishing-lure-35-8-5-8-oz" , mfr: "https://www.acmetackle.com/products/reef-runner-44-mag" }),
  L("Reef Runner", "Ripplin' Shad", "crankbait"),
  L("Berkley", "Flicker Shad 5", "crankbait", { w: 0.2, src: "https://www.walmart.com/ip/345438143" , mfr: "https://www.berkley-fishing.com/products/flicker-shad-1285348" }),
  L("Berkley", "Flicker Shad 7", "crankbait", { w: 0.3125, len: 2.75, src: "https://www.walmart.com/ip/32174377" , mfr: "https://www.berkley-fishing.com/products/flicker-shad-1285348" }),
  L("Salmo", "Hornet", "crankbait"),
  L("Salmo", "Executor", "crankbait"),
  L("Bandit", "100 Series", "crankbait", { w: 0.25, len: 2, dive: { min: 2, max: 5 }, src: "https://www.DiscountTackle.com/products/bandit-100-series-shallow-diving-crankbait" , mfr: "https://www.banditlures.com/" }),
  L("Bandit", "200 Series", "crankbait", { w: 0.25, len: 2, dive: { min: 4, max: 8 }, src: "https://www.DiscountTackle.com/products/bandit-200-series-medium-diving-crankbait" , mfr: "https://www.banditlures.com/" }),
  L("Bandit", "300 Series", "crankbait", { w: 0.375, len: 2, dive: { min: 8, max: 12 }, src: "https://www.DiscountTackle.com/products/bandit-300-series-deep-diving-crankbaits" , mfr: "https://www.banditlures.com/" }),
  L("Storm", "Hot 'N Tot 05", "crankbait", { w: 0.1875, len: 2, src: "https://www.walmart.com/ip/41766137" , mfr: "https://www.rapala.com/us_en/original-hot-n-tot" }),
  L("Storm", "Deep Jr. Thunderstick", "crankbait"),
  L("Bomber", "Model A", "crankbait"),
  L("Bomber", "Long A", "crankbait"),
  L("Cotton Cordell", "Wally Diver", "crankbait"),
  L("Yo-Zuri", "Crystal Minnow", "crankbait"),
  L("Lucky Craft", "Pointer", "crankbait"),
  L("Smithwick", "Rattlin' Rogue", "crankbait"),
  L("Flatfish", "Original", "plug"),
  L("Kwikfish", "K13", "plug"),
  L("Kwikfish", "K14", "plug", { len: 4.25, dive: { max: 16 }, src: "https://discounttackle.com/collections/all/products/luhr-jensen-kwikfish-k14-k15" , mfr: "https://www.rapala.com/us_en/luhr-jensen" }),
  L("Kwikfish", "K15", "plug", { len: 5, dive: { max: 18 }, src: "https://discounttackle.com/collections/all/products/luhr-jensen-kwikfish-k14-k15" , mfr: "https://www.rapala.com/us_en/luhr-jensen" }),
  L("Storm", "Wiggle Wart Original", "plug", { w: 0.4, len: 2, dive: { min: 6.5, max: 18 }, src: "https://uslures.com/wiggle-wart-12320.html" , mfr: "https://www.rapala.com/us_en/original-wiggle-wart" }),
  L("Storm", "Wiggle Wart Deep", "plug", { w: 0.4375, len: 2, dive: { min: 10, max: 20 }, src: "https://prod.omniafishing.com/p/storm-original-deep-wiggle-wart" , mfr: "https://www.rapala.com/us_en/original-deep-wiggle-wart" }),
  L("Storm", "Original Mag Wart", "plug", { w: 0.75, len: 2.75, dive: { min: 13, max: 24 }, src: "https://uslures.com/storm-magnum-wiggle-wart-24212.html" , mfr: "https://www.rapala.com/us_en/original-mag-wart" }),
  // Stickbaits
  L("Rapala", "Original Floating F07", "stickbait", { w: 0.125, len: 2.75, dive: { min: 3, max: 5 }, src: "https://joessportinggoods.com/products/27803-original-floater-07" , mfr: "https://www.rapala.com/us_en/original-floating" }),
  L("Rapala", "Original Floating F09", "stickbait", { w: 0.1875, len: 3.5, dive: { min: 3, max: 5 }, src: "https://sftackle.i95-dev.com/rapala-original-floating-br-lure-f05-f07-f09-13330.html" , mfr: "https://www.rapala.com/us_en/original-floating" }),
  L("Rapala", "Husky Jerk", "stickbait", { mfr: "https://www.rapala.com/us_en/husky-jerk" }),
  L("Rapala", "Deep Husky Jerk", "stickbait"),
  L("Rapala", "X-Rap", "stickbait"),
  L("Smithwick", "Perfect 10", "stickbait"),
  // Divers
  L("Luhr-Jensen", "Dipsy Diver", "diver"),
  L("Walker", "Deep 6 Diver", "diver"),
  L("Offshore Tackle", "Jr. Diver", "diver"),
  // Spinners / harnesses
  L("Mack's Lure", "Smile Blade", "spinner"),
  L("Mack's Lure", "Cha Cha Squid", "spinner"),
  L("Northland", "Baitfish-Spin", "spinner"),
  L("Lindy", "Crawler Harness", "spinner"),
  L("Mepps", "Aglia", "spinner"),
  L("Yakima Bait", "Spin-N-Glo", "spinner"),
  // Soft baits / hoochies / flies
  L("Mack's Lure", "Wedding Ring Hoochie", "softbait"),
  L("Mack's Lure", "Double Whammy", "softbait"),
  L("Uncle Larry's", "Hoochie", "softbait"),
  L("Berkley", "Gulp! Minnow on Jig", "softbait"),
  L("Pro-Troll", "Hoochie Squid", "softbait"),
  L("Generic", "Trolling Fly", "softbait"),
];

const A = (brand: string, name: string, type: AttractorType): AttractorEntry => ({
  id: slug(`${brand} ${name}`),
  brand,
  name,
  type,
});

export const ATTRACTORS: AttractorEntry[] = [
  A("Pro-Troll", "ProChip Flasher", "flasher"),
  A("Pro-Troll", "Flash Lite", "flasher"),
  A("Pro-Troll", "Dodger", "dodger"),
  A("Big Al's", "Fish Flash", "flasher"),
  A("Mack's Lure", "Cha Cha", "flasher"),
  A("Hot Spot", "Flasher", "flasher"),
  A("Generic", "Dodger", "dodger"),
  A("Generic", "Flasher", "flasher"),
  A("Generic", "Cowbell / Hardware", "other"),
];

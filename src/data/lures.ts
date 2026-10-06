import type { AttractorType, LureType } from "../engine";

export interface LureEntry {
  id: string;
  brand: string;
  name: string;
  type: LureType;
  /** Left blank unless known; the engine learns per-lure behaviour from logs. */
  weightOz?: number;
  custom?: boolean;
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

const L = (brand: string, name: string, type: LureType): LureEntry => ({
  id: slug(`${brand} ${name}`),
  brand,
  name,
  type,
});

/**
 * Commonly trolled lures, compiled from memory (names/types only, no sizes,
 * weights or dive specs; not checked against catalogs). Users can add and edit.
 */
export const LURES: LureEntry[] = [
  // Spoons
  L("Williams", "Wabler", "spoon"),
  L("Williams", "Whitefish", "spoon"),
  L("Williams", "Ice Spoon", "spoon"),
  L("Acme", "Little Cleo", "spoon"),
  L("Eppinger", "Dardevle", "spoon"),
  L("Eppinger", "Dardevle Imp", "spoon"),
  L("Luhr-Jensen", "Krocodile", "spoon"),
  L("Northport", "Nailer", "spoon"),
  L("Northern King", "Spoon", "spoon"),
  L("Michigan Stinger", "Scorpion", "spoon"),
  L("Moonshine", "Spoon", "spoon"),
  L("Silver Streak", "Spoon", "spoon"),
  L("Sutton", "Spoon", "spoon"),
  L("Yakima Bait", "Wedding Ring", "spoon"),
  // Crankbaits / plugs
  L("Rapala", "Shad Rap", "crankbait"),
  L("Rapala", "Deep Tail Dancer", "crankbait"),
  L("Rapala", "Scatter Rap", "crankbait"),
  L("Rapala", "Fat Rap", "crankbait"),
  L("Rapala", "Countdown", "crankbait"),
  L("Reef Runner", "Ripshad", "crankbait"),
  L("Reef Runner", "Ripplin' Shad", "crankbait"),
  L("Berkley", "Flicker Shad", "crankbait"),
  L("Salmo", "Hornet", "crankbait"),
  L("Salmo", "Executor", "crankbait"),
  L("Bandit", "100 Series", "crankbait"),
  L("Bandit", "200 Series", "crankbait"),
  L("Bandit", "300 Series", "crankbait"),
  L("Storm", "Hot 'N Tot", "crankbait"),
  L("Storm", "Deep Jr. Thunderstick", "crankbait"),
  L("Bomber", "Model A", "crankbait"),
  L("Bomber", "Long A", "crankbait"),
  L("Cotton Cordell", "Wally Diver", "crankbait"),
  L("Yo-Zuri", "Crystal Minnow", "crankbait"),
  L("Lucky Craft", "Pointer", "crankbait"),
  L("Smithwick", "Rattlin' Rogue", "crankbait"),
  L("Flatfish", "Original", "plug"),
  L("Kwikfish", "K13", "plug"),
  L("Wiggle Wart", "Original", "plug"),
  // Stickbaits
  L("Rapala", "Original Floating", "stickbait"),
  L("Rapala", "Husky Jerk", "stickbait"),
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

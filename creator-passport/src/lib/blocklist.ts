// Word lists for the automatic content check. Edit freely: this is a first line of defence,
// not a complete solution. Anything that slips through can still be reported by users and
// removed from the admin queue.

/** Whole words that are never allowed (vulgar, abusive, adult). Matched on normalised text. */
export const REJECT_WORDS = [
  // English
  "fuck", "fucker", "fucking", "fucked", "motherfucker", "bitch", "bitches", "asshole", "bastard",
  "cunt", "slut", "whore", "dickhead", "nigger", "nigga", "faggot", "retard",
  // adult
  "porn", "porno", "xxx", "nude", "nudes", "nsfw", "onlyfans", "escort", "escorts", "hentai",
  "camgirl", "blowjob", "handjob",
  // Hindi / Hinglish
  "madarchod", "bhenchod", "behenchod", "bhosdike", "bhosdi", "chutiya", "chutiye", "gandu",
  "randi", "lauda", "bsdk", "mkc",
];

/** Long, unambiguous terms that are also caught when someone hides them as f.u.c.k or p o r n. */
export const REJECT_STRIPPED = [
  "fuck", "nigger",
  "madarchod", "bhenchod", "behenchod", "chutiya", "motherfucker", "pornhub", "xvideos", "xnxx",
  "onlyfans", "hentai", "childporn",
];

/** Phrases that need a human look before they go public (scams, piracy, gambling, adult-adjacent). */
export const REVIEW_PHRASES = [
  // adult-adjacent
  "sex", "18+", "adult", "dating",
  // account hacking and fake growth
  "hack instagram", "hack facebook", "hack whatsapp", "hack account", "free followers",
  "buy followers", "followers hack", "like4like",
  // fraud
  "carding", "cvv dump", "cvv shop", "fullz", "double your money", "guaranteed profit", "pump and dump",
  // piracy ("crack the interview" and "free premium tools" are normal for this audience, so they are not listed)
  "cracked software", "crack software", "cracked apk", "crack download", "cracked version", "keygen",
  "serial key", "nulled", "warez", "torrent", "pirated", "mod apk",
  // gambling
  "casino", "betting", "satta", "matka", "teen patti", "rummy", "dream11", "1xbet", "betway",
];

/** Link hosts that are never allowed. */
export const REJECT_HOSTS = [
  "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com", "youporn.com",
  "onlyfans.com", "chaturbate.com",
];

/** Link hosts that hide the real destination, or are commonly used for piracy. Held for review. */
export const REVIEW_HOSTS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "ow.ly", "shorturl.at",
  "tiny.cc", "lnkd.in", "buff.ly", "rebrand.ly", "bl.ink", "t.ly", "v.gd",
  "thepiratebay.org", "1337x.to", "rarbg.to", "yts.mx",
];

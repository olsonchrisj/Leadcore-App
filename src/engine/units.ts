export const FT_PER_YD = 3;
export const FT_PER_M = 3.280839895;
export const COLOR_LENGTH_FT = 30; // 10 yd per color
export const KMH_PER_MPH = 1.609344;
export const KNOTS_PER_MPH = 0.868976;

export const ftToM = (ft: number) => ft / FT_PER_M;
export const mToFt = (m: number) => m * FT_PER_M;
export const mphToKmh = (mph: number) => mph * KMH_PER_MPH;
export const kmhToMph = (kmh: number) => kmh / KMH_PER_MPH;
export const knotsToMph = (kn: number) => kn / KNOTS_PER_MPH;
export const colorsFromFt = (ft: number) => ft / COLOR_LENGTH_FT;
export const ftFromColors = (c: number) => c * COLOR_LENGTH_FT;

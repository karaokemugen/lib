import { karaLineDisplayType, karaLineElement, karaSortType, styleFontType } from "../utils/constants.ts";

export type PathType = typeof pathType[number];

export type KaraLineElement = typeof karaLineElement[number];
export type KaraSortType = typeof karaSortType[number];
export type KaraSortElement = KaraSortType | KaraSortType[];
export type KaraLineDisplayType = typeof karaLineDisplayType[number];
export type StyleFontType = typeof styleFontType[number];

export interface KaraLineDisplayElement {
	type: KaraLineElement | KaraLineElement[];
	display: KaraLineDisplayType;
	style?: StyleFontType;
}

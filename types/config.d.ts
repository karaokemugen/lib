export type PathType =
	| 'Backgrounds'
	| 'Import'
	| 'Fonts'
	| 'Temp'
	| 'Logs'
	| 'SSHKeys'
	| 'SessionExports'
	| 'Previews'
	| 'Avatars'
	| 'Banners'
	| 'StreamFiles'
	| 'BundledBackgrounds'
	| 'DB'
	| 'Bin';

export type KaraLineElement = TagType | 'title' | 'displayType';
export type KaraSortType = TagType | 'title' | 'parents';
export type KaraSortElement = KaraSortType | KaraSortType[];
export type KaraLineDisplayType = 'short' | 'i18n' | 'tag';
export type StyleFontType = 'bold' | 'italic';

export interface KaraLineDisplayElement {
	type: KaraLineElement | KaraLineElement[];
	display: KaraLineDisplayType;
	style?: StyleFontType;
}

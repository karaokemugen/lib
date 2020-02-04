import { Stats } from "fs-extra";

export type DirType = 'Karas' | 'Series' | 'Tags' | 'Lyrics' | 'Medias';

export interface FileStats {
	name: string,
	mtime: number
}
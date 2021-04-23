export interface Repository {
	Name: string,
	Online: boolean,
	Enabled: boolean,
	SendStats?: boolean,
	Git: string,
	ManualDownloads?: boolean,
	Path: {
		Karas: string[]
		Lyrics: string[]
		Medias: string[]
		Tags: string[]
	}
}

export type RepositoryType = 'Karas' | 'Lyrics' | 'Medias' | 'Tags'


export interface repoStats {
	authors: number
	creators: number
	duration: number
	karas: number
	languages: number
	mediasize: number
	series: number
	singers: number
	songwriters: number
}
export interface Repository {
	Name: string,
	Online: boolean,
	Enabled: boolean,
	Path: {
		Karas: string[]
		Lyrics: string[]
		Medias: string[]
		Tags: string[]
		Series: string[]
	}
}

export type RepositoryType = 'Karas' | 'Lyrics' | 'Medias' | 'Series' | 'Tags'


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
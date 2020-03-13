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
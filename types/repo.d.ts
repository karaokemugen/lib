export interface Repository {
	Name: string,
	Online: boolean,
	Enabled: boolean,
	SendStats?: boolean,
	MaintainerMode?: boolean,
	AutoMediaDownloads?: 'none' | 'updateOnly' | 'all',
	BaseDir: string,
	Path: {
		Medias: string[]
	}
}

export type RepositoryType = 'Karaokes' | 'Lyrics' | 'Medias' | 'Tags'

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

export interface RepositoryManifest {
	Git: string,
	FullArchiveURL: string,
	LatestCommit: string
}

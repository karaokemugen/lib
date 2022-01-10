export interface Repository {
	Name: string;
	Online: boolean;
	Enabled: boolean;
	SendStats?: boolean;
	MaintainerMode?: boolean;
	AutoMediaDownloads?: 'none' | 'updateOnly' | 'all';
	BaseDir: string;
	Path: {
		Medias: string[];
	};
	Git?: {
		URL: string;
		Username: string;
		Password: string;
		Author: string;
		Email: string;
		ProjectID: number;
	};
	FTP?: {
		Port: number;
		Host: string;
		Username: string;
		Password: string;
		BaseDir: string;
	};
}

export type RepositoryType =
	| 'Hooks'
	| 'Karaokes'
	| 'Lyrics'
	| 'Medias'
	| 'Tags';

export interface repoStats {
	authors: number;
	creators: number;
	duration: number;
	karas: number;
	languages: number;
	mediasize: number;
	series: number;
	singers: number;
	songwriters: number;
}

export interface RepositoryManifest {
	Git: string;
	FullArchiveURL: string;
	SourceArchiveURL: string;
	LatestCommit: string;
	ProjectID: number;
}

export interface DiffChanges {
	type: 'new' | 'delete';
	path: string;
	uid?: string;
	contents?: string;
}

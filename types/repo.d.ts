export interface RepositoryBasic {
	Name: string;
	Online: boolean;
	Enabled: boolean;
}
export interface Repository extends RepositoryBasic {
	SendStats?: boolean;
	Update?: boolean;
	AutoMediaDownloads?: 'none' | 'updateOnly' | 'all';
	BaseDir: string;
	MaintainerMode: boolean;
	Path: {
		Medias: string[];
	};
	Git?: {
		URL: string;
		Username: string;
		Password: string;
		Author: string;
		Email: string;
		ProjectID?: number;
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
	singergroups: number;
	singers: number;
	songwriters: number;
}

export interface RepositoryManifest {
	FullArchiveURL: string;
	SourceArchiveURL: string;
	LatestCommit: string;
}

export interface DiffChanges {
	type: 'new' | 'delete';
	path: string;
	uid?: string;
	contents?: string;
}

export interface RepositoryBasic {
	Name: string;
	Online: boolean;
	Enabled: boolean;
}

interface RepositoryCommon extends RepositoryBasic {
	SendStats?: boolean;
	Update?: boolean;
	AutoMediaDownloads?: 'none' | 'updateOnly' | 'all';
	BaseDir: string;
	Path: {
		Medias: string[];
	};
}

export interface RepositoryUserSettings extends RepositoryCommon {
	MaintainerMode: false;
}

export interface RepositoryMaintainerSettings extends RepositoryCommon {
	MaintainerMode: true;
	Git: {
		URL: string;
		Username: string;
		Password: string;
		Author: string;
		Email: string;
		ProjectID?: number;
	};
	FTP: {
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

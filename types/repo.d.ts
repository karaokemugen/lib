import { supportedAudioCodecs, supportedFiles, supportedVideoCodecs } from '../utils/constants.js';

export interface RepositoryBasic {
	Name: string;
	Online: boolean;
	Enabled: boolean;
}
export interface Repository extends RepositoryBasic {
	SendStats?: boolean;
	Update?: boolean;
	AutoMediaDownloads?: 'none' | 'updateOnly' | 'all';
	NoMediaDownloadsAtAll?: boolean;
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
	// FIXME: Contained in KMServer's response, but not in config Repo object.
	ProjectID?: number; 
}

export interface DiffChanges {
	type: 'new' | 'delete';
	path: string;
	uid?: string;
	contents?: string;
}

export type VideoContainer = typeof supportedFiles.video[number];
export type VideoCodec = typeof supportedVideoCodecs[number];
export type AudioContainer = typeof supportedFiles.audio[number];
export type AudioCodec = typeof supportedAudioCodecs[number];
export type LyricsFormat = typeof supportedFiles.lyrics[number];

interface RepositoryLyricsManifestASS {
	name: 'ass',
	removeGarbage?: boolean;
	removeHeaderComments?: boolean;
	removeUnusedStyles?: boolean;
	removeUnusedFonts?: boolean;
	setTitle?: boolean;
	setOriginalTiming?: boolean;
	set0x0Resolution?: boolean;
}

interface RepositoryLyricsManifest {
	name: LyricsFormat
}

export interface RepositoryManifestV2 {
	name: string,
	description: string,
	homeURL?: string,
	contentsURL?: string,
	gitURL?: string,
	projectID?: number,
	rules?: {
		videoFile?: {
			containers?: {
				mandatory?: boolean,
				allowed: VideoContainer[]
				default: VideoContainer
			},
			resolution: {
				min?: {
					height: number,
					width: number,
					mandatory?: boolean
				},
				max?: {
					height: number,
					width: number,
					mandatory?: boolean
				}
			},
			codecs?: {
				video?: {
					allowed: VideoCodec[],
					mandatory?: boolean,
					default: VideoCodec
				}
				audio?: {
					allowed: AudioCodec[],
					mandatory?: boolean,
					default: AudioCodec
				}
			},
			bitrate?: {
				mandatory?: boolean,
				min?: number,
				max?: number,
			},
			colorSpace?: {
				allowed: string[],
				mandatory?: boolean,
				default: VideoColorSpace
			},
		},
		audioFile?: {
			containers?: {
				mandatory?: boolean;
				allowed: AudioContainer[],
				default: AudioContainer,
			},
			codecs?: {
				allowed?: AudioCodec[],
				mandatory?: boolean,
				default: AudioCodec
			}
			bitrate?: {
				mandatory?: boolean,
				min?: number,
				max?: number,
			}
			coverArt?: {
				mandatory: boolean,
			}
		},
		lyrics?: {
			formats?: (RepositoryLyricsManifest | RepositoryLyricsManifestASS)[]
		}
	}
}

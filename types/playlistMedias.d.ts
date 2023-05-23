export interface PlaylistMedia {
	series?: string;
	filename: string;
	type: PlaylistMediaType;
}

export type PlaylistMediaType = 'Sponsors' | 'Intros' | 'Outros' | 'Jingles' | 'Encores';

interface PlaylistMediaFile {
	basename: string;
	size: number;
}

type PlaylistMedias = {
	[key in PlaylistMediaType]: PlaylistMedia[];
};

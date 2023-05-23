import { playlistMediaTypes } from '../utils/constants.js';

export interface PlaylistMedia {
	series?: string;
	filename: string;
	type: PlaylistMediaType;
}

export type PlaylistMediaType = typeof playlistMediaTypes[number];

interface PlaylistMediaFile {
	basename: string;
	size: number;
}

type PlaylistMedias = {
	[key in PlaylistMediaType]: PlaylistMedia[];
};

import z from 'zod';

import { zNonEmptyString } from '../utils/validators.js';

export const PLCImportConstraints = z.object({
	kid: z.uuidv4(), 
	flag_playing: z.coerce.boolean().optional(),
	flag_visible: z.coerce.boolean().optional(),
	flag_accepted: z.coerce.boolean().optional(),
	flag_refused: z.coerce.boolean().optional(),
	pos: z.number().int().optional(),
	nickname: zNonEmptyString.optional(),
	username: zNonEmptyString.optional(),
});

export const PLImportConstraints = z.object({
	Header: z.object({
		description: z.literal('Karaoke Mugen Playlist File'),
		version: z.literal(4),
	}),
	PlaylistInformation: z
		.object({
			plaid: z.uuidv4(),
			created_at: z.iso.datetime({ offset: true }),
			modified_at: z.iso.datetime({ offset: true }),
			name: zNonEmptyString,
			flag_visible: z.coerce.boolean().optional(),
		})
		.loose(),
	PlaylistContributors: z.array(z.string()).optional(),
	PlaylistContents: z.array(PLCImportConstraints),
});
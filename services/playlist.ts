import z from 'zod';
import { zArrayOrNil, zBool, zNonEmptyString, zUUID } from '../utils/validators.js';

export const PLCImportConstraints = z.object({
	kid: zUUID, 
	flag_playing: zBool.optional(),
	flag_visible: zBool.optional(),
	flag_accepted: zBool.optional(),
	flag_refused: zBool.optional(),
	pos: z.number().int().optional(),
	nickname: zNonEmptyString.optional(),
	username: zNonEmptyString.optional(),
});

export const PLImportConstraints = z.object({
	Header: z.object({
		description: zNonEmptyString,
		version: z.literal(4),
	}),
	PlaylistInformation: z
		.object({
			plaid: zUUID,
			created_at: z.iso.datetime(),
			modified_at: z.iso.datetime(),
			name: zNonEmptyString,
			flag_visible: zBool.optional(),
		})
		.loose(),
	PlaylistContributors: zArrayOrNil.optional(),
	PlaylistContents: z.array(PLCImportConstraints),
});
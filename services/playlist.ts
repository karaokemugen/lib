import z from 'zod';
import { zArrayOrNil, zBool, zInt, zNonEmptyString, zUUID } from '../utils/validators.js';

export const PLCImportConstraints = z.object({
	kid: zUUID, 
	flag_playing: zBool,
	flag_visible: zBool,
	flag_accepted: zBool,
	flag_refused: zBool,
	pos: zInt,
	nickname: zNonEmptyString,
	username: zNonEmptyString,
});

export const PLImportConstraints = z.object({
	Header: z.object({
		description: zNonEmptyString,
		version: z.literal(4),
	}),
	PlaylistInformation: z
		.object({
			plaid: zUUID,
			created_at: zNonEmptyString,
			modified_at: zNonEmptyString,
			name: zNonEmptyString,
			flag_visible: zBool,
		})
		.loose(),
	PlaylistContributors: zArrayOrNil,
	PlaylistContents: z.array(PLCImportConstraints),
});
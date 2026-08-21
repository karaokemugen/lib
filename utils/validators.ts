import { logger } from '@sentry/node';
import { coerce as semverCoerce, satisfies as semverSatisfies } from 'semver';
import { z } from 'zod';

import { SupportedFileType } from '../types/index.js';
import { Role } from '../types/user.js';
import { supportedFiles, userTypes, uuidRegexp } from './constants.js';
import { ErrorKM } from './error.js';

const service = 'Validator';

// Tests

export function testJSON(json: string): boolean {
	try {
		if (typeof json === 'string') {
			JSON.parse(json);
			return true;
		}
		if (typeof json === 'object') {
			JSON.parse(JSON.stringify(json));
			return true;
		}
		return false;
	} catch (err) {
		return false;
	}
}

export function isUUID(uuid: string) {
	return uuidRegexp.test(uuid);
}

export function isNumber(value: any) {
	return !isNaN(value);
}

// Sanitizers

export function unescape(str: string) {
	return str
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&#x3A;', ':')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}

// Single validators

export const zi18nObject = z.record(z.string(), z.string());

export const zUUIDList = z
  .string()
  .transform((val) => val.split(',').map((s) => s.trim()))
  .pipe(z.array(z.uuid()));

export const zArrayOneItem = z
	.array(z.any())
	.min(1, { message: 'is not an array with at least one element' });

export const zIntegerOrNull = z.union([z.coerce.number(), z.null()]);

export const zUUIDArray = z.array(z.uuidv4());

export const zNonNegativeInt = z
	.number()
	.int({ message: 'is not an integer' })
	.gte(0, { message: 'must be greater than or equal to 0' });

export const zNonEmptyString = z.string().min(1, { message: "can't be blank" });

export const zSemverInteger = (range: string) =>
	z.number().refine(v => semverSatisfies(semverCoerce(`${v}`), range), {
		message: `does not satisfy semver ${range}`,
	});

export const zJSON = z.string().refine(testJSON, { message: 'is invalid JSON' });

export function zFilename(fileType: SupportedFileType) {
	const allowedExtensions = new Set<string>(supportedFiles[fileType]);

	return z.string().refine((filename) => {
		// Check is case-insensitive
		const ext = filename.split('.').pop()?.toLowerCase();
		return ext !== undefined && ext !== filename && allowedExtensions.has(ext);
	}, {
		message: `Unsupported extension for type "${fileType}". Allowed extensions : ${supportedFiles[fileType].join(', ')}`,
	});
}

export const zGitCommit = z.string().regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i);

const criteriaSegmentRegexp = /^[a-zA-Z]+:.+$/;

// Used to validate user.roles object changes (+admin, -donator, etc.)
const roleKeys = Object.keys(userTypes) as [Role, ...Role[]];
const roleEnum = z.enum(roleKeys);
export const zRoles = z.record(roleEnum, z.coerce.boolean());
export const zRolesString = z.string()
	.optional()
	.transform((val) => {
		if (!val) return [];
		const cleaned = val.trim().replace(/"/g, ''); // we all hate doublequotes
		return cleaned.split(',').map((s) => s.trim()).filter(Boolean);
	})
	.pipe(z.array(z.string().regex(/^[+-]/)))
	.transform((elems, err) => {
		const roles: Record<string, boolean> = {};
		for (const elem of elems) {
			const role = elem.substring(1);
			const parsed = roleEnum.safeParse(role);
			if (!parsed.success) {
				err.addIssue({
					code: 'custom',
					message: `Invalid role: ${role}`,
				});
				return z.NEVER;
			}
			roles[role] = elem.startsWith('+');
		}
		return roles;
	})
	.pipe(z.record(z.string(), z.boolean())); 

// Used to validate the "q" param of getKaras
export const zQParam = z
  .string()
  .min(1, 'value cannot be empty')
  .refine((val) => {
    const segments = val.split('!');
    return segments.every((s) => criteriaSegmentRegexp.test(s));
  }, {
    message: 'All criteria must be of format "type:valeurs"',
});

// Main check function here.

export function check(obj: unknown, schema: z.ZodType) {
	const result = schema.safeParse(obj);
	if (result.success) return null;

	const errors: Record<string, string[]> = {};
	for (const issue of result.error.issues) {
		const path = issue.path.join('.');
		if (!errors[path]) errors[path] = [];
		errors[path].push(issue.message);
	}
	console.log(obj);
	console.log(errors);
	logger.error(`Invalid data: ${errors}`, { service });
	throw new ErrorKM('INVALID_DATA', 400, false);
}

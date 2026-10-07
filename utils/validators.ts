import { z } from 'zod';

import { SupportedFileType } from '../types/index.js';
import { Role } from '../types/user.js';
import { supportedFiles, userTypes, uuidRegexp } from './constants.js';
import { ErrorKM } from './error.js';
import logger from './logger.js';

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

export const zNonEmptyString = z.string().min(1, { message: "can't be blank" });

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

// Used to specify that at least one property must exist in an object
export function zAtLeastOne<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const keys = Object.keys(schema.shape) as (keyof T)[];

  return schema.refine(
    (data) => keys.some((k) => data[k as keyof typeof data] !== undefined),
    { message: `At least one property among ${keys.join(", ")} is required` }
  );
}

// Used to validate the "q" param of getKaras
export const zQParam = z
  .string()
  .min(1, 'value cannot be empty')
  .refine((val) => {
    const segments = val.split('!');
    return segments.every((s) => criteriaSegmentRegexp.test(s));
  }, {
    message: 'All criteria must be of format "type:data"',
});

/** Redact sensitive values from data sent before logger.
 * This might be better directly integrated with logger.ts but let's not get ahead of ourselves.
 * TODO: Implement this into logger.
 */
function redact(value: unknown, seen = new WeakSet<object>()): unknown {  
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map(v => redact(v, seen));
  
  const out: Record<string, unknown> = {};
  
  // Let's say those are sensitive
  const SENSITIVE_KEYS = ['password', 'token'];

  for (const [key, val] of Object.entries(value)) {
    const isSensitive = SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()));
    out[key] = isSensitive ? '[REDACTED]' : redact(val, seen);
  }
  return out;
}

// Main check function here.

export function check(obj: unknown, schema: z.ZodType) {
	let result: any;
	try {
		// safeParse can still throw up if the schema isn't good. Technically shouldn't happen at runtime if we do our job properly.
		result = schema.safeParse(obj);	
	} catch(err) {		
		logger.error(`Zod Error: ${err}`, { service })
	}
	if (result.success) return null;
	const errors: Record<string, string[]> = {};
	for (const issue of result.error.issues) {
		const path = issue.path.join('.');
		if (!errors[path]) errors[path] = [];
		errors[path].push(issue.message);
	}
	// Filter input before 
	obj = redact(obj);
	logger.error(`Invalid data. Object received: ${JSON.stringify(obj)} --- Schema: ${JSON.stringify(z.toJSONSchema(schema))} --- Error: ${JSON.stringify(errors)}`, { service });
	throw new ErrorKM(`INVALID_DATA : ${JSON.stringify(errors)} `, 400, false);
}

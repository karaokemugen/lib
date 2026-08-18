import { coerce as semverCoerce, satisfies as semverSatisfies } from 'semver';
import { z } from 'zod';

import { bools, tagTypes, uuidRegexp } from './constants.js';

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

export const zUuidList = z
  .string()
  .transform((val) => val.split(',').map((s) => s.trim()))
  .pipe(z.array(z.uuid()));

export function zInclusion<T extends readonly unknown[]>(values: T) {
	return z.custom<T[number]>(v => (values as readonly unknown[]).includes(v), {
		message: 'is not included in the list',
	});
}

export function zInt(opts: { min?: number; max?: number } = {}) {
	let schema = z.number().int({ message: 'is not an integer' });
	if (opts.min !== undefined)
		schema = schema.gte(opts.min, {
			message: `must be greater than or equal to ${opts.min}`,
		});
	if (opts.max !== undefined)
		schema = schema.lte(opts.max, {
			message: `must be less than or equal to ${opts.max}`,
		});
	return schema;
}

export function zFloat(opts: { min?: number; max?: number } = {}) {
	let schema = z.number();
	if (opts.min !== undefined) {
		schema = schema.gte(opts.min, {
			message: `must be greater than or equal to ${opts.min}`,
		});
	}
	if (opts.max !== undefined) {
		schema = schema.lte(opts.max, {
			message: `must be less than or equal to ${opts.max}`,
		});
	}
	return schema;
}

export const zArrayOneItem = z
	.array(z.any())
	.min(1, { message: 'is not an array with at least one element' });

export const zArrayOrNil = z.union([z.array(z.any()), z.null(), z.undefined()]);

export const zNumbersArray = z.union([
	z.array(z.number()),
	z.string().refine(v => v.split(',').every(x => !isNaN(Number(x))), {
		message: 'is invalid (not an array of numbers)',
	}),
]);

export const zIntegerOrNull = z.union([z.coerce.number(), z.null()]);

export const zBool = zInclusion(bools);

export const zUUID = z.string().refine(isUUID, { message: 'is not a UUID' });

export const zUUIDArray = z.union([
	zUUID,
	z.array(zUUID),
	z
		.string()
		.transform(v => v.split(','))
		.pipe(z.array(zUUID)),
]);


export const zNonNegativeInt = z
	.number()
	.int({ message: 'is not an integer' })
	.gte(0, { message: 'must be greater than or equal to 0' });

export const zNonEmptyString = z.string().min(1, { message: "can't be blank" });

export const zSemverInteger = (range: string) =>
	z.number().refine(v => semverSatisfies(semverCoerce(`${v}`), range), {
		message: `does not satisfy semver ${range}`,
	});

export const zTagType = z.string().refine(v => Object.keys(tagTypes).includes(v), {
	message: 'invalid tag type',
});

export const zTag = z
	.object({
		tid: zUUID.optional(),
		name: z.string().optional(),
	})
	.partial()
	.optional();

export const zI18n = z.record(z.string(), z.any()).optional();

export const zBoolUndefined = z
	.union([z.boolean(), z.enum(['true', 'false'])])
	.optional();

export const zJSON = z.string().refine(testJSON, { message: 'is invalid JSON' });

export const zTagTypeArray = z.union([
	zTagType,
	z
		.string()
		.transform(v => v.split(','))
		.pipe(z.array(zTagType)),
]);

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
	return errors;
}

import randomstring from 'randomstring';
import slug from 'slug';

export function findUniqueSlug(existingSlugs: string[], name: string): string {
	let candidate = slug(name);
	while (existingSlugs.includes(candidate)) {
		candidate += `-${randomstring.generate({
			charset: 'alphabetic',
			capitalization: 'lowercase',
			length: 4
		})}`;
	}
	return candidate;
}

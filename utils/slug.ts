import slugify from 'slugify';

export function findUniqueSlug(slugs: string[], name: string): string {
	const initialSlug = slugify(name, {
		lower: true,
		remove: /['"!,?()]/g,
	});
	if (slugs.includes(initialSlug)) {
		let slug = initialSlug;
		let number = 0;
		while (slugs.includes(slug)) {
			slug = `${initialSlug}-${number}`;
			number++;
		}
		return slug;
	} else {
		return initialSlug;
	}
}

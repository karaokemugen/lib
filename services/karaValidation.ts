import { formatKaraV4 } from "../dao/karafile.js";
import { DBKara } from "../types/database/kara.js";
import { GenerationParentErrors } from "../types/generation.js";
import { KaraFileV4, KarasMap } from "../types/kara.js";
import { nonLatinLanguages } from "../utils/langs.js";
import logger from "../utils/logger.js";
import { getRepoManifest } from "./repo.js";

const service = 'Validation';

export function checkKaraMetadata(karas: KaraFileV4[]) {
	const metadataErrors = {
		titleNonLatinDefaultErrors: [],
		titlesMissingRomanisationErrors: [],
		fromDisplayTypesErrors: [],
	};
	for (const kara of karas) {
		// Not in any rules but we need to check if fromdisplaytype points to a correct type.

		if (kara.data.from_display_type) {
			if (!kara.data.tags[kara.data.from_display_type]) {
				metadataErrors.fromDisplayTypesErrors.push({
					from_display_type: kara.data.from_display_type
				});
			}
		}
		const karaFileRules = getRepoManifest(kara.data.repository)?.rules?.karaFile;
		if (karaFileRules?.requireLatinTitleAsDefault)
			if (nonLatinLanguages.includes(kara?.data?.titles_default_language))
				metadataErrors.titleNonLatinDefaultErrors.push({
					filename: kara?.meta?.karaFile,
					titleDefaultLanguage: kara?.data?.titles_default_language,
				});

		if (karaFileRules?.requireLatinTitle) {
			const karaTitleLangs = Object.keys(kara?.data?.titles);
			if (
				karaTitleLangs.filter(titleLang => nonLatinLanguages.includes(titleLang)).length ===
				karaTitleLangs.length
			)
				metadataErrors.titlesMissingRomanisationErrors.push({
					filename: kara?.meta?.karaFile,
					titleLanguages: karaTitleLangs,
				});
		}
	}

	if (metadataErrors.fromDisplayTypesErrors.length > 0) {
		const err = `One or several karaokes have a display type without any tags in it : ${JSON.stringify(metadataErrors.fromDisplayTypesErrors)}`;
		logger.error(err, { service });
		throw err;
	}
	if (metadataErrors.titleNonLatinDefaultErrors.length > 0) {
		const err = `One or several karaokes have a non-latin language set as default title language : ${JSON.stringify(metadataErrors.titleNonLatinDefaultErrors)}.`;
		logger.error(err, { service });
		throw err;
	}
	if (metadataErrors.titlesMissingRomanisationErrors.length > 0) {
		const err = `One or several karaokes don't have at least one romanized (latin) title : ${JSON.stringify(metadataErrors.titlesMissingRomanisationErrors)}.`;
		logger.error(err, { service });
		throw err;
	}
	return karas;
}

export function createKarasMap(karas: KaraFileV4[]): KarasMap {
	const searchKaras = new Map();
	for (const kara of karas) {
		searchKaras.set(kara.data.kid, kara);
	}
	return searchKaras;
}

export function convertDBKarasToKaraFiles(karas: DBKara[]): KaraFileV4[] {
	const karaFiles: KaraFileV4[] = [];
	for (const kara of karas) {
		const karafile = formatKaraV4(kara);
		karafile.meta.karaFile = kara.karafile;
		karaFiles.push(karafile);
	}
	return karaFiles;
}

export function checkKaraParents(karasMap: KarasMap, familyLineCheck = true): KaraFileV4[] {
	// Test if all parents exist.
	const parentErrors: GenerationParentErrors = {
		missing: [],
		circular: [],
		familyLine: [],
		count: [],
		depth: [],
		disallowedTag: []
	};
	for (const kara of karasMap.values()) {
		if (kara.data.parents) {
			for (const parent of kara.data.parents) {
				const parentKara = karasMap.get(parent);
				if (!parentKara) {
					const karaFileRules = getRepoManifest(kara.data.repository)?.rules?.karaFile;
					if (karaFileRules?.skipParentsExistChecks !== true)
						parentErrors.missing.push({
							childName: kara.meta.karaFile,
							parent,
						});
					// Remove parent from kara
					kara.data.parents = kara.data.parents.filter(p => p !== parent);
					karasMap.set(kara.data.kid, kara);
				}
			}
		}
		if (familyLineCheck) checkFamilyLine([...karasMap.values()], kara.data.kid, parentErrors);
	}

	if (parentErrors.missing.length > 0) {
		const err = `One or several karaokes have missing parents : ${JSON.stringify(parentErrors.missing)}.`;
		logger.error(err, { service });
	}
	if (parentErrors.circular.length > 0) {
		const err = `One or several karaokes have circular dependencies : ${JSON.stringify(parentErrors.circular)}.`;
		logger.error(err, { service });
	}
	if (parentErrors.familyLine.length > 0) {
		parentErrors.familyLine.forEach((f, i) => (parentErrors.familyLine[i] = [...f]));
		const err = `One or several karaokes created a pime taradox (children who are parents of their parents): ${JSON.stringify(parentErrors.familyLine)}.`;
		logger.error(err, { service });
	}
	if (parentErrors.count.length > 0) {
		const err = `One or several karaokes have too many parents : ${JSON.stringify(parentErrors.count)}.`;
		logger.error(err, { service });
	}
	if (parentErrors.depth.length > 0) {
		const err = `One or several karaokes have too many parent generations (parents of parents) : ${JSON.stringify(parentErrors.depth)}.`;
		logger.error(err, { service });
	}
	if (parentErrors.disallowedTag.length > 0) {
		const err = `One or several karaokes have tags that are only allowed in children (and not in parents) : ${JSON.stringify(parentErrors.disallowedTag)}.`;
		logger.error(err, { service });
	}

	const hasAtleastOneError = Object.values(parentErrors).some(errors => errors?.length > 0);
	if (hasAtleastOneError)
		throw 'At least one check has failed, check the error above';

	return [...karasMap.values()];
}

/** Parse a karaoke family line and see if there's a time traveler in there. A child that's a parent of a parent. */
function checkFamilyLine(
	karas: KaraFileV4[],
	kid: string,
	parentErrors: GenerationParentErrors,
	familyLine?: Set<string>,
	depth = 0,
	parentOf: KaraFileV4 = null
): { familyDepth: number } {
	let familyDepth = 0;
	const kara = karas.find(k => k.data.kid === kid);
	// Kara might not exist due to a non-existing repository parent from another kara (example with a repository depending on kara.moe but not listing it)
	if (!kara) return { familyDepth };
	const karaFileRules = getRepoManifest(kara.data.repository)?.rules?.karaFile;
	if (familyLine) {
		if (familyLine.has(kid)) {
			// PIME TARADOX.
			// Don't go further or we'll run into an infinite loop.
			parentErrors.familyLine.push(familyLine);
			return { familyDepth };
		}
	} else {
		familyLine = new Set();
	}
	familyLine.add(kid);
	if (kara && kara.data.parents?.length > 0) {

		// forbidden parent tag validation
		// Get all KaraFiles of parents
		const parentTIDs = [];
		const parentKIDs = kara.data.parents;
		// Get all TIDs of parents
		for (const parentKID of parentKIDs) {
			const parent = karas.find(k => k.data.kid === parentKID)
			if (parent) {
				parentTIDs.push(...Object.values(parent.data.tags).flat());
			}
		}
		const karaDisallowedTags = parentTIDs.filter(tid => karaFileRules?.forbiddenParentTags?.includes(tid));

		if (karaDisallowedTags.length > 0) {
			parentErrors.disallowedTag.push({
				filename: kara.meta.karaFile,
				karaDisallowedTags,
				childKara: parentOf?.meta?.karaFile,
			});
		}

		// Compute familyDepth
		familyDepth = 1 + Math.max(...kara.data.parents
			.map(parent => checkFamilyLine(karas, parent, parentErrors, familyLine, depth + 1, kara).familyDepth)
		);

		if (
			familyDepth > 0 &&
			kara.data.repository &&
			familyDepth > karaFileRules?.maxParentDepth &&
			!parentErrors.depth.some(e => e.filename === kara.meta.karaFile)
		)
			parentErrors.depth.push({ filename: kara.meta.karaFile, parentDepth: familyDepth });
		if (
			kara.data.repository &&
			kara.data.parents?.length > karaFileRules?.maxParents &&
			!parentErrors.count.some(e => e.filename === kara.meta.karaFile)
		)
			parentErrors.count.push({ filename: kara.meta.karaFile, parentCount: kara.data.parents?.length });
	}
	return { familyDepth };
}

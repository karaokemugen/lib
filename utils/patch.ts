import { DiffChanges } from '../types/repo';

const patchRegex = /^a\/.+ b\/(.+)\n(index|new file|deleted file)/m;
const KTidRegex = /"[kt]id": *"(.+)"/;

export function computeFileChanges(patch: string) {
	const patches = patch
		.split('diff --git ')
		.slice(1)
		.map<DiffChanges>((v) => {
			const result = v.match(patchRegex);
			const uid = v.match(KTidRegex);
			if (!result) {
				throw new Error('Cannot find diff header, huh.');
			}
			return {
				type: result[2] === 'deleted file' ? 'delete' : 'new',
				path: result[1],
				uid: uid ? uid[1] : undefined,
			};
		});
	// Remove delete patches that have a corresponding new entry (renames)
	const newPatches = patches.filter((p) => p.type === 'new');
	return patches.filter(
		(p) =>
			!(
				p.type === 'delete' &&
				newPatches.findIndex((p2) => p.uid === p2.uid) !== -1
			)
	);
}

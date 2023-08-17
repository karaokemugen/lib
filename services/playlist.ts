import { bools } from '../utils/constants.js';

export const PLImportConstraints = {
	'Header.description': { presence: true },
	'Header.version': { numericality: { onlyInteger: true, equalTo: 4 } },
	'PlaylistInformation.plaid': {uuidValidator: true},
	'PlaylistInformation.created_at': { presence: { allowEmpty: false } },
	'PlaylistInformation.modified_at': { presence: { allowEmpty: false } },
	'PlaylistInformation.name': { presence: { allowEmpty: false } },
	'PlaylistInformation.flag_visible': { inclusion: bools },
	PlaylistContents: { PLCsValidator: true },
};

export const PLCImportConstraints = {
	kid: { presence: true, uuidValidator: true },
	flag_playing: { inclusion: bools },
	flag_visible: { inclusion: bools },
	flag_accepted: { inclusion: bools },
	flag_refused: { inclusion: bools },
	pos: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
	nickname: { presence: { allowEmpty: false } },
	username: { presence: { allowEmpty: false } },
};

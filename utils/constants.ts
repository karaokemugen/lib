/*
 * Constants for KM.
 */

import { TagType, TagTypeNum } from '../types/tag.js';

export const externalDatabases = [
	'anilist',
	'myanimelist',
	'kitsu'
];

export const supportedFiles = {
	video: [
		'avi',
		'mkv',
		'mp4',
		'webm',
		'mov',
		'wmv',
		'mpg',
		'm2ts',
		'rmvb',
		'ts',
		'm4v',
	],
	audio: [
		'ogg',
		'm4a',
		'mp3',
		'wav',
		'flac',
		'mid'
	],
	lyrics: [
		'ass',
		'srt',
		'kar',
		'txt',
		'kfn',
		'lrc',
		'vtt',
		'kbp'
	],
	mpvlyrics: [
		'ass',
		'jss',
		'lrc',
		'mpl2',
		'rt',
		'smi',
		'srt',
		'stl',
		'sub',
		'vtt'
	],
	pictures: [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
		'apng',
		'jng'
	]
};

/** Regexps for validation. */
export const uuidRegexp =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uuidPlusTypeRegexp =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}~[0-9]+$/;
export const md5Regexp = '^[a-f0-9]{32}$';
export const mediaFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.video.concat(supportedFiles.audio).join('|')})$`
);
export const imageFileRegexp = new RegExp(`^.+\\.(${supportedFiles.pictures.join('|')})$`);
export const backgroundFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.video.concat(supportedFiles.pictures).join('|')})$`
);
export const subFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.lyrics.join('|')})$`
);
export const audioFileRegexp = new RegExp(
	`^.+\\.(${supportedFiles.audio.join('|')})$`
);
export const hostnameRegexp = /^[a-zA-Z0-9-.]+\.[a-zA-Z0-9-]+$/;
export const asciiRegexp = /^[\u0000-\u007F]+$/u;
export const imageFileTypes = ['jpg', 'jpeg', 'png', 'gif'];
export const bools = [true, false, 'true', 'false', undefined];

export function getTagTypeName(type: TagTypeNum): TagType {
	return (<TagType[]>Object.keys(tagTypes)).find(
		t => tagTypes[t] === type
	) as TagType;
}

export const userTypes = Object.freeze({
	admin: 0,
	maintainer: 0.5,
	contributor: 0.6,
	user: 1,
	guest: 2,
});

export const tagTypes = Object.freeze({
	series: 1,
	singers: 2,
	songtypes: 3,
	creators: 4,
	langs: 5,
	authors: 6,
	misc: 7,
	songwriters: 8,
	groups: 9,
	families: 10,
	origins: 11,
	genres: 12,
	platforms: 13,
	versions: 14,
	warnings: 15,
	collections: 16,
	singergroups: 17,
	franchises: 18,
});

export const tagTypesKaraFileV4Order = Object.freeze({
	authors: 6,
	collections: 16,
	creators: 4,
	families: 10,
	genres: 12,
	groups: 9,
	langs: 5,
	misc: 7,
	origins: 11,
	platforms: 13,
	series: 1,
	singers: 2,
	singergroups: 17,
	songtypes: 3,
	songwriters: 8,
	versions: 14,
	warnings: 15,
	franchises: 18,
});

export const myanimelistStatusWatching = 1;
export const myanimelistStatusCompleted = 2;
export const myanimelistStatusOnHold = 3;
export const myanimelistStatusDropped = 4;
export const myanimelistStatusPlanToWatch = 5;

export const playlistMediaTypes = [
	'Sponsors', 
	'Intros', 
	'Outros',
	'Jingles',
	'Encores',
];

// Codecs supported by ffmpeg.
// To list them when upgrading to new ffmpeg versions :
// for codec in $(ffmpeg -codecs | grep -E '^.{3}V.*' | grep -v "=" | awk -F\  {'print $2'}) ; do echo "'$codec',"; done
// Replace the V in the first grep by S for subtitles or A for audio

export const supportedVideoCodecs = [
	'012v',
	'4xm',
	'8bps',
	'a64_multi',
	'a64_multi5',
	'aasc',
	'aic',
	'alias_pix',
	'amv',
	'anm',
	'ansi',
	'apng',
	'asv1',
	'asv2',
	'aura',
	'aura2',
	'av1',
	'avrn',
	'avrp',
	'avs',
	'avui',
	'ayuv',
	'bethsoftvid',
	'bfi',
	'binkvideo',
	'bintext',
	'bmp',
	'bmv_video',
	'brender_pix',
	'c93',
	'cavs',
	'cdgraphics',
	'cdxl',
	'cfhd',
	'cinepak',
	'clearvideo',
	'cljr',
	'cllc',
	'cmv',
	'cpia',
	'cscd',
	'cyuv',
	'daala',
	'dds',
	'dfa',
	'dirac',
	'dnxhd',
	'dpx',
	'dsicinvideo',
	'dvvideo',
	'dxa',
	'dxtory',
	'dxv',
	'escape124',
	'escape130',
	'exr',
	'ffv1',
	'ffvhuff',
	'fic',
	'flashsv',
	'flashsv2',
	'flic',
	'flv1',
	'fmvc',
	'fraps',
	'frwu',
	'g2m',
	'gif',
	'h261',
	'h263',
	'h263i',
	'h263p',
	'h264',
	'hap',
	'hevc',
	'hnm4video',
	'hq_hqa',
	'hqx',
	'huffyuv',
	'idcin',
	'idf',
	'iff_ilbm',
	'indeo2',
	'indeo3',
	'indeo4',
	'indeo5',
	'interplayvideo',
	'jpeg2000',
	'jpegls',
	'jv',
	'kgv1',
	'kmvc',
	'lagarith',
	'ljpeg',
	'loco',
	'm101',
	'mad',
	'magicyuv',
	'mdec',
	'mimic',
	'mjpeg',
	'mjpegb',
	'mmvideo',
	'motionpixels',
	'mpeg1video',
	'mpeg2video',
	'mpeg4',
	'mpegvideo_xvmc',
	'msa1',
	'msmpeg4v1',
	'msmpeg4v2',
	'msmpeg4v3',
	'msrle',
	'mss1',
	'mss2',
	'msvideo1',
	'mszh',
	'mts2',
	'mvc1',
	'mvc2',
	'mxpeg',
	'nuv',
	'paf_video',
	'pam',
	'pbm',
	'pcx',
	'pgm',
	'pgmyuv',
	'pictor',
	'pixlet',
	'png',
	'ppm',
	'prores',
	'psd',
	'ptx',
	'qdraw',
	'qpeg',
	'qtrle',
	'r10k',
	'r210',
	'rawvideo',
	'rl2',
	'roq',
	'rpza',
	'rscc',
	'rv10',
	'rv20',
	'rv30',
	'rv40',
	'sanm',
	'scpr',
	'screenpresso',
	'sgi',
	'sgirle',
	'sheervideo',
	'smackvideo',
	'smc',
	'smvjpeg',
	'snow',
	'sp5x',
	'speedhq',
	'sunrast',
	'svq1',
	'svq3',
	'targa',
	'targa_y216',
	'tdsc',
	'tgq',
	'tgv',
	'theora',
	'thp',
	'tiertexseqvideo',
	'tiff',
	'tmv',
	'tqi',
	'truemotion1',
	'truemotion2',
	'truemotion2rt',
	'tscc',
	'tscc2',
	'txd',
	'ulti',
	'utvideo',
	'v210',
	'v210x',
	'v308',
	'v408',
	'v410',
	'vb',
	'vble',
	'vc1',
	'vc1image',
	'vcr1',
	'vixl',
	'vmdvideo',
	'vmnc',
	'vp3',
	'vp5',
	'vp6',
	'vp6a',
	'vp6f',
	'vp7',
	'vp8',
	'vp9',
	'webp',
	'wmv1',
	'wmv2',
	'wmv3',
	'wmv3image',
	'wnv1',
	'wrapped_avframe',
	'ws_vqa',
	'xan_wc3',
	'xan_wc4',
	'xbin',
	'xbm',
	'xface',
	'xpm',
	'xwd',
	'y41p',
	'ylc',
	'yop',
	'yuv4',
	'zerocodec',
	'zlib',
	'zmbv',
];

export const supportedAudioCodecs = [
	'4gv',
	'8svx_exp',
	'8svx_fib',
	'aac',
	'aac_latm',
	'ac3',
	'adpcm_4xm',
	'adpcm_adx',
	'adpcm_afc',
	'adpcm_aica',
	'adpcm_ct',
	'adpcm_dtk',
	'adpcm_ea',
	'adpcm_ea_maxis_xa',
	'adpcm_ea_r1',
	'adpcm_ea_r2',
	'adpcm_ea_r3',
	'adpcm_ea_xas',
	'adpcm_g722',
	'adpcm_g726',
	'adpcm_g726le',
	'adpcm_ima_amv',
	'adpcm_ima_apc',
	'adpcm_ima_dat4',
	'adpcm_ima_dk3',
	'adpcm_ima_dk4',
	'adpcm_ima_ea_eacs',
	'adpcm_ima_ea_sead',
	'adpcm_ima_iss',
	'adpcm_ima_oki',
	'adpcm_ima_qt',
	'adpcm_ima_rad',
	'adpcm_ima_smjpeg',
	'adpcm_ima_wav',
	'adpcm_ima_ws',
	'adpcm_ms',
	'adpcm_mtaf',
	'adpcm_psx',
	'adpcm_sbpro_2',
	'adpcm_sbpro_3',
	'adpcm_sbpro_4',
	'adpcm_swf',
	'adpcm_thp',
	'adpcm_thp_le',
	'adpcm_vima',
	'adpcm_xa',
	'adpcm_yamaha',
	'alac',
	'amr_nb',
	'amr_wb',
	'ape',
	'atrac1',
	'atrac3',
	'atrac3al',
	'atrac3p',
	'atrac3pal',
	'avc',
	'binkaudio_dct',
	'binkaudio_rdft',
	'bmv_audio',
	'celt',
	'comfortnoise',
	'cook',
	'dsd_lsbf',
	'dsd_lsbf_planar',
	'dsd_msbf',
	'dsd_msbf_planar',
	'dsicinaudio',
	'dss_sp',
	'dst',
	'dts',
	'dvaudio',
	'eac3',
	'evrc',
	'flac',
	'g723_1',
	'g729',
	'gsm',
	'gsm_ms',
	'iac',
	'ilbc',
	'imc',
	'interplay_dpcm',
	'interplayacm',
	'mace3',
	'mace6',
	'metasound',
	'mlp',
	'mp1',
	'mp2',
	'mp3',
	'mp3adu',
	'mp3on4',
	'mp4als',
	'musepack7',
	'musepack8',
	'nellymoser',
	'opus',
	'paf_audio',
	'pcm_alaw',
	'pcm_bluray',
	'pcm_dvd',
	'pcm_f16le',
	'pcm_f24le',
	'pcm_f32be',
	'pcm_f32le',
	'pcm_f64be',
	'pcm_f64le',
	'pcm_lxf',
	'pcm_mulaw',
	'pcm_s16be',
	'pcm_s16be_planar',
	'pcm_s16le',
	'pcm_s16le_planar',
	'pcm_s24be',
	'pcm_s24daud',
	'pcm_s24le',
	'pcm_s24le_planar',
	'pcm_s32be',
	'pcm_s32le',
	'pcm_s32le_planar',
	'pcm_s64be',
	'pcm_s64le',
	'pcm_s8',
	'pcm_s8_planar',
	'pcm_u16be',
	'pcm_u16le',
	'pcm_u24be',
	'pcm_u24le',
	'pcm_u32be',
	'pcm_u32le',
	'pcm_u8',
	'pcm_zork',
	'qcelp',
	'qdm2',
	'qdmc',
	'ra_144',
	'ra_288',
	'ralf',
	'roq_dpcm',
	's302m',
	'sdx2_dpcm',
	'shorten',
	'sipr',
	'smackaudio',
	'smv',
	'sol_dpcm',
	'sonic',
	'sonicls',
	'speex',
	'tak',
	'truehd',
	'truespeech',
	'tta',
	'twinvq',
	'vmdaudio',
	'vorbis',
	'voxware',
	'wavesynth',
	'wavpack',
	'westwood_snd1',
	'wmalossless',
	'wmapro',
	'wmav1',
	'wmav2',
	'wmavoice',
	'xan_dpcm',
	'xma1',
	'xma2',
];

export const sqlUpdateTagSearchVector = `
UPDATE tag SET tag_search_vector =
to_tsvector('public.unaccent_conf', name) ||
CASE WHEN i18n::text != '{}' THEN (select tsvector_agg(to_tsvector('public.unaccent_conf', i18nj.value)) from tag t2, jsonb_each_text(i18n) i18nj where t2.pk_tid = tag.pk_tid group by t2.pk_tid ) ELSE to_tsvector('public.unaccent_conf', '') END ||
CASE WHEN aliases::text != '[]' THEN (select tsvector_agg(to_tsvector('public.unaccent_conf', aliasesj)) from tag t2, jsonb_array_elements(aliases) aliasesj where t2.pk_tid = tag.pk_tid group by t2.pk_tid ) ELSE to_tsvector('public.unaccent_conf', '') END;

`;

export const sqlRefreshAllTags = (collectionsClause: string[]) => `
WITH kara_available AS (
	SELECT k.pk_kid
	FROM kara k
	LEFT JOIN kara_tag kt ON k.pk_kid = kt.fk_kid
	WHERE ${collectionsClause.join(' OR ')}
), 
t_count AS (
	SELECT a.fk_tid,
		json_agg(json_build_object('type', a.type, 'count', a.c))::text AS count_per_type
	FROM (SELECT kara_tag.fk_tid,
				count(kara_tag.fk_kid) AS c,
				kara_tag.type
		FROM kara_tag
		WHERE kara_tag.fk_kid IN (SELECT * FROM kara_available)
		GROUP BY kara_tag.fk_tid, kara_tag.type) a
	GROUP BY a.fk_tid
)

select t.*,
	t_count.count_per_type::jsonb AS karacount
from tag t
	LEFT JOIN t_count ON t.pk_tid = t_count.fk_tid;

`;

export const sqlCreateTagsIndexes = `
CREATE UNIQUE INDEX idx_at_tid
    on all_tags (pk_tid);
`;

export const sqlDeleteTagsByKara = 'DELETE FROM kara_tag WHERE fk_kid = $1';

export const sqlInsertKaraTags = `
INSERT INTO kara_tag(
	fk_kid,
	fk_tid,
	type
)
VALUES(
	:kid,
	:tid,
	:type
);
`;

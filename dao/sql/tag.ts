export const sqlUpdateTagSearchVector = `
UPDATE tag SET tag_search_vector =
to_tsvector('public.unaccent_conf', name) ||
(select tsvector_agg(to_tsvector('public.unaccent_conf', i18nj.value)) from tag t2, jsonb_each_text(i18n) i18nj where t2.pk_tid = tag.pk_tid group by t2.pk_tid ) ||
CASE WHEN aliases::text != '[]' THEN (select tsvector_agg(to_tsvector('public.unaccent_conf', aliasesj)) from tag t2, jsonb_array_elements(aliases) aliasesj where t2.pk_tid = tag.pk_tid group by t2.pk_tid ) ELSE to_tsvector('public.unaccent_conf', '') END;

`;
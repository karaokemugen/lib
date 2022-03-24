export const sqlUpdateKaraSearchVector = (kid?: boolean) => `
UPDATE kara k SET title_search_vector =
	(select tsvector_agg(to_tsvector('public.unaccent_conf', titlesj.value)) from kara k2, jsonb_each_text(titles) titlesj where k2.pk_kid = k.pk_kid group by k2.pk_kid) ||
		CASE WHEN titles_aliases::text != '[]'
		THEN (
			SELECT tsvector_agg(to_tsvector('public.unaccent_conf', aliasesj))
			FROM kara k2, jsonb_array_elements(titles_aliases) aliasesj
			WHERE k2.pk_kid = k.pk_kid
			GROUP BY k2.pk_kid
		)
		ELSE to_tsvector('public.unaccent_conf', '')
		END
${kid ? 'WHERE pk_kid = ANY ($1)' : ''}
;
`;

export const sqlUpdateKaraParentsSearchVector = (kid?: boolean) => `
UPDATE all_karas ak
SET search_vector_parents = search_vector || (
    SELECT tsvector_agg(akp.search_vector)
    FROM all_karas akp
    LEFT JOIN kara_relation kr ON kr.fk_kid_child = akp.pk_kid
    WHERE kr.fk_kid_parent = ak.pk_kid
    )
WHERE ${kid ? ' ak.pk_kid = ANY ($1)' : ' 1 = 1'}
;
`;

export const sqlRefreshKaraTable = (
	whereClauses: string[],
	additionalJoins: string[]
) => `
SELECT k.*,
	CASE WHEN MIN(kt.pk_tid::text) IS NULL THEN null ELSE jsonb_agg(DISTINCT json_build_object('tid', kt.pk_tid, 'short', kt.short, 'name', kt.name, 'aliases', kt.aliases, 'i18n', kt.i18n, 'priority', kt.priority, 'type_in_kara', ka.type, 'karafile_tag', kt.karafile_tag, 'repository', kt.repository, 'noLiveDownload', kt.nolivedownload)::jsonb) END as tags,
	 tsvector_agg(kt.tag_search_vector) || k.title_search_vector AS search_vector,
     to_tsvector('') as search_vector_parents,
	 CASE WHEN MIN(kt.pk_tid::text) IS NULL THEN ARRAY[]::text[] ELSE array_agg(DISTINCT kt.pk_tid::text || '~' || ka.type::text) END AS tid,
	 (select d.list
		from kara k2
		CROSS JOIN LATERAL (
			select string_agg(DISTINCT lower(unaccent(d.elem::text)),' ' ORDER BY lower(unaccent(d.elem::text))) AS list
			FROM jsonb_array_elements_text(jsonb_path_query_array( k.titles, '$.keyvalue().value')) AS d(elem)
		) d WHERE k2.pk_kid = k.pk_kid) AS titles_sortable,
  string_agg(DISTINCT lower(unaccent(tlang.name)), ', ' ORDER BY lower(unaccent(tlang.name))) AS languages_sortable,
  string_agg(DISTINCT lower(unaccent(tsongtype.name)), ', ' ORDER BY lower(unaccent(tsongtype.name))) AS songtypes_sortable,
  COALESCE(string_agg(DISTINCT lower(unaccent(tserie.name)), ', ' ORDER BY lower(unaccent(tserie.name))), string_agg(DISTINCT lower(unaccent(tsinger.name)), ', ' ORDER BY lower(unaccent(tsinger.name)))) AS serie_singer_sortable

FROM kara k

LEFT JOIN kara_tag ka on k.pk_kid = ka.fk_kid
LEFT JOIN tag kt on ka.fk_tid = kt.pk_tid

LEFT JOIN kara_tag kl on k.pk_kid = kl.fk_kid and kl.type = 5
LEFT JOIN tag tlang on kl.fk_tid = tlang.pk_tid

LEFT JOIN kara_tag ks on k.pk_kid = ks.fk_kid and ks.type = 1
LEFT JOIN tag tserie on ks.fk_tid = tserie.pk_tid

LEFT JOIN kara_tag s on k.pk_kid = s.fk_kid and s.type = 2
LEFT JOIN tag tsinger on s.fk_tid = tsinger.pk_tid

LEFT JOIN kara_tag ks2 on k.pk_kid = ks2.fk_kid and ks2.type = 3
LEFT JOIN tag tsongtype on ks2.fk_tid = tsongtype.pk_tid

${additionalJoins.join('\n')}
WHERE 1 = 1
 ${whereClauses.join('\n')}
GROUP BY k.pk_kid
`;

export const sqlCreateKaraIndexes = `
create index idx_ak_search_vector
    on all_karas using gin (search_vector);

create index idx_ak_created
    on all_karas (created_at desc);

create index idx_ak_songtypes
    on all_karas (songtypes_sortable desc);

create index idx_ak_songorder
    on all_karas (songorder);

create index idx_ak_title
    on all_karas (titles_sortable);

create index idx_ak_series_singers
    on all_karas (serie_singer_sortable);

create index idx_ak_language
    on all_karas (languages_sortable);

create index idx_ak_year
    on all_karas (year);

create UNIQUE index idx_ak_kid
    on all_karas (pk_kid);

create index idx_ak_search_vector_parents
	on all_karas using gin (search_vector_parents);
`;

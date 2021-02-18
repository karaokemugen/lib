export const sqlUpdateTagSearchVector = `
UPDATE tag SET tag_search_vector = to_tsvector(name) ||
to_tsvector(regexp_replace(
               regexp_replace(i18n::text, '".+?": "(.+?)"'::text, '1'::text, 'g'::text),
               '[[{}],]'::text, ''::text, 'g'::text)) ||
to_tsvector(btrim(regexp_replace(aliases::text, '[],["]'::text, ''::text,
                                        'g'::text)))

`;
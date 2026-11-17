-- "Ask your notes" stays hidden until it has been tried on real phones.
insert into public.feature_flags (key, enabled, description)
values ('ask', false, 'Ask your notes: answers from an on-phone language model')
on conflict (key) do nothing;

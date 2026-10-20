-- Gmail, website chat and Threads as connectable channels
alter table public.social_accounts drop constraint social_accounts_provider_check;
alter table public.social_accounts add constraint social_accounts_provider_check
  check (provider in ('instagram','facebook','whatsapp','google_business','youtube','linkedin','tiktok','x','threads','gmail','website'));

-- Publish due scheduled posts every minute
create extension if not exists pg_cron;
select cron.schedule('publish-due-posts', '* * * * *', $$select app_private.process_due_posts()$$);

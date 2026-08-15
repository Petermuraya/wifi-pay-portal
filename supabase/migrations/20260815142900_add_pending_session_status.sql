-- Enum changes are isolated so PostgreSQL commits the new value before later migrations use it.
do $$
begin
  create type public.session_status as enum ('pending', 'active', 'expired', 'terminated');
exception when duplicate_object then null;
end $$;

alter type public.session_status add value if not exists 'pending';

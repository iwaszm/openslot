begin;

-- `blocked_slots` has been removed. Remove every historical overload rather
-- than leaving a function that only fails when somebody invokes it.
do $$
declare
  legacy_function regprocedure;
begin
  for legacy_function in
    select procedure.oid::regprocedure
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'create_admin_block'
  loop
    execute format('drop function %s', legacy_function);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';

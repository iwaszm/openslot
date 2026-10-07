-- Read-only production schema audit for OpenSlot.
-- Run in Supabase SQL Editor and return the single JSON value to the repository maintainer.

with
expected_migrations(version) as (
  values
    ('20260913103414'), ('20260913143316'), ('20260913143501'), ('20260913170000'),
    ('20260914090000'), ('20260915090000'), ('20260917120000'), ('20260920120000'),
    ('20260920130000'), ('20260920140000'), ('20260920150000'), ('20260920160000'),
    ('20260922090000'), ('20260924090000'), ('20260925090000'), ('20260926090000'),
    ('20260926120000'), ('20260926130000'), ('20260926140000'), ('20260929100000'),
    ('20261003090000'), ('20261003100000'), ('20261003110000'), ('20261003120000'),
    ('20261004140000'), ('20261004150000'), ('20261004160000'), ('20261004170000'),
    ('20261004180000'), ('20261004190000'), ('20261004200000'), ('20261006100000')
),
expected_tables(table_name) as (
  values
    ('salons'), ('salon_members'), ('salon_staff'), ('staff_lanes'), ('staff_services'),
    ('service_categories'), ('services'), ('customers'), ('appointments'), ('schedule_entries'),
    ('admin_time_blocks'), ('shop_day_settings'), ('salon_weekly_hours'), ('public_holidays'),
    ('email_events'), ('push_subscriptions'), ('booking_push_dispatches')
),
expected_policy_tables(table_name) as (
  select table_name from expected_tables where table_name <> 'booking_push_dispatches'
),
expected_columns(table_name, column_name) as (
  values
    ('salons','slug'), ('salons','timezone'), ('salons','holiday_region'),
    ('salons','block_public_holidays'), ('salons','theme_preset'), ('salons','languages'),
    ('salons','admin_language'),
    ('salon_members','role'), ('salon_members','staff_id'),
    ('salon_staff','staff_key'), ('salon_staff','short_name'), ('salon_staff','display_color'),
    ('salon_staff','sort_order'), ('salon_staff','is_active'),
    ('salon_staff','accepts_online_bookings'),
    ('staff_lanes','staff_id'), ('staff_lanes','lane_key'), ('staff_lanes','sort_order'),
    ('staff_lanes','is_active'),
    ('staff_services','staff_id'), ('staff_services','service_id'),
    ('staff_services','is_active'), ('staff_services','accepts_online_bookings'),
    ('service_categories','legacy_key'), ('service_categories','name_en'),
    ('service_categories','name_zh'), ('service_categories','short_name'),
    ('service_categories','sort_order'), ('service_categories','is_active'),
    ('service_categories','accepts_online_bookings'),
    ('services','category_id'), ('services','short_name'), ('services','name_en'),
    ('services','name_zh'), ('services','duration_minutes'), ('services','booked_slots'),
    ('services','price_from'), ('services','slot_color'), ('services','sort_order'),
    ('services','is_active'), ('services','accepts_online_bookings'),
    ('appointments','lane_key'), ('appointments','occupied_slots'),
    ('appointments','service_snapshot'), ('appointments','cancellation_token'),
    ('schedule_entries','staff_id'), ('schedule_entries','staff_lane_id'),
    ('schedule_entries','covered_start'), ('schedule_entries','covered_end'),
    ('schedule_entries','occupied_slots'), ('schedule_entries','service_snapshot'),
    ('schedule_entries','note'), ('schedule_entries','entry_source'),
    ('admin_time_blocks','staff_id'), ('admin_time_blocks','block_date'),
    ('admin_time_blocks','start_time'), ('admin_time_blocks','end_time'),
    ('shop_day_settings','is_blocked_day'),
    ('public_holidays','region'), ('public_holidays','holiday_date'), ('public_holidays','source'),
    ('email_events','booking_id'), ('email_events','event_type'), ('email_events','recipient'),
    ('email_events','status'), ('email_events','resend_email_id'), ('email_events','error_message'),
    ('push_subscriptions','salon_id'), ('push_subscriptions','user_id'),
    ('booking_push_dispatches','booking_id')
),
expected_functions(function_name) as (
  values
    ('can_view_salon'), ('can_manage_salon'), ('can_edit_staff_lane'), ('is_openslot_admin'),
    ('get_effective_day_settings'), ('get_public_staff_services'), ('get_public_schedule'),
    ('get_public_occupied_slots'), ('create_public_booking_for_staff'),
    ('get_admin_day_snapshot'), ('create_admin_time_block'), ('delete_admin_time_block'),
    ('create_admin_schedule_entry'), ('cancel_admin_schedule_entry'),
    ('get_settings_snapshot'), ('update_salon_settings'), ('replace_salon_weekly_hours'),
    ('update_salon_staff_profile'), ('replace_staff_services'), ('save_service_category'),
    ('save_salon_service'), ('reorder_service_catalog'), ('build_service_snapshot'),
    ('generate_berlin_public_holidays'), ('cleanup_openslot_history'),
    ('enqueue_booking_customer_email')
),
expected_triggers(trigger_name) as (
  values
    ('appointments_sync_schedule_entry'), ('appointments_freeze_service_snapshot'),
    ('schedule_entries_freeze_service_snapshot'), ('appointments_require_online_service'),
    ('appointments_reject_admin_time_block'), ('schedule_entries_reject_admin_time_block'),
    ('schedule_entries_staff_access_guard'), ('provision_default_staff_lanes'),
    ('salon_weekly_hours_sync'), ('appointments_enqueue_customer_email')
),
expected_constraints(constraint_name) as (
  values
    ('schedule_entries_no_covered_overlap'),
    ('admin_time_blocks_global_no_overlap'),
    ('admin_time_blocks_staff_no_overlap'),
    ('public_holidays_region_date_key'),
    ('services_category_salon_fkey'),
    ('salon_staff_display_color_check'),
    ('salons_theme_preset_check'),
    ('salons_languages_check')
),
actual_migrations as (
  select version::text
  from supabase_migrations.schema_migrations
),
missing_tables as (
  select expected.table_name
  from expected_tables expected
  left join information_schema.tables actual
    on actual.table_schema = 'public' and actual.table_name = expected.table_name
  where actual.table_name is null
),
missing_columns as (
  select expected.table_name, expected.column_name
  from expected_columns expected
  left join information_schema.columns actual
    on actual.table_schema = 'public'
   and actual.table_name = expected.table_name
   and actual.column_name = expected.column_name
  where actual.column_name is null
),
missing_functions as (
  select expected.function_name
  from expected_functions expected
  where not exists (
    select 1
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public' and proc.proname = expected.function_name
  )
),
missing_triggers as (
  select expected.trigger_name
  from expected_triggers expected
  where not exists (
    select 1
    from pg_trigger trg
    where not trg.tgisinternal and trg.tgname = expected.trigger_name
  )
),
missing_constraints as (
  select expected.constraint_name
  from expected_constraints expected
  where not exists (
    select 1
    from pg_constraint constraint_row
    join pg_namespace namespace on namespace.oid = constraint_row.connamespace
    where namespace.nspname = 'public' and constraint_row.conname = expected.constraint_name
  )
),
rls_issues as (
  select class.relname as table_name
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  join expected_tables expected on expected.table_name = class.relname
  where namespace.nspname = 'public'
    and class.relkind = 'r'
    and not class.relrowsecurity
),
policy_issues as (
  select expected.table_name
  from expected_policy_tables expected
  where not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public' and policy.tablename = expected.table_name
  )
),
function_inventory as (
  select
    proc.proname as function_name,
    pg_get_function_identity_arguments(proc.oid) as arguments,
    proc.prosecdef as security_definer
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  join expected_functions expected on expected.function_name = proc.proname
  where namespace.nspname = 'public'
),
policy_inventory as (
  select tablename, policyname, cmd, roles
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from expected_tables)
)
select jsonb_pretty(jsonb_build_object(
  'generated_at', now(),
  'database_version', current_setting('server_version'),
  'migration_history', jsonb_build_object(
    'expected_count', (select count(*) from expected_migrations),
    'recorded_count', (select count(*) from actual_migrations where version in (select version from expected_migrations)),
    'missing_versions', coalesce((
      select jsonb_agg(expected.version order by expected.version)
      from expected_migrations expected
      left join actual_migrations actual using (version)
      where actual.version is null
    ), '[]'::jsonb),
    'unexpected_versions', coalesce((
      select jsonb_agg(actual.version order by actual.version)
      from actual_migrations actual
      left join expected_migrations expected using (version)
      where expected.version is null
    ), '[]'::jsonb)
  ),
  'missing_tables', coalesce((select jsonb_agg(table_name order by table_name) from missing_tables), '[]'::jsonb),
  'missing_columns', coalesce((select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name) order by table_name, column_name) from missing_columns), '[]'::jsonb),
  'missing_functions', coalesce((select jsonb_agg(function_name order by function_name) from missing_functions), '[]'::jsonb),
  'missing_triggers', coalesce((select jsonb_agg(trigger_name order by trigger_name) from missing_triggers), '[]'::jsonb),
  'missing_constraints', coalesce((select jsonb_agg(constraint_name order by constraint_name) from missing_constraints), '[]'::jsonb),
  'rls_disabled', coalesce((select jsonb_agg(table_name order by table_name) from rls_issues), '[]'::jsonb),
  'tables_without_policy', coalesce((select jsonb_agg(table_name order by table_name) from policy_issues), '[]'::jsonb),
  'extensions', coalesce((
    select jsonb_agg(extname order by extname)
    from pg_extension
    where extname in ('pgcrypto', 'btree_gist', 'pg_cron', 'pg_net')
  ), '[]'::jsonb),
  'legacy_objects', jsonb_build_object(
    'blocked_slots_table', to_regclass('public.blocked_slots') is not null,
    'staff_slot_overrides_table', to_regclass('public.staff_slot_overrides') is not null,
    'create_admin_block_function', exists (
      select 1 from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public' and proc.proname = 'create_admin_block'
    )
  ),
  'function_inventory', coalesce((
    select jsonb_agg(to_jsonb(function_inventory) order by function_name, arguments)
    from function_inventory
  ), '[]'::jsonb),
  'policy_inventory', coalesce((
    select jsonb_agg(to_jsonb(policy_inventory) order by tablename, policyname)
    from policy_inventory
  ), '[]'::jsonb)
)) as reconciliation_report;

-- Repair FSW managers whose profile role was not synchronised to the workspace membership table.
-- FSW is a single-account deployment. Managers and administrators must have a matching
-- account membership to create courses and use the video editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_profile_account_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
  v_account_count bigint;
  v_membership_role text;
BEGIN
  SELECT count(*)
  INTO v_account_count
  FROM public.accounts;

  IF v_account_count <> 1 THEN
    RAISE EXCEPTION
      'Cannot synchronise manager workspace membership: expected exactly one FSW account, found %',
      v_account_count
      USING errcode = 'P0001';
  END IF;

  SELECT id
  INTO v_account_id
  FROM public.accounts
  LIMIT 1;

  IF new.role IN ('manager', 'admin') THEN
    v_membership_role := CASE
      WHEN new.role = 'admin' THEN 'admin'
      ELSE 'manager'
    END;

    INSERT INTO public.account_memberships (account_id, user_id, role)
    VALUES (v_account_id, new.id, v_membership_role)
    ON CONFLICT (account_id, user_id)
    DO UPDATE SET role = excluded.role;
  ELSIF TG_OP = 'UPDATE' AND old.role IN ('manager', 'admin') THEN
    -- A global profile demotion must also revoke elevated tenant access.
    DELETE FROM public.account_memberships
    WHERE user_id = new.id
      AND role IN ('manager', 'admin');
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_account_membership_on_role_change
ON public.profiles;

CREATE TRIGGER sync_profile_account_membership_on_role_change
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_account_membership();

DO $$
DECLARE
  v_account_id uuid;
  v_account_count bigint;
BEGIN
  SELECT count(*)
  INTO v_account_count
  FROM public.accounts;

  IF v_account_count <> 1 THEN
    RAISE EXCEPTION
      'Cannot repair manager workspace memberships: expected exactly one FSW account, found %',
      v_account_count;
  END IF;

  SELECT id
  INTO v_account_id
  FROM public.accounts
  LIMIT 1;

  INSERT INTO public.account_memberships (account_id, user_id, role)
  SELECT
    v_account_id,
    profile.id,
    CASE WHEN profile.role = 'admin' THEN 'admin' ELSE 'manager' END
  FROM public.profiles AS profile
  WHERE profile.role IN ('manager', 'admin')
  ON CONFLICT (account_id, user_id)
  DO UPDATE SET role = excluded.role;
END;
$$;

COMMIT;

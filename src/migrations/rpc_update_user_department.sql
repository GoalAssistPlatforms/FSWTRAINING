-- Function to allow managers to update another user's department, bypassing RLS safe-guards
CREATE OR REPLACE FUNCTION update_user_department(p_user_id uuid, p_department text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Ensures it runs with elevated privileges to bypass RLS on profiles
AS $$
DECLARE
    v_caller_role text;
BEGIN
    -- Verify the caller is a manager
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    
    IF v_caller_role != 'manager' THEN
        RAISE EXCEPTION 'Unauthorized: Only managers can update departments.';
    END IF;

    -- Update the target user's profile
    UPDATE profiles
    SET department = p_department
    WHERE id = p_user_id;
END;
$$;

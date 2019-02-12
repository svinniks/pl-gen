CREATE OR REPLACE TRIGGER after_ddl
AFTER CREATE OR ALTER OR DROP OR COMMENT ON DATABASE
DISABLE
DECLARE
    
    CURSOR c_background_session IS
        SELECT 1
        FROM v$session sess,
             v$process proc
        WHERE sess.sid = SYS_CONTEXT('USERENV', 'SID')
              AND proc.addr = sess.paddr
              AND proc.pname IS NOT NULL;

BEGIN

    IF ora_dict_obj_owner = SYS_CONTEXT('USERENV', 'CURRENT_USER') THEN
        RETURN;
    END IF;
    
    FOR v_dummy IN c_background_session LOOP
        RETURN;
    END LOOP;
    
    synchronization.ddl_success(
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name
    );

END;
/


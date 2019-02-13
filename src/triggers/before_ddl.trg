CREATE OR REPLACE TRIGGER before_ddl
BEFORE CREATE OR ALTER OR DROP OR COMMENT ON DATABASE
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
    
    synchronization.ddl_start(
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name
    );
    
EXCEPTION
    WHEN OTHERS THEN    
        IF NOT error$.handled THEN
            error$.handle;
        ELSE
            RAISE;
        END IF;    
END;
/


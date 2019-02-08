CREATE OR REPLACE TRIGGER after_ddl
AFTER CREATE OR ALTER OR DROP OR COMMENT ON DATABASE
DISABLE
BEGIN

    IF ora_dict_obj_owner = SYS_CONTEXT('USERENV', 'CURRENT_USER') THEN
        RETURN;
    END IF;
    
    synchronization.ddl_success(
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name
    );

END;
/


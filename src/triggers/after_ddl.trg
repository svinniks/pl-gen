CREATE OR REPLACE TRIGGER after_ddl
AFTER CREATE OR ALTER OR DROP OR COMMENT ON DATABASE
DISABLE
BEGIN

    IF ora_dict_obj_owner = $$PLSQL_UNIT_OWNER THEN
        RETURN;
    END IF;

    log$.debug(
        'AFTER #1 #2 #3.#4 (transaction #5)',
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name,
        DBMS_TRANSACTION.LOCAL_TRANSACTION_ID
    );

    synchronization.ddl_success(
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name,
        NULL
    );

END;
/


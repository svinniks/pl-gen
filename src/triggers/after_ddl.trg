CREATE OR REPLACE TRIGGER after_ddl
AFTER CREATE OR ALTER OR DROP ON DATABASE
DISABLE
BEGIN

    synchronization.ddl_success(
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name
    );

END;
/


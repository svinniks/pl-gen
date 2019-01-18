CREATE OR REPLACE TRIGGER before_ddl
BEFORE CREATE OR ALTER OR DROP ON DATABASE
DISABLE
BEGIN

    synchronization.ddl_start(
        ora_sysevent,
        ora_dict_obj_type,
        ora_dict_obj_owner,
        ora_dict_obj_name
    );

END;
/


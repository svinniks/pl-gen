CREATE OR REPLACE PACKAGE synchronization IS

    c_SESSION_SERIAL# CONSTANT NUMBER := DBMS_DEBUG_JDWP.CURRENT_SESSION_SERIAL;

    SUBTYPE STRING
        IS VARCHAR2(32767);

    PROCEDURE ddl_start (
        p_event IN VARCHAR2,
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    );
    
    PROCEDURE ddl_success (
        p_event IN VARCHAR2,
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    ); 
    
    PROCEDURE job (
        p_synchronize_ddl IN BOOLEAN,
        p_synchronization_timeout IN INTEGER
    );

END;
CREATE OR REPLACE PACKAGE synchronization IS

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
    
    PROCEDURE job;

END;
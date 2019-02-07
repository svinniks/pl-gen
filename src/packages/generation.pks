CREATE OR REPLACE PACKAGE generation IS

    SUBTYPE STRING IS
        VARCHAR2(32767);
        
    SUBTYPE STRINGN IS
        STRING
            NOT NULL;

    SUBTYPE BOOLEANN IS
        BOOLEAN
            NOT NULL;
            
    TYPE t_object_filter IS
        RECORD (
            operation CHAR,
            schema_pattern STRING,
            object_type STRING,
            object_pattern STRING
        );
        
    TYPE t_object_filters IS
        TABLE OF t_object_filter;
            
    TYPE t_generator_registration IS
        RECORD (
            generator t_generator,
            object_filters t_object_filters,
            state STRING,
            state_operation CHAR,
            state_schema_pattern STRING
        );
        
    TYPE t_generator_registrations IS
        TABLE OF t_generator_registration;
    
    PROCEDURE enable (
        p_synchronize_ddl IN BOOLEANN
    );
    
    PROCEDURE disable;
    
    FUNCTION enabled
    RETURN BOOLEAN;
    
    PROCEDURE reset;
    
    FUNCTION register_generator (
        p_generator IN t_generator
    )
    RETURN PLS_INTEGER;
    
    PROCEDURE include (
        p_registration_id IN POSITIVEN
    );
    
    PROCEDURE exclude (
        p_registration_id IN POSITIVEN
    );
    
    PROCEDURE schema (
        p_registration_id IN POSITIVEN,
        p_pattern IN STRINGN
    );
    
    PROCEDURE object (
        p_registration_id IN POSITIVEN,
        p_type IN STRINGN,
        p_pattern IN STRINGN
    );
    
    PROCEDURE object (
        p_registration_id IN POSITIVEN,
        p_pattern IN STRINGN
    );
    
    FUNCTION object_generators (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    )
    RETURN t_generators;
    
    PROCEDURE create_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    );
    
    PROCEDURE alter_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    );
    
    PROCEDURE drop_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    );
    
    PROCEDURE comment_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    );
    
    FUNCTION dump
    RETURN t_generator_registrations;

END;
CREATE OR REPLACE PACKAGE BODY generation IS

    v_generator_registrations t_generator_registrations;

    PROCEDURE register_messages IS
    BEGIN
        default_message_resolver.register_message('PGEN-00001', 'NULL generator specified!');
        default_message_resolver.register_message('PGEN-00002', 'Invalid registration ID=:1!');
        default_message_resolver.register_message('PGEN-00003', 'Operation (include/exclude) not specified!');
        default_message_resolver.register_message('PGEN-00004', 'Schema not specified!');
    END;
    
    PROCEDURE enable (
        p_synchronize_ddl IN BOOLEANN := TRUE,
        p_synchronization_timeout IN t_timeout := 20
    ) IS
    
        e_job_exists EXCEPTION;
        PRAGMA EXCEPTION_INIT(e_job_exists, -27477);
        
        FUNCTION format_job_action 
        RETURN VARCHAR2 IS
            v_result STRING;
        BEGIN
        
            v_result := 'BEGIN synchronization.job(';
            
            IF p_synchronize_ddl THEN
                v_result := v_result || 'TRUE';
            ELSE
                v_result := v_result || 'FALSE';
            END IF;
            
            RETURN v_result || ', ' || p_synchronization_timeout || '); END;';
        
        END;
        
    BEGIN
        
        BEGIN
            DBMS_SCHEDULER.CREATE_JOB(
                job_name => 'GENERATOR_EXECUTOR_JOB',
                job_type => 'PLSQL_BLOCK',
                job_action => format_job_action,
                repeat_interval => 'FREQ=SECONDLY;INTERVAL=1',
                enabled => TRUE
            );
        EXCEPTION
            WHEN e_job_exists THEN
                NULL;
        END;
        
        EXECUTE IMMEDIATE 'ALTER TRIGGER after_ddl ENABLE';
        EXECUTE IMMEDIATE 'ALTER TRIGGER before_ddl ENABLE';
        
    END;
    
    PROCEDURE disable IS
        e_job_not_exists EXCEPTION;
        PRAGMA EXCEPTION_INIT(e_job_not_exists, -27475);    
    BEGIN
        
        EXECUTE IMMEDIATE 'ALTER TRIGGER before_ddl DISABLE';
        EXECUTE IMMEDIATE 'ALTER TRIGGER after_ddl DISABLE';
    
        BEGIN
            DBMS_SCHEDULER.DROP_JOB(
                job_name => 'GENERATOR_EXECUTOR_JOB',
                force => TRUE
            );
        EXCEPTION
            WHEN e_job_not_exists THEN
                NULL;
        END;
    
    END;
        
    PROCEDURE reset IS
    BEGIN
        v_generator_registrations := t_generator_registrations();
    END;
    
    PROCEDURE init IS
    BEGIN
    
        reset;
        
        BEGIN
            EXECUTE IMMEDIATE 'BEGIN generation_init; END;';
        EXCEPTION
            WHEN OTHERS THEN
                error$.handle;
        END;    
    
    END;
    
    FUNCTION register_generator (
        p_generator IN t_generator
    )
    RETURN PLS_INTEGER IS
        v_registration t_generator_registration;
    BEGIN
        
        IF p_generator IS NULL THEN
            -- NULL generator specified!
            error$.raise('PGEN-00001');
        END IF;
        
        v_registration.generator := p_generator;
        v_registration.object_filters := t_object_filters();
        v_registration.state := 'wf_operation';
        
        v_generator_registrations.EXTEND(1);
        v_generator_registrations(v_generator_registrations.COUNT) := v_registration;
        
        RETURN v_generator_registrations.COUNT;
    
    END;
    
    PROCEDURE include (
        p_registration_id IN POSITIVEN
    ) IS
        v_registration t_generator_registration;
    BEGIN
        
        IF NOT v_generator_registrations.EXISTS(p_registration_id) THEN
            -- Invalid registration ID :1!
            error$.raise('PGEN-00002', p_registration_id);
        END IF;
    
        v_registration := v_generator_registrations(p_registration_id);
        v_registration.state_operation := 'I';
        v_registration.state := 'wf_schema';
        
        v_generator_registrations(p_registration_id) := v_registration;
    
    END;
    
    PROCEDURE exclude (
        p_registration_id IN POSITIVEN
    ) IS
        v_registration t_generator_registration;
    BEGIN
        
        IF NOT v_generator_registrations.EXISTS(p_registration_id) THEN
            -- Invalid registration ID :1!
            error$.raise('PGEN-00002', p_registration_id);
        END IF;
        
        v_registration := v_generator_registrations(p_registration_id);
        v_registration.state_operation := 'E';
        v_registration.state := 'wf_schema';
        
        v_generator_registrations(p_registration_id) := v_registration;
    
    END;
    
    PROCEDURE schema (
        p_registration_id IN POSITIVEN,
        p_pattern IN STRINGN
    ) IS
        v_registration t_generator_registration;
    BEGIN
        
        IF NOT v_generator_registrations.EXISTS(p_registration_id) THEN
            -- Invalid registration ID :1!
            error$.raise('PGEN-00002', p_registration_id);
        END IF;
        
        v_registration := v_generator_registrations(p_registration_id);
        
        IF v_registration.state NOT IN ('wf_schema', 'wf_object') THEN
            -- Operation (include/exclude) not specified!
            error$.raise('PGEN-00003');
        END IF;
        
        v_registration.state_schema_pattern := p_pattern;
        v_registration.state := 'wf_object';
        
        v_generator_registrations(p_registration_id) := v_registration;
    
    END;
    
    PROCEDURE do_object (
        p_registration_id IN POSITIVEN,
        p_type IN VARCHAR2,
        p_pattern IN VARCHAR2
    ) IS
        v_registration t_generator_registration;
        v_filter t_object_filter;    
    BEGIN
        
        IF NOT v_generator_registrations.EXISTS(p_registration_id) THEN
            -- Invalid registration ID :1!
            error$.raise('PGEN-00002', p_registration_id);
        END IF;
        
        v_registration := v_generator_registrations(p_registration_id);
        
        IF v_registration.state = 'wf_operation' THEN
            -- Operation (include/exclude) not specified!
            error$.raise('PGEN-00003');
        ELSIF v_registration.state = 'wf_schema' THEN
            -- Schema not specified!
            error$.raise('PGEN-00004');
        END IF;

        v_filter.operation := v_registration.state_operation;
        v_filter.schema_pattern := v_registration.state_schema_pattern;
        v_filter.object_type := p_type;
        v_filter.object_pattern := p_pattern;
        
        v_registration.object_filters.EXTEND(1);
        v_registration.object_filters(v_registration.object_filters.COUNT) := v_filter;
        
        v_generator_registrations(p_registration_id) := v_registration;
    
    END;
    
    PROCEDURE object (
        p_registration_id IN POSITIVEN,
        p_type IN STRINGN,
        p_pattern IN STRINGN
    ) IS
    BEGIN
        do_object(p_registration_id, p_type, p_pattern);
    END;
    
    PROCEDURE object (
        p_registration_id IN POSITIVEN,
        p_pattern IN STRINGN
    ) IS
    BEGIN
        do_object(p_registration_id, NULL, p_pattern);
    END;
    
    FUNCTION object_matches (
        p_registration IN t_generator_registration,
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    )
    RETURN BOOLEAN IS
        v_filter t_object_filter;
    BEGIN
    
        FOR v_i IN REVERSE 1..p_registration.object_filters.COUNT LOOP
            
            v_filter := p_registration.object_filters(v_i);
            
            IF REGEXP_LIKE(p_owner, v_filter.schema_pattern)
               AND (v_filter.object_type IS NULL OR p_type = v_filter.object_type)
               AND REGEXP_LIKE(p_name, v_filter.object_pattern)
            THEN
                RETURN v_filter.operation = 'I';
            END IF; 
        
        END LOOP;
    
        RETURN FALSE;
    
    END;
    
    FUNCTION object_generators (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    )
    RETURN t_generators IS
        v_generators t_generators;
        v_registration t_generator_registration;
    BEGIN
        
        v_generators := t_generators();
        
        FOR v_i IN 1..v_generator_registrations.COUNT LOOP
        
            v_registration := v_generator_registrations(v_i);
            
            IF object_matches(v_registration, p_type, p_owner, p_name) THEN
                v_generators.EXTEND(1);
                v_generators(v_generators.COUNT) := v_registration.generator;
            END IF;
            
        END LOOP;
        
        RETURN v_generators;
    
    END;
    
    PROCEDURE ddl_event (
        p_event IN VARCHAR2,
        p_object_type IN STRINGN,
        p_object_owner IN STRINGN,
        p_object_name IN STRINGN,
        p_user IN VARCHAR2 := USER,
        p_session_id IN NUMBER := SYS_CONTEXT('USERENV', 'SID'),
        p_session_serial# IN NUMBER := synchronization.c_SESSION_SERIAL#,
        p_transaction_id IN VARCHAR2 := DBMS_TRANSACTION.LOCAL_TRANSACTION_ID
    ) IS
        v_generators t_generators;
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
    
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'EVENT', p_event);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'OBJECT_TYPE', p_object_type);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'OBJECT_OWNER', p_object_owner);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'OBJECT_NAME', p_object_name);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'USER', p_user);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'SESSION_ID', p_session_id);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'SESSION_SERIAL#', p_session_serial#);
        DBMS_SESSION.SET_CONTEXT('GENERATION', 'TRANSACTION_ID', p_transaction_id);
    
        v_generators := object_generators(p_object_type, p_object_owner, p_object_name);
        
        FOR v_i IN 1..v_generators.COUNT LOOP
        
            BEGIN
            
                CASE p_event
                    WHEN 'CREATE' THEN 
                        v_generators(v_i).on_create_object(p_object_type, p_object_owner, p_object_name);
                    WHEN 'ALTER' THEN
                        v_generators(v_i).on_alter_object(p_object_type, p_object_owner, p_object_name);
                    WHEN 'DROP' THEN
                        v_generators(v_i).on_drop_object(p_object_type, p_object_owner, p_object_name);
                    WHEN 'COMMENT' THEN
                        v_generators(v_i).on_comment_object(p_object_type, p_object_owner, p_object_name);
                END CASE;
                
            EXCEPTION
                WHEN OTHERS THEN
                    error$.handle;
            END;
            
            COMMIT;
            
        END LOOP;
    
    END;
    
    PROCEDURE create_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    ) IS
    BEGIN
        ddl_event('CREATE', p_type, p_owner, p_name);
    END;
    
    PROCEDURE alter_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    ) IS
    BEGIN
        ddl_event('ALTER', p_type, p_owner, p_name);
    END;
    
    PROCEDURE drop_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    ) IS
    BEGIN
        ddl_event('DROP', p_type, p_owner, p_name);
    END;
    
    PROCEDURE comment_object (
        p_type IN STRINGN,
        p_owner IN STRINGN,
        p_name IN STRINGN
    ) IS
    BEGIN
        ddl_event('COMMENT', p_type, p_owner, p_name);
    END;
    
    FUNCTION dump
    RETURN t_generator_registrations IS
    BEGIN
        RETURN v_generator_registrations;
    END;
    
BEGIN
    register_messages;
    init;
END;
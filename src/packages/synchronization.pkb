CREATE OR REPLACE PACKAGE BODY synchronization IS

    c_NOTIFICATION_PIPE_NAME CONSTANT STRING := 'GENERATION$NOTIFICATION$PIPE';
    c_SESSION_SERIAL# CONSTANT NUMBER := DBMS_DEBUG_JDWP.CURRENT_SESSION_SERIAL;
    
    v_ddl_signature STRING;

    FUNCTION get_lock_handle (
        p_lock_name IN VARCHAR2
    ) 
    RETURN VARCHAR2 IS
        v_lock_handle STRING;
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        DBMS_LOCK.ALLOCATE_UNIQUE(p_lock_name, v_lock_handle);
        RETURN v_lock_handle;
    END;

    FUNCTION root_ddl
    RETURN BOOLEAN IS
    
        v_lock_name STRING;
        v_lock_handle STRING;
        v_lock_result INTEGER;
        
    BEGIN
    
        v_lock_name := 'SESSION$' || c_SESSION_SERIAL# || '$DDL$LOCK';
        v_lock_handle := get_lock_handle(v_lock_name);
        
        v_lock_result := DBMS_LOCK.REQUEST(
            lockhandle => v_lock_handle,
            timeout => 0,
            release_on_commit => TRUE
        );
        
        RETURN v_lock_result = 0;
    
    END;

    FUNCTION synchronize_ddl
    RETURN BOOLEAN IS
    BEGIN
        RETURN NVL(SYS_CONTEXT('GENERATION_CONTEXT', 'SYNCHRONIZE_DDL'), 'FALSE') = 'TRUE';
    END;
    
    FUNCTION ddl_signature (
        p_transaction_id IN VARCHAR2,
        p_event IN VARCHAR2,
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    )
    RETURN VARCHAR2 IS
    BEGIN
        RETURN p_transaction_id || '$' || p_event || '$' || p_type || '$"' || p_owner || '"$"' || p_name || '"';
    END;   
    
    PROCEDURE ddl_start (
        p_event IN VARCHAR2,
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    ) IS
    
        v_transaction_id STRING;
        v_in_pipe_name STRING;
        
        v_lock_name STRING;
        v_lock_result INTEGER;
        
        v_pipe_result INTEGER;
    
    BEGIN
    
        IF root_ddl THEN
        
            v_transaction_id := DBMS_TRANSACTION.LOCAL_TRANSACTION_ID;
            v_in_pipe_name := v_transaction_id || '$GENERATION$IN$PIPE';
            
            v_ddl_signature := ddl_signature(v_transaction_id, p_event, p_type, p_owner, p_name);
    
            v_lock_name := 'TRANSACTION$' || v_transaction_id || '$DDL$LOCK';
            v_lock_result := DBMS_LOCK.REQUEST(
                lockhandle => get_lock_handle(v_lock_name),
                release_on_commit => TRUE
            );
        
            DBMS_PIPE.PACK_MESSAGE(v_transaction_id);
            DBMS_PIPE.PACK_MESSAGE(p_event);
            DBMS_PIPE.PACK_MESSAGE(p_type);
            DBMS_PIPE.PACK_MESSAGE(p_owner);
            DBMS_PIPE.PACK_MESSAGE(p_name);
            
            v_pipe_result := DBMS_PIPE.SEND_MESSAGE(c_NOTIFICATION_PIPE_NAME);
        
            IF synchronize_ddl THEN
                v_pipe_result := DBMS_PIPE.RECEIVE_MESSAGE(v_in_pipe_name);
            END IF;
            
        END IF;
    
    END;
    
    PROCEDURE ddl_success (
        p_event IN VARCHAR2,
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    ) IS
    
        v_transaction_id STRING;
        v_out_pipe_name STRING;
        
        v_pipe_result INTEGER;
    
    BEGIN
    
        v_transaction_id := DBMS_TRANSACTION.LOCAL_TRANSACTION_ID;
        v_out_pipe_name := v_transaction_id || '$GENERATION$OUT$PIPE';
        
        IF ddl_signature(v_transaction_id, p_event, p_type, p_owner, p_name) = v_ddl_signature THEN
            v_pipe_result := DBMS_PIPE.SEND_MESSAGE(v_out_pipe_name);
        END IF;
    
    END;
        
    PROCEDURE job IS
    
        v_pipe_result INTEGER;
        
        v_transaction_id STRING;
        v_in_pipe_name STRING;
        v_out_pipe_name STRING;
        
        v_event STRING;
        v_type STRING;
        v_owner STRING;
        v_name STRING;
        
        v_lock_name STRING;
        v_lock_result INTEGER;
    
    BEGIN
        
        DBMS_PIPE.PURGE(c_NOTIFICATION_PIPE_NAME);
        generation.reset;
        
        BEGIN
            EXECUTE IMMEDIATE 'BEGIN generation_init; END;';
        EXCEPTION
            WHEN OTHERS THEN
                error$.handle;
        END;
        
        WHILE TRUE LOOP
        
            -- This is waiting for any request from the BEFORE_DDL to start a (root) DDL
            v_pipe_result := DBMS_PIPE.RECEIVE_MESSAGE(c_NOTIFICATION_PIPE_NAME);
            
            -- Message will contain DDL executor transaction ID. Two unique pipes
            -- are used to communicate between the job and DDL executor sessions.
            DBMS_PIPE.UNPACK_MESSAGE(v_transaction_id);
            v_in_pipe_name := v_transaction_id || '$GENERATION$IN$PIPE';
            v_out_pipe_name := v_transaction_id || '$GENERATION$OUT$PIPE';
            
            DBMS_PIPE.UNPACK_MESSAGE(v_event);
            DBMS_PIPE.UNPACK_MESSAGE(v_type);
            DBMS_PIPE.UNPACK_MESSAGE(v_owner);
            DBMS_PIPE.UNPACK_MESSAGE(v_name);
            
            IF synchronize_ddl THEN
                v_pipe_result := DBMS_PIPE.SEND_MESSAGE(v_in_pipe_name);
            END IF;
            
            v_lock_name := 'TRANSACTION$' || v_transaction_id || '$DDL$LOCK';
            v_lock_result := DBMS_LOCK.REQUEST(
                lockhandle => get_lock_handle(v_lock_name),
                release_on_commit => TRUE
            );
            
            v_pipe_result := DBMS_PIPE.RECEIVE_MESSAGE(v_out_pipe_name, 0);
            
            IF v_pipe_result = 0 THEN
                
                -- This is to disable synchronization and generation for
                -- DDLs being executed by the generators themselves.                
                v_lock_name := 'SESSION$' || c_SESSION_SERIAL# || '$DDL$LOCK';
                v_lock_result := DBMS_LOCK.REQUEST(
                    lockhandle => get_lock_handle(v_lock_name),
                    release_on_commit => TRUE
                );
            
                CASE v_event
                    WHEN 'CREATE' THEN
                        generation.create_object(v_type, v_owner, v_name);
                    WHEN 'ALTER' THEN
                        generation.alter_object(v_type, v_owner, v_name);
                    WHEN 'DROP' THEN
                        generation.drop_object(v_type, v_owner, v_name);
                    WHEN 'COMMENT' THEN
                        generation.comment_object(v_type, v_owner, v_name);
                    ELSE
                        NULL;
                END CASE;
            
                COMMIT;
            
            END IF;
            
        END LOOP;
    
    END;

END;
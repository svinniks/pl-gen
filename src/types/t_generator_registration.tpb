CREATE OR REPLACE TYPE BODY t_generator_registration IS 

    MEMBER FUNCTION include
    RETURN t_generator_registration IS
    BEGIN
        generation.include(id);
        RETURN self;
    END;
    
    MEMBER FUNCTION exclude
    RETURN t_generator_registration IS
    BEGIN
        generation.exclude(id);
        RETURN self;
    END;
    
    MEMBER FUNCTION schema (
        p_pattern IN VARCHAR2
    )
    RETURN t_generator_registration IS
    BEGIN
        generation.schema(id, p_pattern);
        RETURN self;
    END;
    
    MEMBER FUNCTION object (
        p_pattern IN VARCHAR2
    )
    RETURN t_generator_registration IS
    BEGIN
        generation.object(id, p_pattern);
        RETURN self;
    END;
    
    MEMBER PROCEDURE object (
        self IN t_generator_registration,
        p_pattern IN VARCHAR2
    ) IS
    BEGIN
        generation.object(id, p_pattern);
    END;
    
    MEMBER FUNCTION object (
        p_type IN VARCHAR2,
        p_pattern IN VARCHAR2
    )
    RETURN t_generator_registration IS
    BEGIN
        generation.object(id, p_type, p_pattern);
        RETURN self;
    END;
    
    MEMBER PROCEDURE object (
        self IN t_generator_registration,
        p_type IN VARCHAR2,
        p_pattern IN VARCHAR2
    ) IS
    BEGIN
        generation.object(id, p_type, p_pattern);
    END;

END;
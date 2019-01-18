CREATE OR REPLACE TYPE t_generator_registration IS OBJECT (

    id NUMBER,
    
    MEMBER FUNCTION include
    RETURN t_generator_registration,
    
    MEMBER FUNCTION exclude
    RETURN t_generator_registration,
    
    MEMBER FUNCTION schema (
        p_pattern IN VARCHAR2
    )
    RETURN t_generator_registration,
    
    MEMBER FUNCTION object (
        p_pattern IN VARCHAR2
    )
    RETURN t_generator_registration,
    
    MEMBER PROCEDURE object (
        self IN t_generator_registration,
        p_pattern IN VARCHAR2
    ),
    
    MEMBER FUNCTION object (
        p_type IN VARCHAR2,
        p_pattern IN VARCHAR2
    )
    RETURN t_generator_registration,
    
    MEMBER PROCEDURE object (
        self IN t_generator_registration,
        p_type IN VARCHAR2,
        p_pattern IN VARCHAR2
    )

)
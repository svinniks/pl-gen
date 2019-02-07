CREATE OR REPLACE TYPE t_generator IS OBJECT (

    dummy CHAR,
    
    NOT INSTANTIABLE MEMBER FUNCTION name
    RETURN VARCHAR2,
    
    NOT INSTANTIABLE MEMBER PROCEDURE on_create_object (
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    ),
    
    NOT INSTANTIABLE MEMBER PROCEDURE on_alter_object (
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    ),
    
    NOT INSTANTIABLE MEMBER PROCEDURE on_drop_object (
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    ),
    
    NOT INSTANTIABLE MEMBER PROCEDURE on_comment_object (
        p_type IN VARCHAR2,
        p_owner IN VARCHAR2,
        p_name IN VARCHAR2
    )

)
NOT INSTANTIABLE
NOT FINAL
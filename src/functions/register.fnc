CREATE OR REPLACE FUNCTION register (
    p_generator IN t_generator
)
RETURN t_generator_registration IS
BEGIN
    RETURN t_generator_registration(
        generation.register_generator(p_generator)
    );
END;    
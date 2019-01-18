info("T_JSON_BUILDER of PL-JSON-STORE must be exposed through the public synonym JSON_BUILDER in order to run this script!");

suite("Generation API", function() {

    let generatorTypeName = "GENERATOR_" + randomString(16);
    let generatorPackageName = "PACKAGE_" + randomString(16);

    setup("Create a generator implementation used in tests", function() {
        
        database.run(`
            BEGIN
                EXECUTE IMMEDIATE '
                    CREATE PACKAGE ${generatorPackageName} IS
                        
                        PROCEDURE reset_events;

                        PROCEDURE add_event (
                            p_event IN VARCHAR2
                        );

                        FUNCTION get_events
                        RETURN t_varchars;

                    END;
                ';    
            END;
        `);

        database.run(`
            BEGIN
                EXECUTE IMMEDIATE '
                    CREATE PACKAGE BODY ${generatorPackageName} IS
                        
                        v_events t_varchars;

                        PROCEDURE reset_events IS
                        BEGIN
                            v_events := t_varchars();
                        END;

                        PROCEDURE add_event (
                            p_event IN VARCHAR2
                        ) IS
                        BEGIN
                            v_events.EXTEND(1);
                            v_events(v_events.COUNT) := p_event;
                        END;

                        FUNCTION get_events
                        RETURN t_varchars IS
                        BEGIN
                            RETURN v_events;
                        END;

                    END;
                ';    
            END;
        `);

        database.run(`
            BEGIN
                EXECUTE IMMEDIATE '
                    CREATE TYPE ${generatorTypeName} UNDER t_generator (

                        OVERRIDING MEMBER FUNCTION name
                        RETURN VARCHAR2,

                        OVERRIDING MEMBER PROCEDURE on_create_object (
                            p_type IN VARCHAR2,
                            p_owner IN VARCHAR2,
                            p_name IN VARCHAR2
                        ),
                        
                        OVERRIDING MEMBER PROCEDURE on_alter_object (
                            p_type IN VARCHAR2,
                            p_owner IN VARCHAR2,
                            p_name IN VARCHAR2
                        ),
                        
                        OVERRIDING MEMBER PROCEDURE on_drop_object (
                            p_type IN VARCHAR2,
                            p_owner IN VARCHAR2,
                            p_name IN VARCHAR2
                        )

                    )
                ';
            END;
        `);   
        
        database.run(`
            BEGIN
                EXECUTE IMMEDIATE '
                    CREATE TYPE BODY ${generatorTypeName} IS

                        OVERRIDING MEMBER FUNCTION name
                        RETURN VARCHAR2 IS
                        BEGIN
                            RETURN $$PLSQL_UNIT_OWNER || ''.'' || $$PLSQL_UNIT;
                        END;

                        OVERRIDING MEMBER PROCEDURE on_create_object (
                            p_type IN VARCHAR2,
                            p_owner IN VARCHAR2,
                            p_name IN VARCHAR2
                        ) IS
                        BEGIN

                            IF dummy IS NULL THEN
                                RAISE NO_DATA_FOUND;
                            END IF;

                            ${generatorPackageName}.add_event(dummy || '' CREATE '' || p_type || '' '' || p_owner || '' '' || p_name);

                        END;
                        
                        OVERRIDING MEMBER PROCEDURE on_alter_object (
                            p_type IN VARCHAR2,
                            p_owner IN VARCHAR2,
                            p_name IN VARCHAR2
                        ) IS
                        BEGIN

                            IF dummy IS NULL THEN
                                RAISE NO_DATA_FOUND;
                            END IF;

                            ${generatorPackageName}.add_event(dummy || '' ALTER '' || p_type || '' '' || p_owner || '' '' || p_name);

                        END;
                        
                        OVERRIDING MEMBER PROCEDURE on_drop_object (
                            p_type IN VARCHAR2,
                            p_owner IN VARCHAR2,
                            p_name IN VARCHAR2
                        ) IS
                        BEGIN

                            IF dummy IS NULL THEN
                                RAISE NO_DATA_FOUND;
                            END IF;

                            ${generatorPackageName}.add_event(dummy || '' DROP '' || p_type || '' '' || p_owner || '' '' || p_name);

                        END;

                    END;
                ';
            END;
        `);  
    
    });

    suite("Generator registration", function() {

        let dumpWrapperFunctionName = "DUMP_" + randomString(16);
        
        setup("Create a wrapper function for dumping generation registrations", function() {
        
            database.run(`
                BEGIN
                    EXECUTE IMMEDIATE '
                        CREATE FUNCTION ${dumpWrapperFunctionName}
                        -- @json
                        RETURN CLOB IS
                            v_registrations generation.t_generator_registrations;
                            v_builder json_builder;
                        BEGIN

                            v_registrations := generation.dump;
                            v_builder := json_builder().array();

                            FOR v_i IN 1..v_registrations.COUNT LOOP

                                v_builder
                                    .object()
                                        .name(''generator'').object()
                                            .name(''dummy'').value(v_registrations(v_i).generator.dummy)
                                        .close()
                                        .name(''state'').value(v_registrations(v_i).state)
                                        .name(''object_filters'').array();

                                FOR v_j IN 1..v_registrations(v_i).object_filters.COUNT LOOP

                                    v_builder.object()
                                        .name(''operation'').value(v_registrations(v_i).object_filters(v_j).operation)
                                        .name(''schema_pattern'').value(v_registrations(v_i).object_filters(v_j).schema_pattern)
                                        .name(''object_type'').value(v_registrations(v_i).object_filters(v_j).object_type)
                                        .name(''object_pattern'').value(v_registrations(v_i).object_filters(v_j).object_pattern)
                                    .close();

                                END LOOP;

                                v_builder.close().close();

                            END LOOP;

                            RETURN v_builder.close().build_json_clob();

                        END;
                    ';                    
                END;
            `);
        
        });

        function dump() {
            return database.call(dumpWrapperFunctionName);
        }

        test("Try to register NULL generator", function() {
        
            expect(function() {
            
                database.run(`
                    DECLARE
                        v_dummy PLS_INTEGER;
                    BEGIN
                        v_dummy := generation.register_generator(NULL);                        
                    END;
                `);
            
            }).to.throw(/PGEN-00001/);
        
        });

        test("Register single generator, check registration dump", function() {
        
            database.call("generation.reset");

            let registrationId = database.selectValue(`
                    generation.register_generator(${generatorTypeName}('A'))
                FROM dual
            `);

            expect(registrationId).to.equal(1);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "A"
                    },
                    state: "wf_operation",
                    object_filters: []
                }
            ]);
        
        });

        test("Register single generator, reset registrations, check registration dump", function() {
        
            database.run(`
                DECLARE
                    v_dummy PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_dummy := generation.register_generator(${generatorTypeName}('A'));
                    generation.reset;
                END;
            `);
                
            expect(dump()).to.deep.equal([]);
        
        });

        test("Register multiple generators, check registration dump", function() {
        
            database.call("generation.reset");

            let registrationIds = database.selectValues(`
                    *
                FROM TABLE(t_numbers(
                         generation.register_generator(${generatorTypeName}('A')),
                         generation.register_generator(${generatorTypeName}('B')),
                         generation.register_generator(${generatorTypeName}('C'))
                     ))
            `);

            expect(registrationIds).to.deep.equal([1, 2, 3]);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "A"
                    },
                    state: "wf_operation",
                    object_filters: []
                },
                {
                    generator: {
                        dummy: "B"
                    },
                    state: "wf_operation",
                    object_filters: []
                },
                {
                    generator: {
                        dummy: "C"
                    },
                    state: "wf_operation",
                    object_filters: []
                }
            ]);
        
        });

        test("Try to call INCLUDE for a NULL or non-positive integer", function() {
        
            expect(function() {
                database.call("generation.include", {
                    p_registration_id: null
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.include", {
                    p_registration_id: -1
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.include", {
                    p_registration_id: 0
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.include", {
                    p_registration_id: 0.123
                });
            }).to.throw(/ORA-06502/);
        
        });
   
        test("Try to call INCLUDE for a non-existing registration ID", function() {
        
            expect(function() {
            
                database.run(`
                    BEGIN
                        generation.reset;
                        generation.include(999);                        
                    END;
                `);
            
            }).to.throw(/PGEN-00002.*999/);
        
        });
        
        test("Call INCLUDE for an existing registration", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.include(v_registration_id);
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_schema",
                    object_filters: []
                }
            ]);
        
        });

        test("Call INCLUDE twice in a row for an existing registration", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.include(v_registration_id);
                    generation.include(v_registration_id);
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_schema",
                    object_filters: []
                }
            ]);
        
        });

        test("Try to call EXCLUDE for a NULL or non-positive integer", function() {
        
            expect(function() {
                database.call("generation.exclude", {
                    p_registration_id: null
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.exclude", {
                    p_registration_id: -1
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.exclude", {
                    p_registration_id: 0
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.exclude", {
                    p_registration_id: 0.123
                });
            }).to.throw(/ORA-06502/);
        
        });
   
        test("Try to call EXCLUDE for a non-existing registration ID", function() {
        
            expect(function() {
            
                database.run(`
                    BEGIN
                        generation.reset;
                        generation.exclude(999);                        
                    END;
                `);
            
            }).to.throw(/PGEN-00002.*999/);
        
        });
        
        test("Call EXCLUDE for an existing registration", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.exclude(v_registration_id);
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_schema",
                    object_filters: []
                }
            ]);
        
        });

        test("Call EXCLUDE twice in a row for an existing registration", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.exclude(v_registration_id);
                    generation.exclude(v_registration_id);
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_schema",
                    object_filters: []
                }
            ]);
        
        });

        test("Try to call SCHEMA for a NULL or non-positive integer", function() {
        
            expect(function() {
                database.call("generation.schema", {
                    p_registration_id: null,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.schema", {
                    p_registration_id: -1,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.schema", {
                    p_registration_id: 0,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.schema", {
                    p_registration_id: 0.123,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);
        
        });

        test("Try to call SCHEMA for a NULL pattern", function() {
        
            expect(function() {
                database.call("generation.schema", {
                    p_registration_id: 1,
                    p_pattern: null
                });
            }).to.throw(/ORA-06502/);

        });
   
        test("Try to call SCHEMA for a non-existing registration ID", function() {
        
            expect(function() {
            
                database.run(`
                    BEGIN
                        generation.reset;
                        generation.schema(999, '.*');                        
                    END;
                `);
            
            }).to.throw(/PGEN-00002.*999/);
        
        });

        test("Try to call SCHEMA before INCLUDE/EXCLUDE", function() {
        
            expect(function() {
            
                database.run(`
                    DECLARE
                        v_registration_id PLS_INTEGER;
                    BEGIN
                        generation.reset;
                        v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                        generation.schema(v_registration_id, '.*');                        
                    END;
                `);
            
            }).to.throw(/PGEN-00003/);
        
        });

        test("Call SCHEMA after INCLUDE, check dump", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');                        
                END;
            `);
        
            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_object",
                    object_filters: []
                }
            ]);

        });
        
        test("Try to call OBJECT (two arguments) for a NULL or non-positive integer", function() {
        
            expect(function() {
                database.call("generation.object", {
                    p_registration_id: null,
                    p_type: "PACKAGE",
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.object", {
                    p_registration_id: -1,
                    p_type: "PACKAGE",
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.object", {
                    p_registration_id: 0,
                    p_type: "PACKAGE",
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call("generation.object", {
                    p_registration_id: 0.123,
                    p_type: "PACKAGE",
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);
        
        });

        test("Try to call OBJECT (one argument) for a NULL or non-positive integer", function() {
        
            expect(function() {
                database.call2("generation.object", {
                    p_registration_id: null,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call2("generation.object", {
                    p_registration_id: -1,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call2("generation.object", {
                    p_registration_id: 0,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

            expect(function() {
                database.call2("generation.object", {
                    p_registration_id: 0.123,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);
        
        });

        test("Try to call OBJECT (two arguments) for a NULL type", function() {
        
            expect(function() {
                database.call("generation.object", {
                    p_registration_id: 1,
                    p_type: null,
                    p_pattern: ".*"
                });
            }).to.throw(/ORA-06502/);

        });

        test("Try to call OBJECT (two arguments) for a NULL pattern", function() {
        
            expect(function() {
                database.call("generation.object", {
                    p_registration_id: 1,
                    p_type: "PACKAGE",
                    p_pattern: null
                });
            }).to.throw(/ORA-06502/);

        });

        test("Try to call OBJECT (one argument) for a NULL pattern", function() {
        
            expect(function() {
                database.call2("generation.object", {
                    p_registration_id: 1,
                    p_pattern: null
                });
            }).to.throw(/ORA-06502/);

        });
   
        test("Try to call OBJECT (two arguments) for a non-existing registration ID", function() {
        
            expect(function() {
            
                database.run(`
                    BEGIN
                        generation.reset;
                        generation.object(999, 'PACKAGE', '.*');                        
                    END;
                `);
            
            }).to.throw(/PGEN-00002.*999/);
        
        });

        test("Try to call OBJECT (one argument) for a non-existing registration ID", function() {
        
            expect(function() {
            
                database.run(`
                    BEGIN
                        generation.reset;
                        generation.object(999, '.*');                        
                    END;
                `);
            
            }).to.throw(/PGEN-00002.*999/);
        
        });

        test("Try to call OBJECT before INCLUDE/EXCLUDE", function() {
        
            expect(function() {
            
                database.run(`
                    DECLARE
                        v_registration_id PLS_INTEGER;
                    BEGIN
                        generation.reset;
                        v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                        generation.object(v_registration_id, 'PACKAGE', '.*');
                    END;
                `);
            
            }).to.throw(/PGEN-00003/);

        });

        test("Try to call OBJECT before SCHEMA", function() {
        
            expect(function() {
            
                database.run(`
                    DECLARE
                        v_registration_id PLS_INTEGER;
                    BEGIN
                        generation.reset;
                        v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                        generation.include(v_registration_id);
                        generation.object(v_registration_id, 'PACKAGE', '.*');
                    END;
                `);
            
            }).to.throw(/PGEN-00004/);

        });

        test("Call INCLUDE, SCHEMA, OBJECT (two arguments), check dump", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'PACKAGE', '.*');
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_object",
                    object_filters: [
                        {
                            operation: "I",
                            schema_pattern: ".*",
                            object_type: "PACKAGE",
                            object_pattern: ".*"
                        }
                    ]
                }
            ]);
        
        });

        test("Call EXCLUDE, SCHEMA, OBJECT (two arguments), check dump", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.exclude(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'PACKAGE', '.*');
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_object",
                    object_filters: [
                        {
                            operation: "E",
                            schema_pattern: ".*",
                            object_type: "PACKAGE",
                            object_pattern: ".*"
                        }
                    ]
                }
            ]);
        
        });

        test("Call EXCLUDE, SCHEMA, OBJECT (one argument), check dump", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.exclude(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_object",
                    object_filters: [
                        {
                            operation: "E",
                            schema_pattern: ".*",
                            object_type: null,
                            object_pattern: ".*"
                        }
                    ]
                }
            ]);
        
        });
        
        test("Call OBJECT multiple times in a row", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.exclude(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'PACKAGE', '.*');
                    generation.object(v_registration_id, 'VIEW', 'myview');
                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_object",
                    object_filters: [
                        {
                            operation: "E",
                            schema_pattern: ".*",
                            object_type: "PACKAGE",
                            object_pattern: ".*"
                        },
                        {
                            operation: "E",
                            schema_pattern: ".*",
                            object_type: "VIEW",
                            object_pattern: "myview"
                        }
                    ]
                }
            ]);
        
        });

        test("Complex example with multiple operations, schemas and objects", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN

                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                    generation.include(v_registration_id);
                    
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'TABLE', '.*');
                    generation.object(v_registration_id, 'VIEW', '.*');

                    generation.schema(v_registration_id, 'SCHEMA1');
                    generation.object(v_registration_id, 'PACKAGE', '^.*_IMPL$');
                    
                    generation.exclude(v_registration_id);

                    generation.schema(v_registration_id, 'SCHEMA1');
                    generation.object(v_registration_id, 'PACKAGE', 'IGNORE_IMPL');

                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'TABLE', '^.*_IMPL$');

                END;
            `);

            expect(dump()).to.deep.equal([
                {
                    generator: {
                        dummy: "X"
                    },
                    state: "wf_object",
                    object_filters: [
                        {
                            operation: "I",
                            schema_pattern: ".*",
                            object_type: "TABLE",
                            object_pattern: ".*"
                        },
                        {
                            operation: "I",
                            schema_pattern: ".*",
                            object_type: "VIEW",
                            object_pattern: ".*"
                        },
                        {
                            operation: "I",
                            schema_pattern: "SCHEMA1",
                            object_type: "PACKAGE",
                            object_pattern: "^.*_IMPL$"
                        },
                        {
                            operation: "E",
                            schema_pattern: "SCHEMA1",
                            object_type: "PACKAGE",
                            object_pattern: "IGNORE_IMPL"
                        },
                        {
                            operation: "E",
                            schema_pattern: ".*",
                            object_type: "TABLE",
                            object_pattern: "^.*_IMPL$"
                        }
                    ]
                }
            ]);
        
        });

        teardown("Drop the wrapper function", function() {
    
            database.run(`
                BEGIN
                    EXECUTE IMMEDIATE 'DROP FUNCTION ${dumpWrapperFunctionName}';                
                END;
            `);
        
        });
        
    });

    suite("Generator retrieval", function() {
    
        test("Try to call OBJECT_GENERATORS with a NULL argument", function() {
        
            expect(function() {
            
                database.run(`
                    DECLARE
                        v_generators t_generators;
                    BEGIN
                        v_generators := generation.object_generators(NULL, 'SCHEMA1', 'OBJECT1');
                    END;
                `);

            }).to.throw(/PLS-00567/);

            expect(function() {
            
                database.run(`
                    DECLARE
                        v_generators t_generators;
                    BEGIN
                        v_generators := generation.object_generators('PACKAGE', NULL, 'OBJECT1');
                    END;
                `);

            }).to.throw(/PLS-00567/);

            expect(function() {
            
                database.run(`
                    DECLARE
                        v_generators t_generators;
                    BEGIN
                        v_generators := generation.object_generators('PACKAGE', 'SCHEMA1', NULL);
                    END;
                `);

            }).to.throw(/PLS-00567/);
        
        });

        test("Check if object does not match if no filters are specified", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN

                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                END;
            `);

            let dummies = database.selectValues(`
                    dummy
                FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'OBJECT'))
            `);
        
            expect(dummies).to.deep.equal([]);

        });
        
        test("Single include with NULL type, wildcard schema and object", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN

                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');

                END;
            `);

            let dummies = database.selectValues(`
                    dummy
                FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'OBJECT'))
            `);
        
            expect(dummies).to.deep.equal(['X']);

        });

        test("Single include with defined type, wildcard schema and object, match", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN

                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'PACKAGE', '.*');

                END;
            `);

            let dummies = database.selectValues(`
                    dummy
                FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'OBJECT'))
            `);
        
            expect(dummies).to.deep.equal(['X']);

        });

        test("Single include with defined type, wildcard schema and object, type mismatch", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN

                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'PACKAGE', '.*');

                END;
            `);

            let dummies = database.selectValues(`
                    dummy
                FROM TABLE(generation.object_generators('VIEW', 'SCHEMA', 'OBJECT'))
            `);
        
            expect(dummies).to.deep.equal([]);

        });

        test("Single include with defined type, wildcard schema and defined object, object mismatch", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN

                    generation.reset;
                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, 'PACKAGE', 'MY_PACKAGE');

                END;
            `);

            let dummies = database.selectValues(`
                    dummy
                FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'MY_VIEW'))
            `);
        
            expect(dummies).to.deep.equal([]);

        });
        
    });

    test("Single include with defined type, schema and object, schema mismatch", function() {
        
        database.run(`
            DECLARE
                v_registration_id PLS_INTEGER;
            BEGIN

                generation.reset;
                v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                generation.include(v_registration_id);
                generation.schema(v_registration_id, 'MY_SCHEMA');
                generation.object(v_registration_id, 'PACKAGE', 'MY_PACKAGE');

            END;
        `);

        let dummies = database.selectValues(`
                dummy
            FROM TABLE(generation.object_generators('PACKAGE', 'YOUR_SCHEMA', 'MY_PACKAGE'))
         `);
    
        expect(dummies).to.deep.equal([]);

    });

    test("First include, then exclude", function() {
        
        database.run(`
            DECLARE
                v_registration_id PLS_INTEGER;
            BEGIN

                generation.reset;
                v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                generation.include(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

                generation.exclude(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

            END;
        `);

        let dummies = database.selectValues(`
                dummy
            FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'PACKAGE'))
         `);
    
        expect(dummies).to.deep.equal([]);

    });

    test("First exclude, then include", function() {
        
        database.run(`
            DECLARE
                v_registration_id PLS_INTEGER;
            BEGIN

                generation.reset;
                v_registration_id := generation.register_generator(${generatorTypeName}('X'));

                generation.exclude(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

                generation.include(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

            END;
        `);

        let dummies = database.selectValues(`
                dummy
            FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'PACKAGE'))
         `);
    
        expect(dummies).to.deep.equal(['X']);

    });

    test("Multiple registrations", function() {
        
        database.run(`
            DECLARE
                v_registration_id PLS_INTEGER;
            BEGIN

                generation.reset;

                v_registration_id := generation.register_generator(${generatorTypeName}('A'));

                generation.exclude(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

                generation.include(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

                v_registration_id := generation.register_generator(${generatorTypeName}('B'));

                v_registration_id := generation.register_generator(${generatorTypeName}('C'));

                generation.include(v_registration_id);
                generation.schema(v_registration_id, '.*');
                generation.object(v_registration_id, '.*');

            END;
        `);

        let dummies = database.selectValues(`
                dummy
            FROM TABLE(generation.object_generators('PACKAGE', 'SCHEMA', 'PACKAGE'))
         `);
    
        expect(dummies).to.deep.equal(['A', 'C']);

    });

    suite("Generator invocation", function() {
    
        test("Register one empty generator, invoke CREATE_OBJECT, ALTER_OBJECT, DROP_OBJECT", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    
                    generation.reset;

                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    
                    ${generatorPackageName}.reset_events;
                    generation.create_object('TYPE1', 'SCHEMA1', 'OBJECT1');
                    generation.alter_object('TYPE2', 'SCHEMA2', 'OBJECT2');
                    generation.drop_object('TYPE3', 'SCHEMA3', 'OBJECT3');

                END;
            `);    

            let events = database.call(`${generatorPackageName}.get_events`);

            expect(events).to.deep.equal([]);
        
        });

        test("Register one wildcard generator, invoke CREATE_OBJECT, ALTER_OBJECT, DROP_OBJECT", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    
                    generation.reset;

                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');

                    ${generatorPackageName}.reset_events;
                    generation.create_object('TYPE1', 'SCHEMA1', 'OBJECT1');
                    generation.alter_object('TYPE2', 'SCHEMA2', 'OBJECT2');
                    generation.drop_object('TYPE3', 'SCHEMA3', 'OBJECT3');

                END;
            `);    

            let events = database.call(`${generatorPackageName}.get_events`);

            expect(events).to.deep.equal([
                "X CREATE TYPE1 SCHEMA1 OBJECT1",
                "X ALTER TYPE2 SCHEMA2 OBJECT2",
                "X DROP TYPE3 SCHEMA3 OBJECT3"
            ]);
        
        });

        test("Register multiple generators, invoke CREATE_OBJECT, ALTER_OBJECT, DROP_OBJECT", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    
                    generation.reset;

                    v_registration_id := generation.register_generator(${generatorTypeName}('A'));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');

                    v_registration_id := generation.register_generator(${generatorTypeName}('B'));
                    
                    v_registration_id := generation.register_generator(${generatorTypeName}('C'));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');

                    ${generatorPackageName}.reset_events;
                    generation.create_object('TYPE1', 'SCHEMA1', 'OBJECT1');
                    generation.alter_object('TYPE2', 'SCHEMA2', 'OBJECT2');
                    generation.drop_object('TYPE3', 'SCHEMA3', 'OBJECT3');

                END;
            `);    

            let events = database.call(`${generatorPackageName}.get_events`);

            expect(events).to.deep.equal([
                "A CREATE TYPE1 SCHEMA1 OBJECT1",
                "C CREATE TYPE1 SCHEMA1 OBJECT1",
                "A ALTER TYPE2 SCHEMA2 OBJECT2",
                "C ALTER TYPE2 SCHEMA2 OBJECT2",
                "A DROP TYPE3 SCHEMA3 OBJECT3",
                "C DROP TYPE3 SCHEMA3 OBJECT3"
            ]);
        
        });

        test("Check if one generator errors don't affect other generators", function() {
        
            database.run(`
                DECLARE
                    v_registration_id PLS_INTEGER;
                BEGIN
                    
                    generation.reset;

                    v_registration_id := generation.register_generator(${generatorTypeName}(NULL));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');

                    v_registration_id := generation.register_generator(${generatorTypeName}('X'));
                    generation.include(v_registration_id);
                    generation.schema(v_registration_id, '.*');
                    generation.object(v_registration_id, '.*');

                    ${generatorPackageName}.reset_events;
                    generation.create_object('TYPE1', 'SCHEMA1', 'OBJECT1');
                    generation.alter_object('TYPE2', 'SCHEMA2', 'OBJECT2');
                    generation.drop_object('TYPE3', 'SCHEMA3', 'OBJECT3');

                END;
            `);    

            let events = database.call(`${generatorPackageName}.get_events`);

            expect(events).to.deep.equal([
                "X CREATE TYPE1 SCHEMA1 OBJECT1",
                "X ALTER TYPE2 SCHEMA2 OBJECT2",
                "X DROP TYPE3 SCHEMA3 OBJECT3"
            ]);
        
        });
    
    });
    
    teardown("Drop the generator implementation", function() {
        
        database.run(`
            BEGIN
                EXECUTE IMMEDIATE 'DROP TYPE ${generatorTypeName}';                
                EXECUTE IMMEDIATE 'DROP PACKAGE ${generatorPackageName}';                
            END;
        `);
    
    });

});
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando la creación de objetos de base de datos avanzados...');

  // 1. Creación de las 2 Vistas
  console.log('Creando vistas...');
  
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE VIEW v_student_grades AS
    SELECT 
        u.id AS student_id,
        u.name AS student_name,
        u.email AS student_email,
        p.id AS practice_id,
        p.title AS practice_title,
        c.name AS classroom_name,
        s."finalGrade" AS final_grade,
        s."reviewStatus" AS status
    FROM "User" u
    JOIN "Submission" s ON u.id = s."userId"
    JOIN "Practice" p ON s."practiceId" = p.id
    JOIN "Classroom" c ON p."classroomId" = c.id;
  `);
  console.log('✓ Vista v_student_grades creada con éxito.');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE VIEW v_classroom_stats AS
    SELECT 
        c.id AS classroom_id,
        c.name AS classroom_name,
        c.group AS classroom_group,
        COUNT(distinct e."userId") AS enrolled_students,
        COUNT(distinct s.id) AS total_submissions,
        AVG(s."finalGrade") AS average_grade
    FROM "Classroom" c
    LEFT JOIN "Enrollment" e ON c.id = e."classroomId"
    LEFT JOIN "Practice" p ON c.id = p."classroomId"
    LEFT JOIN "Submission" s ON p.id = s."practiceId"
    GROUP BY c.id, c.name, c.group;
  `);
  console.log('✓ Vista v_classroom_stats creada con éxito.');

  // 2. Creación de las 2 Stored Functions
  console.log('Creando funciones almacenadas (Stored Functions)...');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION fn_get_student_average(student_uuid VARCHAR)
    RETURNS NUMERIC AS $$
    DECLARE
        avg_grade NUMERIC;
    BEGIN
        SELECT COALESCE(AVG("finalGrade"), 0) INTO avg_grade
        FROM "Submission"
        WHERE "userId" = student_uuid;
        RETURN avg_grade;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('✓ Función fn_get_student_average creada con éxito.');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION fn_get_error_count(student_uuid VARCHAR)
    RETURNS INTEGER AS $$
    DECLARE
        error_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO error_count
        FROM "PracticeErrorLog"
        WHERE "userId" = student_uuid;
        RETURN error_count;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('✓ Función fn_get_error_count creada con éxito.');

  // 3. Creación de los 2 Stored Procedures
  console.log('Creando procedimientos almacenados (Stored Procedures)...');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE PROCEDURE sp_archive_classroom(classroom_uuid VARCHAR)
    AS $$
    BEGIN
        -- Archivar la clase
        UPDATE "Classroom" 
        SET "isArchived" = TRUE 
        WHERE id = classroom_uuid;
        
        -- Archivar inscripciones de alumnos
        UPDATE "Enrollment" 
        SET "isArchived" = TRUE 
        WHERE "classroomId" = classroom_uuid;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('Procedimiento sp_archive_classroom creado con éxito.');


  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE PROCEDURE sp_clean_old_error_logs(days_old INTEGER)
    AS $$
    BEGIN
        DELETE FROM "PracticeErrorLog"
         WHERE "createdAt" < NOW() - INTERVAL '1 day' * days_old;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('Procedimiento sp_clean_old_error_logs creado con éxito.');

  // 4. Creación física de los roles y asignación de privilegios
  console.log('Creando roles físicos y asignando permisos...');
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rol_docente') THEN
            CREATE ROLE rol_docente;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rol_alumno') THEN
            CREATE ROLE rol_alumno;
        END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Classroom", "Practice", "ChecklistItem", "ChecklistEvaluation", "Submission" TO rol_docente;
  `);

  await prisma.$executeRawUnsafe(`
    GRANT SELECT ON "Classroom", "Practice" TO rol_alumno;
  `);

  await prisma.$executeRawUnsafe(`
    GRANT SELECT, INSERT, UPDATE ON "Submission", "SubmissionStep", "PracticeErrorLog" TO rol_alumno;
  `);
  console.log('Roles y privilegios configurados con éxito.');

  console.log('Todos los objetos avanzados de la base de datos se crearon e instalaron con éxito.');
}

main()
  .catch((e) => {
    console.error('Error al instalar los objetos en la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

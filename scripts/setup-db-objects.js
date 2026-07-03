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
        s.final_grade AS final_grade,
        s.review_status AS status
    FROM "User" u
    JOIN "Submission" s ON u.id = s.user_id
    JOIN "Practice" p ON s.practice_id = p.id
    JOIN "Classroom" c ON p.classroom_id = c.id;
  `);
  console.log('✓ Vista v_student_grades creada con éxito.');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE VIEW v_classroom_stats AS
    SELECT 
        c.id AS classroom_id,
        c.name AS classroom_name,
        c.group AS classroom_group,
        COUNT(distinct e.user_id) AS enrolled_students,
        COUNT(distinct s.id) AS total_submissions,
        AVG(s.final_grade) AS average_grade
    FROM "Classroom" c
    LEFT JOIN "Enrollment" e ON c.id = e.classroom_id
    LEFT JOIN "Practice" p ON c.id = p.classroom_id
    LEFT JOIN "Submission" s ON p.id = s.practice_id
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
        SELECT COALESCE(AVG(final_grade), 0) INTO avg_grade
        FROM "Submission"
        WHERE user_id = student_uuid;
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
        WHERE user_id = student_uuid;
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
        SET is_archived = TRUE 
        WHERE id = classroom_uuid;
        
        -- Archivar inscripciones de alumnos
        UPDATE "Enrollment" 
        SET is_archived = TRUE 
        WHERE classroom_id = classroom_uuid;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('✓ Procedimiento sp_archive_classroom creado con éxito.');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE PROCEDURE sp_clean_old_error_logs(days_old INTEGER)
    AS $$
    BEGIN
        DELETE FROM "PracticeErrorLog"
        WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('✓ Procedimiento sp_clean_old_error_logs creado con éxito.');

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

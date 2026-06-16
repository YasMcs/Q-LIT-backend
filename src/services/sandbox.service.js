export const executeMockQuery = async (sqlQuery, activeDb) => {
  const upperQuery = sqlQuery.toUpperCase();

  // 1. Simulación de permisos DDL (Bloqueo)
  if (upperQuery.includes("CREATE ") || upperQuery.includes("ALTER ") || upperQuery.includes("DROP ")) {
    throw new Error("ERROR 1142 (42000): Permisos denegados. No puedes alterar la estructura de la base de datos.");
  }

  // 2. Simulación DML (Modificaciones permitidas pero protegidas por "rollback")
  if (upperQuery.includes("INSERT ") || upperQuery.includes("UPDATE ") || upperQuery.includes("DELETE ")) {
    return {
      success: true,
      type: "DML",
      message: "Consulta ejecutada con éxito (1 row affected). Los cambios fueron revertidos automáticamente por seguridad (Rollback).",
      columns: [],
      rows: []
    };
  }

  // 3. Simulación DQL (Consultas SELECT)
  if (upperQuery.includes("SELECT ")) {
    let mockColumns = [];
    let mockRows = [];

    // Lógica básica para devolver datos según la DB seleccionada
    if (activeDb === "punto_venta_db") {
      mockColumns = ["sku", "articulo", "precio", "stock"];
      mockRows = [
        { sku: 109, articulo: "Monitor Gamer 24 Curvo", precio: 245.50, stock: 15 },
        { sku: 104, articulo: "Teclado Mecánico RGB", precio: 89.99, stock: 30 },
        { sku: 112, articulo: "Mouse Inalámbrico", precio: 55.00, stock: 45 }
      ];
    } else if (activeDb === "control_escolar_db") {
      mockColumns = ["id_alumno", "nombre", "materia", "grupo"];
      mockRows = [
        { id_alumno: 1, nombre: "Ana López", materia: "Matemáticas", grupo: "A" },
        { id_alumno: 2, nombre: "Carlos Ruiz", materia: "Física", grupo: "B" },
        { id_alumno: 3, nombre: "María Pérez", materia: "Historia", grupo: "A" }
      ];
    } else if (activeDb === "hospital_central_db") {
      mockColumns = ["id_cita", "fecha", "hora", "especialidad"];
      mockRows = [
        { id_cita: 1001, fecha: "2023-11-20", hora: "09:00", especialidad: "Cardiología" },
        { id_cita: 1002, fecha: "2023-11-20", hora: "10:30", especialidad: "Traumatología" },
        { id_cita: 1003, fecha: "2023-11-21", hora: "08:15", especialidad: "Pediatría" }
      ];
    }

    return {
      success: true,
      type: "DQL",
      message: "Consulta de lectura exitosa.",
      columns: mockColumns,
      rows: mockRows
    };
  }

  // Si no es un comando reconocido o tiene error de sintaxis simulado
  throw new Error("ERROR 1064 (42000): Tienes un error en tu sintaxis SQL. Revisa la documentación de MySQL para usar la sintaxis correcta.");
};

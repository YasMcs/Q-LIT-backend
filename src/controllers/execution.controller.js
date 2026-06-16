import { executeMockQuery } from '../services/sandbox.service.js';

export const executePracticeQuery = async (req, res, next) => {
  try {
    const { practiceId } = req.params;
    const { sqlQuery, activeDb } = req.body;

    if (!sqlQuery || !sqlQuery.trim()) {
      return res.status(400).json({ error: { message: "La consulta SQL no puede estar vacía." } });
    }

    // Call the sandbox simulator
    const result = await executeMockQuery(sqlQuery, activeDb || "punto_venta_db");

    return res.status(200).json({
      status: "success",
      data: result
    });
  } catch (error) {
    // Return formatted error for frontend terminal
    return res.status(400).json({
      status: "error",
      error: { message: error.message }
    });
  }
};

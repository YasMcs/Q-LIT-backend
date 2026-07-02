import { z } from 'zod';

const checklistItemSchema = z.object({
  id: z.string().min(1, "El ID del item de checklist es requerido"),
  criterion: z.string().optional(),
  text: z.string().optional(),
  maxPoints: z.number().positive(),
});

export const evaluateSubmissionSchema = z.object({
  studentSqlCode: z.string().min(1, "El código SQL no puede estar vacío"),
  submissionId: z.string().min(1).optional(),
  practiceId: z.string().min(1).optional(),
});

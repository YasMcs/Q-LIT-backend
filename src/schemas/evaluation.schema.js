import { z } from 'zod';

const checklistItemSchema = z.object({
  id: z.number().int().positive(),
  criterion: z.string().optional(),
  text: z.string().optional(),
  maxPoints: z.number().positive(),
});

export const evaluateSubmissionSchema = z.object({
  studentSqlCode: z.string().min(1, "El código SQL no puede estar vacío"),
  practiceObjective: z.string().min(1, "El objetivo de la práctica es requerido"),
  checklist: z.array(checklistItemSchema).min(1, "El checklist debe contener al menos un elemento"),
  submissionId: z.number().int().positive().optional(),
  practiceId: z.number().int().positive().optional(),
});

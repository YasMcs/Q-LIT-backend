import { Router } from 'express';
import * as classroomController from '../controllers/classroom.controller.js';

const router = Router();

router.get('/', classroomController.getClassroomsByTeacher);
router.post('/', classroomController.createClassroom);

export default router;

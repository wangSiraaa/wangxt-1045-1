import { Router } from 'express';
import db from '../db.js';
import * as verificationService from '../services/verificationService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(verificationService.listAll());
});

router.get('/activity/:activityId', (req, res) => {
  res.json(verificationService.listByActivity(req.params.activityId));
});

export default router;

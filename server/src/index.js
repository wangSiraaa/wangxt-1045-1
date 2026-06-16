import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initDatabase } from './db.js';

import activitiesRouter from './routes/activities.js';
import seatsRouter from './routes/seats.js';
import groupsRouter from './routes/groups.js';
import ordersRouter from './routes/orders.js';
import paymentsRouter from './routes/payments.js';
import ticketsRouter from './routes/tickets.js';
import verificationsRouter from './routes/verifications.js';
import reconciliationsRouter from './routes/reconciliations.js';
import stateLogRouter from './routes/stateLog.js';
import blockbusterRouter from './routes/blockbuster.js';
import seatConflictsRouter from './routes/seatConflicts.js';
import manualAdjustRouter from './routes/manualAdjust.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function start() {
  await initDatabase();
  console.log('Database initialized');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/activities', activitiesRouter);
  app.use('/api/seats', seatsRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/verifications', verificationsRouter);
  app.use('/api/reconciliations', reconciliationsRouter);
  app.use('/api/state-log', stateLogRouter);
  app.use('/api/blockbuster', blockbusterRouter);
  app.use('/api/seat-conflicts', seatConflictsRouter);
  app.use('/api/manual-adjust', manualAdjustRouter);

  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

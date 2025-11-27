/**
 * Sistema de Background Jobs
 * Cola de tareas en memoria (en producción usar Bull/Redis)
 */

import logger from '../utils/logger.js';

// Tipos de jobs
export const JobTypes = {
  SEND_NOTIFICATION: 'send_notification',
  SEND_EMAIL: 'send_email',
  SEND_WHATSAPP: 'send_whatsapp',
  PROCESS_COUPON: 'process_coupon',
  UPDATE_STATS: 'update_stats',
  CLEANUP_SESSIONS: 'cleanup_sessions',
  SYNC_INVENTORY: 'sync_inventory',
  GENERATE_REPORT: 'generate_report',
  SEND_WEBHOOK: 'send_webhook',
};

class JobQueue {
  constructor() {
    this.queues = new Map(); // jobType -> Job[]
    this.handlers = new Map(); // jobType -> handler function
    this.processing = new Set();
    this.stats = {
      processed: 0,
      failed: 0,
      pending: 0,
    };
    this.isRunning = false;
    this.concurrency = 5;
  }

  /**
   * Registrar handler para un tipo de job
   */
  registerHandler(jobType, handler) {
    this.handlers.set(jobType, handler);
    if (!this.queues.has(jobType)) {
      this.queues.set(jobType, []);
    }
    logger.info({ jobType }, 'Job handler registered');
  }

  /**
   * Agregar job a la cola
   */
  async addJob(jobType, data, options = {}) {
    const {
      priority = 0,
      delay = 0,
      retries = 3,
      storeId = null,
    } = options;

    const job = {
      id: `${jobType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: jobType,
      data,
      storeId,
      priority,
      retries,
      retriesLeft: retries,
      createdAt: Date.now(),
      runAt: Date.now() + delay,
      status: 'pending',
    };

    if (!this.queues.has(jobType)) {
      this.queues.set(jobType, []);
    }

    const queue = this.queues.get(jobType);
    
    // Insertar ordenado por prioridad y runAt
    const insertIndex = queue.findIndex(
      j => j.priority < priority || (j.priority === priority && j.runAt > job.runAt)
    );
    
    if (insertIndex === -1) {
      queue.push(job);
    } else {
      queue.splice(insertIndex, 0, job);
    }

    this.stats.pending++;
    logger.debug({ jobId: job.id, jobType }, 'Job added to queue');
    
    // Procesar si no está corriendo
    if (this.isRunning) {
      this.processNext();
    }

    return job.id;
  }

  /**
   * Procesar siguiente job
   */
  async processNext() {
    if (this.processing.size >= this.concurrency) return;

    // Buscar próximo job listo para ejecutar
    const now = Date.now();
    let nextJob = null;
    let jobQueue = null;

    for (const [type, queue] of this.queues) {
      const readyJob = queue.find(
        j => j.status === 'pending' && j.runAt <= now && !this.processing.has(j.id)
      );
      
      if (readyJob && (!nextJob || readyJob.priority > nextJob.priority)) {
        nextJob = readyJob;
        jobQueue = queue;
      }
    }

    if (!nextJob) return;

    // Marcar como procesando
    nextJob.status = 'processing';
    this.processing.add(nextJob.id);

    try {
      const handler = this.handlers.get(nextJob.type);
      
      if (!handler) {
        throw new Error(`No handler for job type: ${nextJob.type}`);
      }

      logger.debug({ jobId: nextJob.id, jobType: nextJob.type }, 'Processing job');
      
      await handler(nextJob.data, nextJob);
      
      // Éxito
      nextJob.status = 'completed';
      nextJob.completedAt = Date.now();
      this.stats.processed++;
      this.stats.pending--;
      
      // Remover de la cola
      const index = jobQueue.indexOf(nextJob);
      if (index > -1) jobQueue.splice(index, 1);
      
      logger.debug({ jobId: nextJob.id, duration: nextJob.completedAt - nextJob.createdAt }, 'Job completed');
      
    } catch (error) {
      logger.error({ jobId: nextJob.id, error: error.message }, 'Job failed');
      
      nextJob.retriesLeft--;
      nextJob.lastError = error.message;
      
      if (nextJob.retriesLeft > 0) {
        // Reintentar con delay exponencial
        nextJob.status = 'pending';
        nextJob.runAt = Date.now() + (1000 * Math.pow(2, nextJob.retries - nextJob.retriesLeft));
        logger.debug({ jobId: nextJob.id, retriesLeft: nextJob.retriesLeft }, 'Job scheduled for retry');
      } else {
        // Sin más reintentos
        nextJob.status = 'failed';
        nextJob.failedAt = Date.now();
        this.stats.failed++;
        this.stats.pending--;
        
        // Remover de la cola
        const index = jobQueue.indexOf(nextJob);
        if (index > -1) jobQueue.splice(index, 1);
      }
    } finally {
      this.processing.delete(nextJob.id);
      
      // Procesar siguiente
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Iniciar procesamiento de la cola
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('Job queue started');
    
    // Procesar jobs pendientes cada segundo
    this.interval = setInterval(() => {
      this.processNext();
    }, 1000);
  }

  /**
   * Detener procesamiento
   */
  stop() {
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
    }
    logger.info('Job queue stopped');
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    let pending = 0;
    for (const queue of this.queues.values()) {
      pending += queue.filter(j => j.status === 'pending').length;
    }
    
    return {
      ...this.stats,
      pending,
      processing: this.processing.size,
      queues: Object.fromEntries(
        Array.from(this.queues.entries()).map(([type, queue]) => [
          type,
          { pending: queue.length, processing: queue.filter(j => j.status === 'processing').length }
        ])
      ),
    };
  }

  /**
   * Obtener jobs de una tienda
   */
  getStoreJobs(storeId) {
    const jobs = [];
    for (const queue of this.queues.values()) {
      jobs.push(...queue.filter(j => j.storeId === storeId));
    }
    return jobs;
  }
}

// Singleton
export const jobQueue = new JobQueue();

// Registrar handlers por defecto
jobQueue.registerHandler(JobTypes.SEND_NOTIFICATION, async (data) => {
  // TODO: Implementar envío de notificación push
  logger.info({ userId: data.userId, title: data.title }, 'Sending notification');
});

jobQueue.registerHandler(JobTypes.SEND_EMAIL, async (data) => {
  // TODO: Implementar envío de email
  logger.info({ to: data.to, subject: data.subject }, 'Sending email');
});

jobQueue.registerHandler(JobTypes.SEND_WHATSAPP, async (data) => {
  // TODO: Implementar envío de WhatsApp
  logger.info({ to: data.to }, 'Sending WhatsApp message');
});

jobQueue.registerHandler(JobTypes.UPDATE_STATS, async (data) => {
  // TODO: Actualizar estadísticas
  logger.info({ storeId: data.storeId }, 'Updating stats');
});

jobQueue.registerHandler(JobTypes.SEND_WEBHOOK, async (data) => {
  const { url, payload, headers = {} } = data;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status}`);
  }
  
  logger.info({ url, status: response.status }, 'Webhook sent');
});

export default jobQueue;


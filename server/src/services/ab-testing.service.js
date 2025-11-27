/**
 * Sistema de A/B Testing para Menú
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

class ABTestingService {
  /**
   * Crear experimento
   */
  async createExperiment(storeId, experimentData) {
    const { name, description, type, variants, trafficSplit, startDate, endDate } = experimentData;

    // Validar que los porcentajes sumen 100
    const totalSplit = variants.reduce((sum, v) => sum + v.trafficPercent, 0);
    if (totalSplit !== 100) throw new Error('Los porcentajes deben sumar 100');

    const experiment = await prisma.experiment.create({
      data: {
        storeId,
        name,
        description,
        type, // 'price', 'layout', 'image', 'description', 'order'
        status: 'draft',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        variants: JSON.stringify(variants),
        trafficSplit: JSON.stringify(trafficSplit || {}),
      },
    });

    logger.info({ experimentId: experiment.id, name }, 'Experiment created');
    return experiment;
  }

  /**
   * Iniciar experimento
   */
  async startExperiment(experimentId) {
    await prisma.experiment.update({
      where: { id: experimentId },
      data: { status: 'running', startDate: new Date() },
    });

    logger.info({ experimentId }, 'Experiment started');
    return { success: true };
  }

  /**
   * Asignar variante a usuario
   */
  async assignVariant(experimentId, userId) {
    const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
    
    if (!experiment || experiment.status !== 'running') return null;

    // Verificar si ya tiene asignación
    const existing = await prisma.experimentAssignment.findFirst({
      where: { experimentId, visitorId: userId },
    });

    if (existing) return existing.variant;

    // Asignar variante basado en hash determinístico
    const variants = JSON.parse(experiment.variants);
    const hash = crypto.createHash('md5').update(userId + experimentId).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16) % 100;

    let cumulative = 0;
    let assignedVariant = variants[0].id;

    for (const variant of variants) {
      cumulative += variant.trafficPercent;
      if (hashNum < cumulative) {
        assignedVariant = variant.id;
        break;
      }
    }

    // Guardar asignación
    await prisma.experimentAssignment.create({
      data: {
        experimentId,
        visitorId: userId,
        variant: assignedVariant,
      },
    });

    return assignedVariant;
  }

  /**
   * Registrar conversión
   */
  async trackConversion(experimentId, userId, conversionType, value = 1) {
    const assignment = await prisma.experimentAssignment.findFirst({
      where: { experimentId, visitorId: userId },
    });

    if (!assignment) return null;

    await prisma.experimentConversion.create({
      data: {
        experimentId,
        assignmentId: assignment.id,
        variant: assignment.variant,
        conversionType, // 'view', 'add_to_cart', 'purchase'
        value,
      },
    });

    return { tracked: true };
  }

  /**
   * Obtener resultados del experimento
   */
  async getExperimentResults(experimentId) {
    const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
    if (!experiment) throw new Error('Experimento no encontrado');

    const variants = JSON.parse(experiment.variants);
    const results = {};

    for (const variant of variants) {
      const assignments = await prisma.experimentAssignment.count({
        where: { experimentId, variant: variant.id },
      });

      const conversions = await prisma.experimentConversion.groupBy({
        by: ['conversionType'],
        where: { experimentId, variant: variant.id },
        _count: true,
        _sum: { value: true },
      });

      const views = conversions.find(c => c.conversionType === 'view')?._count || 0;
      const purchases = conversions.find(c => c.conversionType === 'purchase')?._count || 0;
      const revenue = conversions.find(c => c.conversionType === 'purchase')?._sum.value || 0;

      results[variant.id] = {
        name: variant.name,
        visitors: assignments,
        views,
        purchases,
        revenue,
        conversionRate: views > 0 ? Math.round((purchases / views) * 10000) / 100 : 0,
        revenuePerVisitor: assignments > 0 ? Math.round(revenue / assignments) : 0,
      };
    }

    // Calcular significancia estadística (simplificado)
    const variantIds = Object.keys(results);
    if (variantIds.length === 2) {
      const [a, b] = variantIds.map(id => results[id]);
      const lift = a.conversionRate > 0 
        ? Math.round(((b.conversionRate - a.conversionRate) / a.conversionRate) * 100) 
        : 0;
      
      results.comparison = {
        lift,
        winner: lift > 5 ? variantIds[1] : lift < -5 ? variantIds[0] : 'inconclusive',
        confidence: this.calculateConfidence(a, b),
      };
    }

    return {
      experiment: {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        startDate: experiment.startDate,
        endDate: experiment.endDate,
      },
      variants: results,
    };
  }

  /**
   * Calcular confianza estadística (simplificado)
   */
  calculateConfidence(a, b) {
    const n1 = a.visitors;
    const n2 = b.visitors;
    const p1 = a.conversionRate / 100;
    const p2 = b.conversionRate / 100;

    if (n1 < 30 || n2 < 30) return 'insufficient_data';

    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
    const z = Math.abs(p1 - p2) / se;

    if (z > 2.58) return '99%';
    if (z > 1.96) return '95%';
    if (z > 1.65) return '90%';
    return 'not_significant';
  }

  /**
   * Finalizar experimento
   */
  async endExperiment(experimentId, winnerId = null) {
    await prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: 'completed',
        endDate: new Date(),
        winner: winnerId,
      },
    });

    logger.info({ experimentId, winnerId }, 'Experiment ended');
    return { success: true };
  }

  /**
   * Obtener experimentos activos
   */
  async getActiveExperiments(storeId) {
    return prisma.experiment.findMany({
      where: { storeId, status: 'running' },
    });
  }

  /**
   * Aplicar variante ganadora
   */
  async applyWinner(experimentId) {
    const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
    
    if (!experiment?.winner) throw new Error('No hay ganador definido');

    const variants = JSON.parse(experiment.variants);
    const winner = variants.find(v => v.id === experiment.winner);

    if (!winner) throw new Error('Variante ganadora no encontrada');

    // Aplicar cambios según el tipo de experimento
    // Esto dependerá del tipo específico (precio, imagen, etc.)
    logger.info({ experimentId, winner: winner.id }, 'Winner applied');

    return { success: true, appliedVariant: winner };
  }
}

export const abTestingService = new ABTestingService();
export default abTestingService;


/**
 * Sistema de Capacitación de Empleados
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class TrainingService {
  /**
   * Crear curso de capacitación
   */
  async createCourse(storeId, courseData) {
    const {
      title, description, category, duration,
      modules, requiredFor, passingScore,
    } = courseData;

    const course = await prisma.trainingCourse.create({
      data: {
        storeId,
        title,
        description,
        category, // 'onboarding', 'food_safety', 'customer_service', 'operations'
        duration,
        modules: JSON.stringify(modules),
        requiredFor: requiredFor || [],
        passingScore: passingScore || 70,
        isActive: true,
      },
    });

    logger.info({ courseId: course.id, title }, 'Training course created');
    return course;
  }

  /**
   * Asignar curso a empleado
   */
  async assignCourse(courseId, employeeId, dueDate = null) {
    const existing = await prisma.employeeCourse.findFirst({
      where: { courseId, employeeId, status: { not: 'completed' } },
    });

    if (existing) throw new Error('El empleado ya tiene este curso asignado');

    const assignment = await prisma.employeeCourse.create({
      data: {
        courseId,
        employeeId,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'assigned',
        progress: 0,
      },
    });

    return assignment;
  }

  /**
   * Iniciar módulo
   */
  async startModule(employeeCourseId, moduleIndex) {
    const ec = await prisma.employeeCourse.findUnique({
      where: { id: employeeCourseId },
      include: { course: true },
    });

    if (!ec) throw new Error('Asignación no encontrada');

    const modules = JSON.parse(ec.course.modules);
    if (moduleIndex >= modules.length) throw new Error('Módulo inválido');

    await prisma.moduleProgress.upsert({
      where: {
        employeeCourseId_moduleIndex: { employeeCourseId, moduleIndex },
      },
      update: { startedAt: new Date() },
      create: {
        employeeCourseId,
        moduleIndex,
        startedAt: new Date(),
        status: 'in_progress',
      },
    });

    if (ec.status === 'assigned') {
      await prisma.employeeCourse.update({
        where: { id: employeeCourseId },
        data: { status: 'in_progress', startedAt: new Date() },
      });
    }

    return { success: true, module: modules[moduleIndex] };
  }

  /**
   * Completar módulo
   */
  async completeModule(employeeCourseId, moduleIndex, quizAnswers = null) {
    const ec = await prisma.employeeCourse.findUnique({
      where: { id: employeeCourseId },
      include: { course: true },
    });

    const modules = JSON.parse(ec.course.modules);
    const module = modules[moduleIndex];

    let score = null;
    let passed = true;

    // Evaluar quiz si existe
    if (module.quiz && quizAnswers) {
      score = this.evaluateQuiz(module.quiz, quizAnswers);
      passed = score >= ec.course.passingScore;
    }

    await prisma.moduleProgress.update({
      where: {
        employeeCourseId_moduleIndex: { employeeCourseId, moduleIndex },
      },
      data: {
        completedAt: new Date(),
        status: passed ? 'completed' : 'failed',
        score,
        attempts: { increment: 1 },
      },
    });

    // Actualizar progreso del curso
    const completedModules = await prisma.moduleProgress.count({
      where: { employeeCourseId, status: 'completed' },
    });

    const progress = Math.round((completedModules / modules.length) * 100);

    await prisma.employeeCourse.update({
      where: { id: employeeCourseId },
      data: {
        progress,
        status: progress === 100 ? 'completed' : 'in_progress',
        completedAt: progress === 100 ? new Date() : null,
      },
    });

    return { passed, score, progress, courseCompleted: progress === 100 };
  }

  evaluateQuiz(quiz, answers) {
    let correct = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct++;
    });
    return Math.round((correct / quiz.questions.length) * 100);
  }

  /**
   * Obtener progreso de empleado
   */
  async getEmployeeProgress(employeeId) {
    const courses = await prisma.employeeCourse.findMany({
      where: { employeeId },
      include: {
        course: true,
        moduleProgress: true,
      },
    });

    return courses.map(ec => ({
      courseId: ec.courseId,
      courseTitle: ec.course.title,
      category: ec.course.category,
      status: ec.status,
      progress: ec.progress,
      dueDate: ec.dueDate,
      startedAt: ec.startedAt,
      completedAt: ec.completedAt,
      modulesCompleted: ec.moduleProgress.filter(m => m.status === 'completed').length,
      totalModules: JSON.parse(ec.course.modules).length,
    }));
  }

  /**
   * Obtener cursos requeridos por rol
   */
  async getRequiredCourses(storeId, role) {
    return prisma.trainingCourse.findMany({
      where: {
        storeId,
        isActive: true,
        requiredFor: { has: role },
      },
    });
  }

  /**
   * Verificar certificaciones de empleado
   */
  async checkCertifications(employeeId) {
    const completed = await prisma.employeeCourse.findMany({
      where: { employeeId, status: 'completed' },
      include: { course: true },
    });

    const certifications = completed.map(ec => ({
      courseTitle: ec.course.title,
      category: ec.course.category,
      completedAt: ec.completedAt,
      expiresAt: ec.course.validityDays
        ? new Date(ec.completedAt.getTime() + ec.course.validityDays * 24 * 60 * 60 * 1000)
        : null,
    }));

    const expired = certifications.filter(c =>
      c.expiresAt && c.expiresAt < new Date()
    );

    const expiringSoon = certifications.filter(c =>
      c.expiresAt &&
      c.expiresAt > new Date() &&
      c.expiresAt < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    );

    return { certifications, expired, expiringSoon };
  }

  /**
   * Reporte de capacitación de tienda
   */
  async getStoreTrainingReport(storeId) {
    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
      include: {
        courses: {
          include: { course: true },
        },
      },
    });

    const report = employees.map(emp => {
      const assigned = emp.courses.length;
      const completed = emp.courses.filter(c => c.status === 'completed').length;
      const overdue = emp.courses.filter(c =>
        c.dueDate && c.dueDate < new Date() && c.status !== 'completed'
      ).length;

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        assignedCourses: assigned,
        completedCourses: completed,
        overdueCourses: overdue,
        completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 100,
      };
    });

    return {
      employees: report,
      summary: {
        totalEmployees: employees.length,
        avgCompletionRate: Math.round(
          report.reduce((sum, r) => sum + r.completionRate, 0) / report.length
        ),
        employeesWithOverdue: report.filter(r => r.overdueCourses > 0).length,
      },
    };
  }

  /**
   * Crear quiz
   */
  createQuizTemplate(questions) {
    return {
      questions: questions.map(q => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
    };
  }

  /**
   * Obtener leaderboard de capacitación
   */
  async getTrainingLeaderboard(storeId) {
    const employees = await prisma.employee.findMany({
      where: { storeId, isActive: true },
      include: {
        courses: {
          where: { status: 'completed' },
          include: { moduleProgress: true },
        },
      },
    });

    const leaderboard = employees.map(emp => {
      const totalScore = emp.courses.reduce((sum, c) => {
        const moduleScores = c.moduleProgress.filter(m => m.score !== null);
        return sum + moduleScores.reduce((s, m) => s + m.score, 0);
      }, 0);

      const totalModules = emp.courses.reduce((sum, c) =>
        sum + c.moduleProgress.filter(m => m.score !== null).length, 0
      );

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        coursesCompleted: emp.courses.length,
        avgScore: totalModules > 0 ? Math.round(totalScore / totalModules) : 0,
        points: emp.courses.length * 100 + (totalModules > 0 ? Math.round(totalScore / totalModules) : 0),
      };
    });

    return leaderboard.sort((a, b) => b.points - a.points);
  }
}

export const trainingService = new TrainingService();
export default trainingService;


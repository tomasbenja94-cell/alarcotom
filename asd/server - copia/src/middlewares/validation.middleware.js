// Middleware de validación usando Zod
// Para usar: router.post('/orders', validate(createOrderSchema), controller.create)

export const validate = (schema) => {
  return (req, res, next) => {
    try {
      // Validar body, params y query según el schema
      schema.parse({
        ...req.body,
        ...req.params,
        ...req.query
      });
      next();
    } catch (error) {
      if (error.name === 'ZodError' && error.errors && Array.isArray(error.errors)) {
        return res.status(400).json({
          error: 'Datos de entrada inválidos',
          details: error.errors.map(e => ({
            path: e.path && Array.isArray(e.path) ? e.path.join('.') : String(e.path || 'unknown'),
            message: e.message || 'Error de validación'
          }))
        });
      }
      // Si no es un ZodError válido, pasar al siguiente middleware
      console.error('⚠️ [VALIDATION] Error inesperado en validación:', error);
      next(error);
    }
  };
};


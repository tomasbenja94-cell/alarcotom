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
      if (error.name === 'ZodError') {
        return res.status(400).json({
          error: 'Datos de entrada inválidos',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
};


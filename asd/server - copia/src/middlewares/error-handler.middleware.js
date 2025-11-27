// Middleware centralizado de manejo de errores

export const errorHandler = (err, req, res, next) => {
  // Error de validación (Zod)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expirado' });
  }

  // Error de Prisma
  if (err.code === 'P2002') {
    return res.status(400).json({ error: 'El registro ya existe' });
  }

  // Error genérico
  console.error('Error no manejado:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // NO exponer detalles del error al cliente
  res.status(err.status || 500).json({
    error: 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
};


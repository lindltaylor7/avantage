import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Exige una sesión válida (token JWT) y adjunta el usuario decodificado a req.user.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

/**
 * Exige que el usuario autenticado tenga el permiso indicado (una "herramienta" habilitada por su rol).
 */
export function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user?.permissions?.includes(key)) {
      return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso.' });
    }
    next();
  };
}

/**
 * Token corto (10 min) que viaja como `state` en el flujo OAuth de Google:
 * identifica a qué usuario pertenece la conexión cuando Google redirige de
 * vuelta a /api/google/callback, un request de navegador plano que no lleva
 * el header Authorization de la sesión.
 */
export function signGoogleOAuthState(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '10m' });
}

export function verifyGoogleOAuthState(state) {
  const payload = jwt.verify(state, JWT_SECRET);
  return payload.userId;
}

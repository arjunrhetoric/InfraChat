const ROLES = {
  MEMBER: 1,
  MODERATOR: 2,
  SUPERADMIN: 3,
};

const roleNames = {
  1: 'Member',
  2: 'Moderator',
  3: 'SuperAdmin',
};

const requireRole = (minRole) => {
  return (req, res, next) => {
    try {
      // Ensure authentication middleware ran first
      if (!req.user) {
        return res.status(401).json({
          message: 'Authentication required.',
        });
      }

      // Check role hierarchy
      if (req.user.role < minRole) {
        return res.status(403).json({
          message: `This action requires ${roleNames[minRole] || 'higher'} privileges.`,
        });
      }

      next();
    } catch (error) {
      console.error('RBAC Middleware Error:', error.message);
      return res.status(500).json({
        message: 'Authorization failed.',
      });
    }
  };
};

module.exports = {
  requireRole,
  ROLES,
};

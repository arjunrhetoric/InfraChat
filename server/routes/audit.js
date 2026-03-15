const express = require('express');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/rbac');

const router = express.Router();

// GET /api/audit
// Moderator and SuperAdmin can view audit logs
router.get('/', auth, requireRole(ROLES.MODERATOR), async (req, res) => {
  try {
    const { page = 1, limit = 20, action = '', roomId = '' } = req.query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const query = {};

    if (action) query.action = action;
    if (roomId) query.room = roomId;

    const logs = await AuditLog.find(query)
      .populate('performedBy', 'username role email')
      .populate('targetUser', 'username role email')
      .populate('room', 'name isPrivate')
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit);

    const total = await AuditLog.countDocuments(query);

    return res.json({
      logs,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    console.error('Get Audit Logs Error:', error.message);
    return res.status(500).json({
      message: 'Server error while fetching audit logs.',
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');
router.use(protect, authorize('admin'));

// Dashboard Routes
router.get('/insights', adminCtrl.getSystemInsights);

// List Routes (Matched with controller names)
router.get('/users/recent', adminCtrl.getRecentUsers); 
router.get('/teachers', adminCtrl.getAllTeachers);    
router.get('/assignments', adminCtrl.getAllAssignments);

// CRUD Routes
router.post('/users', adminCtrl.addUser);
router.put('/users/:id', adminCtrl.updateUser);
router.delete('/users/:id', adminCtrl.deleteUser);
router.delete('/assignments/:id', adminCtrl.deleteAssignment);

module.exports = router;
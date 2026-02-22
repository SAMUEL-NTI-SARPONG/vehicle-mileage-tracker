const express = require('express');
const { queryOne, queryAll, execute } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/maintenance - Get all maintenance logs
router.get('/', authenticate, (req, res) => {
    try {
        let logs;
        if (req.user.role === 'driver') {
            const vehicles = queryAll('SELECT id FROM vehicles WHERE driver = ?', [req.user.name]);
            if (vehicles.length === 0) return res.json([]);
            const ids = vehicles.map(v => v.id);
            const placeholders = ids.map(() => '?').join(',');
            logs = queryAll(
                'SELECT * FROM maintenance_logs WHERE vehicle_id IN (' + placeholders + ') ORDER BY created_at DESC',
                ids
            );
        } else {
            logs = queryAll('SELECT * FROM maintenance_logs ORDER BY created_at DESC');
        }
        res.json(logs.map(l => ({
            id: l.id,
            vehicleId: l.vehicle_id,
            artisanName: l.artisan_name,
            companyName: l.company_name || '',
            contactNumber: l.contact_number,
            repairWork: l.repair_work,
            maintenanceDate: l.maintenance_date,
            cost: l.cost || 0,
            notes: l.notes || '',
            submittedBy: l.submitted_by,
            resetMileage: !!l.reset_mileage,
            createdAt: l.created_at
        })));
    } catch (err) {
        console.error('Get maintenance error:', err);
        res.status(500).json({ error: 'Failed to fetch maintenance logs' });
    }
});

// POST /api/maintenance - Submit maintenance log
router.post('/', authenticate, (req, res) => {
    try {
        const { vehicleId, artisanName, companyName, contactNumber, repairWork, maintenanceDate, cost, notes, resetMileage } = req.body;

        if (!vehicleId || !artisanName || !contactNumber || !repairWork || !maintenanceDate) {
            return res.status(400).json({ error: 'Vehicle, artisan name, contact number, repair work, and date are required' });
        }

        const vehicle = queryOne('SELECT * FROM vehicles WHERE id = ?', [vehicleId]);
        if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

        const logId = 'MNT_' + Date.now();

        execute(
            'INSERT INTO maintenance_logs (id, vehicle_id, artisan_name, company_name, contact_number, repair_work, maintenance_date, cost, notes, submitted_by, reset_mileage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [logId, vehicleId, artisanName, companyName || '', contactNumber, repairWork, maintenanceDate, cost || 0, notes || '', req.user.name, resetMileage ? 1 : 0]
        );

        // Reset mileage if requested
        if (resetMileage) {
            const oldMileage = vehicle.mileage || 0;
            execute(
                'UPDATE vehicles SET mileage = 0, warning_alert_sent = 0, critical_alert_sent = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [vehicleId]
            );

            // Log the mileage reset
            execute(
                'INSERT INTO mileage_logs (id, vehicle_id, previous_mileage, new_mileage, miles_added, logged_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['ML_RST_' + Date.now(), vehicleId, oldMileage, 0, -oldMileage, req.user.name, 'Mileage reset after maintenance: ' + repairWork]
            );

            execute(
                'INSERT INTO activity_log (id, type, message, icon, vehicle_id) VALUES (?, ?, ?, ?, ?)',
                ['act_' + Date.now() + '_rst', 'mileage_reset', 'Mileage reset to 0 for ' + vehicle.registration + ' after maintenance', 'fa-undo', vehicleId]
            );
        }

        execute(
            'INSERT INTO activity_log (id, type, message, icon, vehicle_id) VALUES (?, ?, ?, ?, ?)',
            ['act_' + Date.now(), 'maintenance', 'Maintenance logged for ' + vehicle.registration + ': ' + repairWork, 'fa-wrench', vehicleId]
        );

        const log = queryOne('SELECT * FROM maintenance_logs WHERE id = ?', [logId]);
        res.status(201).json({
            success: true,
            id: log.id,
            vehicleId: log.vehicle_id,
            artisanName: log.artisan_name,
            companyName: log.company_name,
            contactNumber: log.contact_number,
            repairWork: log.repair_work,
            maintenanceDate: log.maintenance_date,
            cost: log.cost,
            notes: log.notes,
            submittedBy: log.submitted_by,
            resetMileage: !!log.reset_mileage,
            createdAt: log.created_at
        });
    } catch (err) {
        console.error('Create maintenance error:', err);
        res.status(500).json({ error: 'Failed to log maintenance' });
    }
});

// DELETE /api/maintenance/:id
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
    try {
        execute('DELETE FROM maintenance_logs WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete maintenance log' });
    }
});

module.exports = router;

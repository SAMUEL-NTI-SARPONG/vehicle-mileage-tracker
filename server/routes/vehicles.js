const express = require('express');
const { queryOne, queryAll, execute } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function mapVehicle(v) {
    if (!v) return null;
    return {
        id: v.id,
        registration: v.registration,
        type: v.type,
        driver: v.driver || '',
        mileage: v.mileage || 0,
        status: v.status || 'active',
        fuelType: v.fuel_type || 'Diesel',
        year: v.year,
        department: v.department || '',
        notes: v.notes || '',
        warningAlertSent: !!v.warning_alert_sent,
        criticalAlertSent: !!v.critical_alert_sent,
        registrationDate: v.registration_date || '',
        registrationExpiry: v.registration_expiry || '',
        insuranceDate: v.insurance_date || '',
        insuranceExpiry: v.insurance_expiry || '',
        createdAt: v.created_at,
        updatedAt: v.updated_at
    };
}

// GET /api/vehicles
router.get('/', authenticate, (req, res) => {
    try {
        // Return ALL vehicles for all users (drivers need fleet overview on dashboard)
        const vehicles = queryAll('SELECT * FROM vehicles ORDER BY registration');
        res.json(vehicles.map(mapVehicle));
    } catch (err) {
        console.error('Get vehicles error:', err);
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// GET /api/vehicles/:id
router.get('/:id', authenticate, (req, res) => {
    try {
        const vehicle = queryOne('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
        if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
        res.json(mapVehicle(vehicle));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vehicle' });
    }
});

// POST /api/vehicles
router.post('/', authenticate, requireRole('admin'), (req, res) => {
    try {
        const { id, registration, type, driver, mileage, status, fuelType, year, department, notes, registrationDate, registrationExpiry, insuranceDate, insuranceExpiry } = req.body;
        const vid = id || 'VH' + Date.now();

        execute(
            'INSERT INTO vehicles (id, registration, type, driver, mileage, status, fuel_type, year, department, notes, registration_date, registration_expiry, insurance_date, insurance_expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [vid, registration, type, driver || '', mileage || 0, status || 'active', fuelType || 'Diesel', year || null, department || '', notes || '', registrationDate || null, registrationExpiry || null, insuranceDate || null, insuranceExpiry || null]
        );

        execute(
            'INSERT INTO activity_log (id, type, message, icon, vehicle_id) VALUES (?, ?, ?, ?, ?)',
            ['act_' + Date.now(), 'vehicle_added', 'Vehicle ' + registration + ' added', 'fa-plus-circle', vid]
        );

        const vehicle = queryOne('SELECT * FROM vehicles WHERE id = ?', [vid]);
        res.status(201).json(mapVehicle(vehicle));
    } catch (err) {
        console.error('Create vehicle error:', err);
        res.status(500).json({ error: 'Failed to create vehicle' });
    }
});

// PUT /api/vehicles/:id
router.put('/:id', authenticate, requireRole('admin'), (req, res) => {
    try {
        const existing = queryOne('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

        const { registration, type, driver, mileage, status, fuelType, year, department, notes, registrationDate, registrationExpiry, insuranceDate, insuranceExpiry } = req.body;

        execute(
            'UPDATE vehicles SET registration=?, type=?, driver=?, mileage=?, status=?, fuel_type=?, year=?, department=?, notes=?, registration_date=?, registration_expiry=?, insurance_date=?, insurance_expiry=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
            [
                registration || existing.registration,
                type || existing.type,
                driver !== undefined ? driver : existing.driver,
                mileage !== undefined ? mileage : existing.mileage,
                status || existing.status,
                fuelType || existing.fuel_type,
                year !== undefined ? year : existing.year,
                department !== undefined ? department : existing.department,
                notes !== undefined ? notes : existing.notes,
                registrationDate !== undefined ? registrationDate : existing.registration_date,
                registrationExpiry !== undefined ? registrationExpiry : existing.registration_expiry,
                insuranceDate !== undefined ? insuranceDate : existing.insurance_date,
                insuranceExpiry !== undefined ? insuranceExpiry : existing.insurance_expiry,
                req.params.id
            ]
        );

        execute(
            'INSERT INTO activity_log (id, type, message, icon, vehicle_id) VALUES (?, ?, ?, ?, ?)',
            ['act_' + Date.now(), 'vehicle_updated', 'Vehicle ' + (registration || existing.registration) + ' updated', 'fa-edit', req.params.id]
        );

        const vehicle = queryOne('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
        res.json(mapVehicle(vehicle));
    } catch (err) {
        console.error('Update vehicle error:', err);
        res.status(500).json({ error: 'Failed to update vehicle' });
    }
});

// DELETE /api/vehicles/:id
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
    try {
        const vehicle = queryOne('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
        if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

        execute('DELETE FROM vehicles WHERE id = ?', [req.params.id]);

        execute(
            'INSERT INTO activity_log (id, type, message, icon) VALUES (?, ?, ?, ?)',
            ['act_' + Date.now(), 'vehicle_deleted', 'Vehicle ' + vehicle.registration + ' deleted', 'fa-trash']
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Delete vehicle error:', err);
        res.status(500).json({ error: 'Failed to delete vehicle' });
    }
});

module.exports = router;

/* =============================================
   Data Layer - API-backed with LocalStorage cache
   ============================================= */

const MAX_MILEAGE = 5000;
const WARNING_THRESHOLD = 200;

const DataStore = {
    KEYS: {
        VEHICLES: 'vmt_vehicles',
        MILEAGE_LOGS: 'vmt_mileage_logs',
        ALERTS: 'vmt_alerts',
        ACTIVITY: 'vmt_activity',
        USERS: 'vmt_users',
        SETTINGS: 'vmt_settings',
        CURRENT_USER: 'vmt_current_user'
    },

    init() {
        if (!this.get(this.KEYS.USERS)) {
            this.set(this.KEYS.USERS, [
                { username: 'admin', password: 'admin', role: 'admin', name: 'Fleet Admin' },
                { username: 'driver', password: 'driver', role: 'driver', name: 'John Driver' },
                { username: 'driver2', password: 'driver2', role: 'driver', name: 'Jane Smith' }
            ]);
        }
        if (!this.get(this.KEYS.VEHICLES)) this.set(this.KEYS.VEHICLES, []);
        if (!this.get(this.KEYS.MILEAGE_LOGS)) this.set(this.KEYS.MILEAGE_LOGS, []);
        if (!this.get(this.KEYS.ALERTS)) this.set(this.KEYS.ALERTS, []);
        if (!this.get(this.KEYS.ACTIVITY)) this.set(this.KEYS.ACTIVITY, []);
        if (!this.get(this.KEYS.SETTINGS)) {
            this.set(this.KEYS.SETTINGS, {
                emailAlerts: true,
                pushAlerts: false,
                warningThreshold: WARNING_THRESHOLD,
                maxMileage: MAX_MILEAGE,
                theme: 'dark',
                driverSeeMileage: true
            });
        }
    },

    // Sync local cache with API data
    async syncFromServer() {
        try {
            const [vehiclesRes, mileageRes, alertsRes, activityRes, settingsRes] = await Promise.all([
                ApiClient.getVehicles(),
                ApiClient.getMileageLogs(),
                ApiClient.getAlerts(),
                ApiClient.getActivity(),
                ApiClient.getSettings()
            ]);

            // Server returns direct arrays/objects (not wrapped)
            if (vehiclesRes && Array.isArray(vehiclesRes)) this.set(this.KEYS.VEHICLES, vehiclesRes);
            if (mileageRes && Array.isArray(mileageRes)) this.set(this.KEYS.MILEAGE_LOGS, mileageRes);
            if (alertsRes && Array.isArray(alertsRes)) this.set(this.KEYS.ALERTS, alertsRes);
            if (activityRes && Array.isArray(activityRes)) this.set(this.KEYS.ACTIVITY, activityRes);
            if (settingsRes && typeof settingsRes === 'object' && !Array.isArray(settingsRes)) {
                const current = this.getSettings();
                this.set(this.KEYS.SETTINGS, { ...current, ...settingsRes });
            }
            return true;
        } catch (err) {
            console.warn('[DataStore] Sync failed, using local cache:', err.message);
            return false;
        }
    },

    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Storage error:', e);
        }
    },

    getVehicles() {
        return this.get(this.KEYS.VEHICLES) || [];
    },

    getVehicle(vehicleId) {
        return this.getVehicles().find(v => v.id === vehicleId);
    },

    addVehicle(vehicle) {
        const vehicles = this.getVehicles();
        if (vehicles.find(v => v.id === vehicle.id)) {
            return { success: false, message: 'Vehicle ID already exists' };
        }
        vehicle.createdAt = new Date().toISOString();
        vehicle.updatedAt = new Date().toISOString();
        vehicle.warningAlertSent = false;
        vehicle.criticalAlertSent = false;
        vehicles.push(vehicle);
        this.set(this.KEYS.VEHICLES, vehicles);
        this.addActivity('vehicle', 'Vehicle ' + vehicle.id + ' (' + vehicle.registration + ') registered', 'fa-car', vehicle.id);

        // Async API call
        ApiClient.createVehicle(vehicle).catch(err => {
            console.warn('[DataStore] API create vehicle failed:', err.message);
            ApiClient.queueOfflineRequest('/api/vehicles', { method: 'POST', body: JSON.stringify(vehicle) });
        });

        return { success: true };
    },

    updateVehicle(vehicleId, updates) {
        const vehicles = this.getVehicles();
        const idx = vehicles.findIndex(v => v.id === vehicleId);
        if (idx === -1) return { success: false, message: 'Vehicle not found' };
        vehicles[idx] = { ...vehicles[idx], ...updates, updatedAt: new Date().toISOString() };
        this.set(this.KEYS.VEHICLES, vehicles);

        ApiClient.updateVehicle(vehicleId, updates).catch(err => {
            console.warn('[DataStore] API update vehicle failed:', err.message);
        });

        return { success: true };
    },

    deleteVehicle(vehicleId) {
        let vehicles = this.getVehicles();
        vehicles = vehicles.filter(v => v.id !== vehicleId);
        this.set(this.KEYS.VEHICLES, vehicles);
        this.addActivity('vehicle', 'Vehicle ' + vehicleId + ' deactivated', 'fa-car', vehicleId);

        ApiClient.deleteVehicle(vehicleId).catch(err => {
            console.warn('[DataStore] API delete vehicle failed:', err.message);
        });
    },

    getMileageLogs(vehicleId) {
        let logs = this.get(this.KEYS.MILEAGE_LOGS) || [];
        if (vehicleId) logs = logs.filter(l => l.vehicleId === vehicleId);
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },

    addMileageLog(vehicleId, newMileage, loggedBy, notes) {
        notes = notes || '';
        const vehicle = this.getVehicle(vehicleId);
        if (!vehicle) return { success: false, message: 'Vehicle not found' };

        const prevMileage = vehicle.mileage || 0;
        if (newMileage <= prevMileage) {
            return { success: false, message: 'New mileage (' + newMileage + ') must be greater than current (' + prevMileage + '). Rollback not allowed.' };
        }

        const logs = this.getMileageLogs(vehicleId);
        const recentDuplicate = logs.find(l => {
            const timeDiff = Math.abs(new Date() - new Date(l.timestamp));
            return l.newMileage === newMileage && timeDiff < 60000;
        });
        if (recentDuplicate) {
            return { success: false, message: 'Duplicate entry detected.' };
        }

        const log = {
            id: 'ML-' + Date.now(),
            vehicleId: vehicleId,
            previousMileage: prevMileage,
            newMileage: newMileage,
            milesAdded: newMileage - prevMileage,
            timestamp: new Date().toISOString(),
            loggedBy: loggedBy,
            notes: notes
        };

        const allLogs = this.get(this.KEYS.MILEAGE_LOGS) || [];
        allLogs.push(log);
        this.set(this.KEYS.MILEAGE_LOGS, allLogs);

        this.updateVehicle(vehicleId, { mileage: newMileage });

        const settings = this.getSettings();
        const maxMileage = settings.maxMileage || MAX_MILEAGE;
        const warnThreshold = settings.warningThreshold || WARNING_THRESHOLD;
        const remaining = maxMileage - newMileage;

        if (remaining <= 0 && !vehicle.criticalAlertSent) {
            AlertsManager.createAlert(vehicleId, 'critical',
                'CRITICAL: Vehicle ' + vehicleId + ' has exceeded the mileage limit!',
                'Current mileage: ' + newMileage + ' miles. Limit: ' + maxMileage + ' miles. Exceeded by ' + Math.abs(remaining) + ' miles.'
            );
            this.updateVehicle(vehicleId, { criticalAlertSent: true });
        } else if (remaining <= warnThreshold && remaining > 0 && !vehicle.warningAlertSent) {
            AlertsManager.createAlert(vehicleId, 'warning',
                'WARNING: Vehicle ' + vehicleId + ' is approaching mileage limit',
                'Current mileage: ' + newMileage + ' miles. Only ' + remaining + ' miles remaining.'
            );
            this.updateVehicle(vehicleId, { warningAlertSent: true });
        }

        this.addActivity('mileage', 'Mileage updated for ' + vehicleId + ': ' + prevMileage + ' to ' + newMileage + ' miles (+' + (newMileage - prevMileage) + ')', 'fa-road', vehicleId);

        // Async API call
        ApiClient.addMileageLog(vehicleId, newMileage, notes).catch(err => {
            console.warn('[DataStore] API add mileage failed:', err.message);
        });

        return { success: true, log: log };
    },

    getAlerts() {
        return this.get(this.KEYS.ALERTS) || [];
    },

    addAlert(alert) {
        const alerts = this.getAlerts();
        alerts.unshift(alert);
        this.set(this.KEYS.ALERTS, alerts);
    },

    markAllAlertsRead() {
        const alerts = this.getAlerts();
        alerts.forEach(a => a.read = true);
        this.set(this.KEYS.ALERTS, alerts);
        ApiClient.markAllAlertsRead().catch(() => {});
    },

    markAlertRead(alertId) {
        const alerts = this.getAlerts();
        const alert = alerts.find(a => a.id === alertId);
        if (alert) {
            alert.read = true;
            this.set(this.KEYS.ALERTS, alerts);
            ApiClient.markAlertRead(alertId).catch(() => {});
        }
    },

    getUnreadAlertCount() {
        return this.getAlerts().filter(a => !a.read).length;
    },

    getActivity() {
        return (this.get(this.KEYS.ACTIVITY) || []).slice(0, 50);
    },

    addActivity(type, message, icon, vehicleId) {
        icon = icon || 'fa-info-circle';
        vehicleId = vehicleId || null;
        const activities = this.get(this.KEYS.ACTIVITY) || [];
        activities.unshift({
            id: 'ACT-' + Date.now(),
            type: type,
            message: message,
            icon: icon,
            vehicleId: vehicleId,
            timestamp: new Date().toISOString()
        });
        if (activities.length > 100) activities.length = 100;
        this.set(this.KEYS.ACTIVITY, activities);
    },

    getSettings() {
        return this.get(this.KEYS.SETTINGS) || {
            emailAlerts: true,
            pushAlerts: false,
            warningThreshold: WARNING_THRESHOLD,
            maxMileage: MAX_MILEAGE,
            theme: 'dark',
            driverSeeMileage: true
        };
    },

    saveSettings(settings) {
        this.set(this.KEYS.SETTINGS, settings);
        ApiClient.saveSettings(settings).catch(() => {});
    },

    getVehicleStatus(vehicle) {
        const settings = this.getSettings();
        const maxMileage = settings.maxMileage || MAX_MILEAGE;
        const warnThreshold = settings.warningThreshold || WARNING_THRESHOLD;
        const remaining = maxMileage - (vehicle.mileage || 0);
        if (remaining <= 0) return 'exceeded';
        if (remaining <= warnThreshold) return 'warning';
        return 'normal';
    },

    getStats() {
        const vehicles = this.getVehicles().filter(v => v.status === 'active');
        const stats = { total: vehicles.length, normal: 0, warning: 0, exceeded: 0 };
        vehicles.forEach(v => {
            const status = this.getVehicleStatus(v);
            stats[status]++;
        });
        return stats;
    },

    resetAll() {
        Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
        this.init();
    },

    loadSampleData() {
        var sampleVehicles = [
            { id: 'VH-001', registration: 'ABC 1234', type: 'Sedan', driver: 'John Driver', mileage: 3200, status: 'active', warningAlertSent: false, criticalAlertSent: false },
            { id: 'VH-002', registration: 'DEF 5678', type: 'SUV', driver: 'Jane Smith', mileage: 4850, status: 'active', warningAlertSent: true, criticalAlertSent: false },
            { id: 'VH-003', registration: 'GHI 9012', type: 'Truck', driver: 'Bob Wilson', mileage: 5100, status: 'active', warningAlertSent: true, criticalAlertSent: true },
            { id: 'VH-004', registration: 'JKL 3456', type: 'Van', driver: 'Alice Brown', mileage: 1500, status: 'active', warningAlertSent: false, criticalAlertSent: false },
            { id: 'VH-005', registration: 'MNO 7890', type: 'Sedan', driver: 'Charlie Davis', mileage: 4200, status: 'active', warningAlertSent: false, criticalAlertSent: false },
            { id: 'VH-006', registration: 'PQR 2345', type: 'Bus', driver: 'Diana Evans', mileage: 2800, status: 'active', warningAlertSent: false, criticalAlertSent: false },
            { id: 'VH-007', registration: 'STU 6789', type: 'Motorcycle', driver: 'Edward Fox', mileage: 4950, status: 'active', warningAlertSent: true, criticalAlertSent: false },
            { id: 'VH-008', registration: 'VWX 0123', type: 'SUV', driver: '', mileage: 0, status: 'inactive', warningAlertSent: false, criticalAlertSent: false }
        ];

        sampleVehicles.forEach(function(v) {
            v.createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
            v.updatedAt = new Date().toISOString();
        });

        this.set(this.KEYS.VEHICLES, sampleVehicles);

        var sampleLogs = [];
        sampleVehicles.forEach(function(v) {
            if (v.mileage === 0) return;
            var currentMileage = 0;
            var steps = Math.floor(Math.random() * 5) + 3;
            var increment = Math.floor(v.mileage / steps);
            for (var i = 0; i < steps; i++) {
                var newMileage = i === steps - 1 ? v.mileage : currentMileage + increment + Math.floor(Math.random() * 100);
                sampleLogs.push({
                    id: 'ML-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                    vehicleId: v.id,
                    previousMileage: currentMileage,
                    newMileage: newMileage,
                    milesAdded: newMileage - currentMileage,
                    timestamp: new Date(Date.now() - (steps - i) * 3 * 24 * 60 * 60 * 1000).toISOString(),
                    loggedBy: v.driver || 'Admin',
                    notes: ''
                });
                currentMileage = newMileage;
            }
        });

        this.set(this.KEYS.MILEAGE_LOGS, sampleLogs);

        var sampleAlerts = [
            { id: 'ALT-1', vehicleId: 'VH-002', type: 'warning', title: 'WARNING: Vehicle VH-002 is approaching mileage limit', message: 'Current mileage: 4850 miles. Only 150 miles remaining.', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), read: false },
            { id: 'ALT-2', vehicleId: 'VH-003', type: 'critical', title: 'CRITICAL: Vehicle VH-003 has exceeded the mileage limit!', message: 'Current mileage: 5100 miles. Exceeded by 100 miles.', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), read: false },
            { id: 'ALT-3', vehicleId: 'VH-007', type: 'warning', title: 'WARNING: Vehicle VH-007 is approaching mileage limit', message: 'Current mileage: 4950 miles. Only 50 miles remaining.', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), read: false }
        ];
        this.set(this.KEYS.ALERTS, sampleAlerts);

        var sampleActivity = [
            { id: 'ACT-1', type: 'vehicle', message: 'Vehicle VH-001 registered', icon: 'fa-car', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
            { id: 'ACT-2', type: 'mileage', message: 'Mileage updated for VH-002: 4500 to 4850 miles', icon: 'fa-road', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { id: 'ACT-3', type: 'alert', message: 'Warning alert sent for VH-003', icon: 'fa-bell', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
            { id: 'ACT-4', type: 'mileage', message: 'Mileage updated for VH-007: 4800 to 4950 miles', icon: 'fa-road', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() }
        ];
        this.set(this.KEYS.ACTIVITY, sampleActivity);
        this.addActivity('system', 'Sample data loaded successfully', 'fa-database');
    }
};

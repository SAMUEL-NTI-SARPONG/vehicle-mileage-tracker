/* =============================================
   Maintenance Management Module
   ============================================= */

const MaintenanceManager = {
    logs: [],

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Add maintenance button
        var addBtn = document.getElementById('btn-add-maintenance');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.openModal());
        }

        // Maintenance form submission
        var form = document.getElementById('maintenance-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitLog();
            });
        }

        // Modal close handlers
        document.querySelectorAll('#modal-maintenance .modal-close, #modal-maintenance .modal-cancel, #modal-maintenance .modal-overlay').forEach(el => {
            el.addEventListener('click', () => this.closeModal());
        });
    },

    openModal() {
        var modal = document.getElementById('modal-maintenance');
        var form = document.getElementById('maintenance-form');
        form.reset();

        // Populate vehicle dropdown
        var select = document.getElementById('mnt-vehicle');
        var vehicles = DataStore.getVehicles();
        select.innerHTML = '<option value="">Select vehicle</option>' +
            vehicles.map(v => '<option value="' + v.id + '">' + v.id + ' - ' + v.registration + '</option>').join('');

        // Set today's date
        document.getElementById('mnt-date').valueAsDate = new Date();

        modal.classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modal-maintenance').classList.add('hidden');
    },

    async submitLog() {
        var vehicleId = document.getElementById('mnt-vehicle').value;
        var artisanName = document.getElementById('mnt-artisan').value.trim();
        var companyName = document.getElementById('mnt-company').value.trim();
        var contactNumber = document.getElementById('mnt-contact').value.trim();
        var maintenanceDate = document.getElementById('mnt-date').value;
        var repairWork = document.getElementById('mnt-work').value.trim();
        var cost = parseFloat(document.getElementById('mnt-cost').value) || 0;
        var notes = document.getElementById('mnt-notes').value.trim();
        var resetMileage = document.getElementById('mnt-reset-mileage').checked;

        if (!vehicleId || !artisanName || !contactNumber || !maintenanceDate || !repairWork) {
            UI.showToast('error', 'Validation Error', 'Please fill in all required fields');
            return;
        }

        try {
            var result = await ApiClient.addMaintenanceLog({
                vehicleId, artisanName, companyName, contactNumber,
                maintenanceDate, repairWork, cost, notes, resetMileage
            });

            if (result && (result.success || result.id)) {
                UI.showToast('success', 'Maintenance Logged', 'Maintenance record has been saved');
                if (resetMileage) {
                    UI.showToast('info', 'Mileage Reset', 'Vehicle mileage has been reset to 0');
                }
                this.closeModal();
                this.render();
                App.syncWithServer().then(() => App.refreshAll());
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to save maintenance log');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to save maintenance log');
        }
    },

    async render() {
        var tbody = document.getElementById('maintenance-table-body');
        if (!tbody) return;

        try {
            var result = await ApiClient.getMaintenanceLogs();
            if (result && Array.isArray(result)) {
                this.logs = result;
            }
        } catch (err) {
            console.warn('[Maintenance] Failed to fetch logs:', err.message);
        }

        if (this.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">No maintenance records yet. Click "Log Maintenance" to add one.</td></tr>';
            return;
        }

        tbody.innerHTML = this.logs.map(log => {
            var dateStr = log.maintenanceDate ? new Date(log.maintenanceDate).toLocaleDateString() : 'N/A';
            var artisan = log.artisanName || '';
            if (log.companyName) artisan += ' (' + log.companyName + ')';

            return '<tr>' +
                '<td>' + dateStr + '</td>' +
                '<td><strong>' + (log.vehicleId || '') + '</strong></td>' +
                '<td>' + artisan + '</td>' +
                '<td>' + (log.contactNumber || '') + '</td>' +
                '<td>' + (log.repairWork || '') + '</td>' +
                '<td>' + (log.cost ? 'GHS ' + parseFloat(log.cost).toFixed(2) : '-') + '</td>' +
                '<td>' + (log.submittedBy || '') + '</td>' +
                '<td>' + (log.resetMileage ? '<span class="status-badge status-normal"><i class="fas fa-check"></i> Yes</span>' : '<span style="color:var(--text-muted)">No</span>') + '</td>' +
                (Auth.isAdmin() ? '<td><button class="btn-icon" title="Delete" onclick="MaintenanceManager.deleteLog(\'' + log.id + '\')"><i class="fas fa-trash" style="color:var(--accent-red)"></i></button></td>' : '') +
                '</tr>';
        }).join('');
    },

    async deleteLog(id) {
        if (!confirm('Are you sure you want to delete this maintenance record?')) return;

        try {
            var result = await ApiClient.deleteMaintenanceLog(id);
            if (result && result.success) {
                UI.showToast('success', 'Deleted', 'Maintenance record deleted');
                this.render();
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to delete');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to delete record');
        }
    }
};

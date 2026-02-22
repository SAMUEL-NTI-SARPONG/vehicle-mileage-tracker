/* =============================================
   Dashboard Module
   ============================================= */

const Dashboard = {
    mileageChart: null,
    statusChart: null,

    init() {
        this.refresh();
    },

    refresh() {
        this.updateStats();
        this.updateCharts();
        this.updateRecentActivity();
        this.updateFleetOverview();
    },

    updateStats() {
        const stats = DataStore.getStats();
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-normal').textContent = stats.normal;
        document.getElementById('stat-warning').textContent = stats.warning;
        document.getElementById('stat-exceeded').textContent = stats.exceeded;
    },

    updateCharts() {
        this.renderMileageChart();
        this.renderStatusChart();
    },

    renderMileageChart() {
        const canvas = document.getElementById('mileage-chart');
        const ctx = canvas.getContext('2d');
        let vehicles = DataStore.getVehicles().filter(v => v.status === 'active');
        const settings = DataStore.getSettings();
        const maxMileage = settings.maxMileage || MAX_MILEAGE;

        // Filter for driver's vehicles only
        if (Auth.isDriver()) {
            const user = Auth.getCurrentUser();
            vehicles = vehicles.filter(v => v.driver === user.name);
        }

        if (this.mileageChart) this.mileageChart.destroy();

        this.mileageChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: vehicles.map(v => v.id),
                datasets: [
                    {
                        label: 'Current Mileage',
                        data: vehicles.map(v => v.mileage || 0),
                        backgroundColor: vehicles.map(v => {
                            const status = DataStore.getVehicleStatus(v);
                            return status === 'normal' ? 'rgba(78, 201, 176, 0.7)' :
                                status === 'warning' ? 'rgba(204, 167, 0, 0.7)' :
                                    'rgba(241, 76, 76, 0.7)';
                        }),
                        borderColor: vehicles.map(v => {
                            const status = DataStore.getVehicleStatus(v);
                            return status === 'normal' ? '#4ec9b0' :
                                status === 'warning' ? '#cca700' : '#f14c4c';
                        }),
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterBody: function (context) {
                                const remaining = maxMileage - context[0].raw;
                                return `Remaining: ${remaining > 0 ? remaining : 0} miles`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: maxMileage + 500,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#969696' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#969696' }
                    }
                }
            }
        });
    },

    renderStatusChart() {
        const canvas = document.getElementById('status-chart');
        const ctx = canvas.getContext('2d');
        let stats;

        if (Auth.isDriver()) {
            const user = Auth.getCurrentUser();
            const vehicles = DataStore.getVehicles().filter(v => v.driver === user.name && v.status === 'active');
            stats = {
                normal: vehicles.filter(v => DataStore.getVehicleStatus(v) === 'normal').length,
                warning: vehicles.filter(v => DataStore.getVehicleStatus(v) === 'warning').length,
                exceeded: vehicles.filter(v => DataStore.getVehicleStatus(v) === 'exceeded').length
            };
        } else {
            stats = DataStore.getStats();
        }

        if (this.statusChart) this.statusChart.destroy();

        this.statusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Normal', 'Warning', 'Exceeded'],
                datasets: [{
                    data: [stats.normal, stats.warning, stats.exceeded],
                    backgroundColor: [
                        'rgba(78, 201, 176, 0.8)',
                        'rgba(204, 167, 0, 0.8)',
                        'rgba(241, 76, 76, 0.8)'
                    ],
                    borderColor: ['#4ec9b0', '#cca700', '#f14c4c'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#cccccc',
                            padding: 16,
                            usePointStyle: true,
                            pointStyleWidth: 10
                        }
                    }
                }
            }
        });
    },

    updateRecentActivity() {
        const container = document.getElementById('recent-activity-list');
        let activities = DataStore.getActivity();

        // Filter activity for driver's vehicles only
        if (Auth.isDriver()) {
            const user = Auth.getCurrentUser();
            const driverVehicles = DataStore.getVehicles().filter(v => v.driver === user.name).map(v => v.id);
            activities = activities.filter(a => {
                if (a.vehicleId) return driverVehicles.includes(a.vehicleId);
                return true; // keep non-vehicle activities
            });
        }

        if (activities.length === 0) {
            container.innerHTML = '<div class="activity-empty">No recent activity</div>';
            return;
        }

        container.innerHTML = activities.slice(0, 10).map(a => {
            const iconColor = a.type === 'alert' ? 'var(--status-warning)' :
                a.type === 'vehicle' ? 'var(--accent-blue)' :
                    a.type === 'mileage' ? 'var(--accent-green)' :
                        'var(--text-muted)';
            return `
                <div class="activity-item">
                    <i class="fas ${a.icon}" style="color:${iconColor}"></i>
                    <span class="activity-text">${a.message}</span>
                    <span class="activity-time">${AlertsManager.timeAgo(new Date(a.timestamp))}</span>
                </div>`;
        }).join('');
    },

    updateFleetOverview() {
        const tbody = document.getElementById('fleet-overview-body');
        let vehicles = DataStore.getVehicles().filter(v => v.status === 'active');
        const settings = DataStore.getSettings();
        const maxMileage = settings.maxMileage || MAX_MILEAGE;

        // Filter for driver's vehicles only
        if (Auth.isDriver()) {
            const user = Auth.getCurrentUser();
            vehicles = vehicles.filter(v => v.driver === user.name);
        }

        if (vehicles.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No active vehicles</td></tr>`;
            return;
        }

        tbody.innerHTML = vehicles.map(v => {
            const status = DataStore.getVehicleStatus(v);
            const remaining = maxMileage - (v.mileage || 0);
            const pct = Math.min(((v.mileage || 0) / maxMileage) * 100, 100);
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

            return `
                <tr>
                    <td><strong>${v.id}</strong></td>
                    <td>${v.registration}</td>
                    <td>${v.type}</td>
                    <td>${v.driver || '-'}</td>
                    <td>
                        <div class="mileage-bar-inline">
                            <span>${(v.mileage || 0).toLocaleString()}</span>
                            <div class="mileage-bar-bg" style="width:60px">
                                <div class="mileage-bar-fill" style="width:${pct}%; background:var(--status-${status})"></div>
                            </div>
                        </div>
                    </td>
                    <td style="color:var(--status-${status})">${remaining > 0 ? remaining.toLocaleString() : 'OVER'}</td>
                    <td><span class="status-badge status-${status}">${statusLabel}</span></td>
                </tr>`;
        }).join('');
    }
};

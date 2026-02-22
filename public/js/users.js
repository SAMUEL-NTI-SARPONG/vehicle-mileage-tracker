/* =============================================
   User Management Module (Admin only)
   ============================================= */

const UserManager = {
    users: [],
    editingPermUserId: null,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Add user button
        var addBtn = document.getElementById('btn-add-user');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.openCreateModal());
        }

        // Create user form
        var form = document.getElementById('create-user-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createUser();
            });
        }

        // Save permissions button
        var savePermBtn = document.getElementById('btn-save-permissions');
        if (savePermBtn) {
            savePermBtn.addEventListener('click', () => this.savePermissions());
        }

        // Modal close handlers
        document.querySelectorAll('#modal-create-user .modal-close, #modal-create-user .modal-cancel, #modal-create-user .modal-overlay').forEach(el => {
            el.addEventListener('click', () => document.getElementById('modal-create-user').classList.add('hidden'));
        });

        document.querySelectorAll('#modal-permissions .modal-close, #modal-permissions .modal-cancel, #modal-permissions .modal-overlay').forEach(el => {
            el.addEventListener('click', () => document.getElementById('modal-permissions').classList.add('hidden'));
        });
    },

    openCreateModal() {
        var modal = document.getElementById('modal-create-user');
        document.getElementById('create-user-form').reset();
        modal.classList.remove('hidden');
    },

    async createUser() {
        var name = document.getElementById('cu-name').value.trim();
        var staffId = document.getElementById('cu-staff-id').value.trim();
        var username = document.getElementById('cu-username').value.trim();
        var role = document.getElementById('cu-role').value;
        var password = document.getElementById('cu-password').value;
        var phone = document.getElementById('cu-phone').value.trim();

        if (!name || !staffId || !username || !password) {
            UI.showToast('error', 'Validation Error', 'Please fill in all required fields');
            return;
        }

        try {
            var result = await ApiClient.createUser({ name, staffId, username, role, password, phone });
            if (result && (result.id || result.success)) {
                UI.showToast('success', 'User Created', 'User ' + name + ' has been created successfully');
                document.getElementById('modal-create-user').classList.add('hidden');
                document.getElementById('create-user-form').reset();
                this.render();
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to create user');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to create user');
        }
    },

    async render() {
        if (!Auth.isAdmin()) return;

        var tbody = document.getElementById('users-table-body');
        var pendingSection = document.getElementById('pending-users-section');
        var pendingList = document.getElementById('pending-users-list');
        if (!tbody) return;

        try {
            var result = await ApiClient.getUsers();
            if (result && Array.isArray(result)) {
                this.users = result;
            }
        } catch (err) {
            console.warn('[Users] Failed to fetch users:', err.message);
        }

        // Separate pending and approved users
        var pending = this.users.filter(u => !u.approved);
        var approved = this.users.filter(u => u.approved);

        // Pending approvals section
        if (pendingSection && pendingList) {
            if (pending.length > 0) {
                pendingSection.classList.remove('hidden');
                pendingList.innerHTML = pending.map(u => {
                    return '<div style="display:flex; align-items:center; justify-content:space-between; padding:12px; margin-bottom:8px; background:var(--bg-tertiary); border-radius:6px; border-left:3px solid var(--accent-orange);">' +
                        '<div>' +
                        '<strong style="color:var(--text-bright);">' + u.name + '</strong>' +
                        '<span style="margin-left:8px; color:var(--text-muted); font-size:12px;">@' + u.username + '</span>' +
                        (u.staffId ? '<span style="margin-left:8px; color:var(--text-muted); font-size:12px;">ID: ' + u.staffId + '</span>' : '') +
                        (u.phone ? '<span style="margin-left:8px; color:var(--text-muted); font-size:12px;"><i class="fas fa-phone"></i> ' + u.phone + '</span>' : '') +
                        '</div>' +
                        '<div style="display:flex; gap:6px;">' +
                        '<button class="btn btn-primary btn-sm" onclick="UserManager.approveUser(' + u.id + ')"><i class="fas fa-check"></i> Approve</button>' +
                        '<button class="btn btn-danger btn-sm" onclick="UserManager.rejectUser(' + u.id + ')"><i class="fas fa-times"></i> Reject</button>' +
                        '</div></div>';
                }).join('');
            } else {
                pendingSection.classList.add('hidden');
            }
        }

        // All users table
        if (approved.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = approved.map(u => {
            var permStr = (u.permissions && u.permissions.length) ?
                u.permissions.map(p => '<span style="display:inline-block; padding:2px 6px; margin:1px; background:var(--accent-blue); color:white; border-radius:3px; font-size:11px;">' + p + '</span>').join('') :
                '<span style="color:var(--text-muted); font-size:12px;">All (Admin)</span>';

            return '<tr>' +
                '<td><strong>' + u.name + '</strong></td>' +
                '<td>' + u.username + '</td>' +
                '<td>' + (u.staffId || '-') + '</td>' +
                '<td><span class="role-badge" style="background:' + (u.role === 'admin' ? 'var(--accent-blue)' : 'var(--accent-green)') + '; padding:2px 8px; border-radius:3px; font-size:11px; color:white;">' + u.role.toUpperCase() + '</span></td>' +
                '<td><span class="status-badge status-normal"><i class="fas fa-check-circle"></i> Active</span></td>' +
                '<td style="max-width:200px;">' + permStr + '</td>' +
                '<td>' +
                '<div class="action-btn-group">' +
                '<button class="btn-icon" title="Edit Permissions" onclick="UserManager.openPermissionsModal(' + u.id + ')"><i class="fas fa-key"></i></button>' +
                (u.role !== 'admin' ? '<button class="btn-icon" title="Delete User" onclick="UserManager.deleteUser(' + u.id + ')"><i class="fas fa-trash" style="color:var(--accent-red)"></i></button>' : '') +
                '</div>' +
                '</td>' +
                '</tr>';
        }).join('');
    },

    async approveUser(id) {
        try {
            var result = await ApiClient.approveUser(id);
            if (result && result.success) {
                UI.showToast('success', 'User Approved', 'User has been approved and can now log in');
                this.render();
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to approve user');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to approve user');
        }
    },

    async rejectUser(id) {
        if (!confirm('Are you sure you want to reject this user? Their account will be deleted.')) return;
        try {
            var result = await ApiClient.rejectUser(id);
            if (result && result.success) {
                UI.showToast('success', 'User Rejected', 'User account has been removed');
                this.render();
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to reject user');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to reject user');
        }
    },

    async deleteUser(id) {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            var result = await ApiClient.deleteUser(id);
            if (result && result.success) {
                UI.showToast('success', 'User Deleted', 'User has been deleted');
                this.render();
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to delete user');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to delete user');
        }
    },

    openPermissionsModal(userId) {
        this.editingPermUserId = userId;
        var user = this.users.find(u => u.id === userId);
        if (!user) return;

        var modal = document.getElementById('modal-permissions');
        document.getElementById('modal-permissions-title').textContent = 'Edit Permissions - ' + user.name;

        var allPerms = [
            { id: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt' },
            { id: 'my-vehicle', label: 'My Vehicle', icon: 'fa-id-card' },
            { id: 'mileage', label: 'Mileage Tracking', icon: 'fa-road' },
            { id: 'alerts', label: 'Alerts', icon: 'fa-bell' },
            { id: 'maintenance', label: 'Maintenance Log', icon: 'fa-wrench' },
            { id: 'expiration', label: 'Expiration Tracking', icon: 'fa-calendar-times' }
        ];

        var userPerms = user.permissions || [];

        var container = document.getElementById('permissions-list');
        container.innerHTML = '<p style="color:var(--text-muted); margin-bottom:16px;">Select which pages this user can access:</p>' +
            allPerms.map(p => {
                var checked = userPerms.includes(p.id) ? 'checked' : '';
                return '<div style="padding:8px 0; border-bottom:1px solid var(--border-color);">' +
                    '<label style="display:flex; align-items:center; gap:10px; cursor:pointer;">' +
                    '<input type="checkbox" class="perm-checkbox" value="' + p.id + '" ' + checked + '>' +
                    '<i class="fas ' + p.icon + '" style="width:20px; color:var(--accent-blue);"></i> ' +
                    '<span style="color:var(--text-bright);">' + p.label + '</span>' +
                    '</label></div>';
            }).join('');

        modal.classList.remove('hidden');
    },

    async savePermissions() {
        if (!this.editingPermUserId) return;

        var checkboxes = document.querySelectorAll('.perm-checkbox:checked');
        var permissions = Array.from(checkboxes).map(cb => cb.value);

        try {
            var result = await ApiClient.updatePermissions(this.editingPermUserId, permissions);
            if (result && result.success) {
                UI.showToast('success', 'Permissions Updated', 'User permissions have been saved');
                document.getElementById('modal-permissions').classList.add('hidden');
                this.editingPermUserId = null;
                this.render();
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to update permissions');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to update permissions');
        }
    }
};

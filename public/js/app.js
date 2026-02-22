/* =============================================
   Main Application Entry Point
   ============================================= */

const App = {
    init() {
        // Initialize API client
        ApiClient.init();

        // Initialize data store
        DataStore.init();

        // Initialize modules
        UI.init();
        VehicleManager.init();
        MileageManager.init();
        AlertsManager.init();
        DataImporter.init();
        if (typeof MaintenanceManager !== 'undefined') MaintenanceManager.init();
        if (typeof UserManager !== 'undefined') UserManager.init();
        if (typeof ExpirationManager !== 'undefined') ExpirationManager.init();
        if (typeof DataMgmt !== 'undefined') DataMgmt.init();

        // Register service worker for PWA
        this.registerServiceWorker();

        // Apply saved theme
        this.applyTheme();

        // Check for existing session
        if (Auth.init()) {
            UI.showApp();
            this.refreshAll();
            // Sync with server and refresh again when data is ready
            this.syncWithServer().then(() => this.refreshAll());
        } else {
            UI.showLogin();
        }

        // Bind login form (now async)
        document.getElementById('login-form').addEventListener('submit', function(e) {
            e.preventDefault();
            App.handleLogin();
        });

        // Bind registration form
        var registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', function(e) {
                e.preventDefault();
                App.handleRegister();
            });
        }

        // Bind show-register / show-login toggle links
        var showRegLink = document.getElementById('show-register-link');
        if (showRegLink) {
            showRegLink.addEventListener('click', function(e) {
                e.preventDefault();
                document.getElementById('login-form').classList.add('hidden');
                document.querySelector('.login-footer').classList.add('hidden');
                document.getElementById('register-form').classList.remove('hidden');
            });
        }
        var showLoginLink = document.getElementById('show-login-link');
        if (showLoginLink) {
            showLoginLink.addEventListener('click', function(e) {
                e.preventDefault();
                document.getElementById('register-form').classList.add('hidden');
                document.getElementById('login-form').classList.remove('hidden');
                document.querySelector('.login-footer').classList.remove('hidden');
            });
        }

        // Bind change password button
        var changePwBtn = document.getElementById('btn-change-password');
        if (changePwBtn) {
            changePwBtn.addEventListener('click', function() {
                App.handleChangePassword();
            });
        }
    },

    async handleLogin() {
        var username = document.getElementById('login-username').value.trim();
        var password = document.getElementById('login-password').value;
        var errorDiv = document.getElementById('login-error');

        if (errorDiv) { errorDiv.classList.add('hidden'); errorDiv.textContent = ''; }

        if (!username || !password) {
            if (errorDiv) {
                errorDiv.textContent = 'Please enter username and password';
                errorDiv.classList.remove('hidden');
            } else {
                UI.showToast('error', 'Login Error', 'Please enter username and password');
            }
            return;
        }

        // Show loading state
        var btn = document.querySelector('.login-btn');
        var originalText = btn.textContent;
        btn.textContent = 'Signing in...';
        btn.disabled = true;

        try {
            var result = await Auth.login(username, password);
            if (result.success) {
                if (errorDiv) { errorDiv.classList.add('hidden'); errorDiv.textContent = ''; }
                UI.showApp();
                UI.showToast('success', 'Welcome', 'Logged in as ' + result.user.name);
                // Sync data from server first, then refresh UI
                await this.syncWithServer();
                this.refreshAll();
            } else {
                if (errorDiv) {
                    errorDiv.textContent = result.message || 'Invalid username or password. Please check your credentials and try again.';
                    errorDiv.classList.remove('hidden');
                } else {
                    UI.showToast('error', 'Login Failed', result.message);
                }
            }
        } catch (err) {
            if (errorDiv) {
                errorDiv.textContent = err.message || 'Failed to connect to server';
                errorDiv.classList.remove('hidden');
            } else {
                UI.showToast('error', 'Login Error', err.message || 'Failed to connect');
            }
        }

        btn.textContent = originalText;
        btn.disabled = false;
    },

    async handleRegister() {
        var name = document.getElementById('reg-name').value.trim();
        var staffId = document.getElementById('reg-staff-id').value.trim();
        var username = document.getElementById('reg-username').value.trim();
        var phone = document.getElementById('reg-phone').value.trim();
        var password = document.getElementById('reg-password').value;
        var confirm = document.getElementById('reg-confirm-password').value;
        var errorDiv = document.getElementById('register-error');

        if (errorDiv) { errorDiv.classList.add('hidden'); errorDiv.textContent = ''; }

        if (!name || !username || !password) {
            if (errorDiv) { errorDiv.textContent = 'Please fill in all required fields'; errorDiv.classList.remove('hidden'); }
            else UI.showToast('error', 'Registration Error', 'Please fill in all required fields');
            return;
        }

        if (password !== confirm) {
            if (errorDiv) { errorDiv.textContent = 'Passwords do not match'; errorDiv.classList.remove('hidden'); }
            else UI.showToast('error', 'Registration Error', 'Passwords do not match');
            return;
        }

        if (password.length < 4) {
            if (errorDiv) { errorDiv.textContent = 'Password must be at least 4 characters'; errorDiv.classList.remove('hidden'); }
            else UI.showToast('error', 'Registration Error', 'Password must be at least 4 characters');
            return;
        }

        try {
            var result = await ApiClient.register({ name, staffId, username, phone, password });
            if (result && (result.success || result.message)) {
                UI.showToast('success', 'Registration Submitted', result.message || 'Your account is pending admin approval. You will be notified once approved.');
                document.getElementById('register-form').reset();
                document.getElementById('register-form').classList.add('hidden');
                document.getElementById('login-form').classList.remove('hidden');
                document.querySelector('.login-footer').classList.remove('hidden');
            } else {
                var errMsg = result ? result.error : 'Registration failed';
                if (errorDiv) { errorDiv.textContent = errMsg; errorDiv.classList.remove('hidden'); }
                else UI.showToast('error', 'Registration Failed', errMsg);
            }
        } catch (err) {
            var errMsg2 = err.message || 'Failed to connect to server';
            if (errorDiv) { errorDiv.textContent = errMsg2; errorDiv.classList.remove('hidden'); }
            else UI.showToast('error', 'Registration Error', errMsg2);
        }
    },

    async handleChangePassword() {
        var currentPw = document.getElementById('current-password').value;
        var newPw = document.getElementById('new-password').value;

        if (!currentPw || !newPw) {
            UI.showToast('error', 'Error', 'Please fill in both current and new password');
            return;
        }
        if (newPw.length < 4) {
            UI.showToast('error', 'Error', 'New password must be at least 4 characters');
            return;
        }

        try {
            var result = await ApiClient.changePassword(currentPw, newPw);
            if (result && result.success) {
                UI.showToast('success', 'Password Changed', 'Your password has been updated');
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
            } else {
                UI.showToast('error', 'Error', result ? result.error : 'Failed to change password');
            }
        } catch (err) {
            UI.showToast('error', 'Error', err.message || 'Failed to change password');
        }
    },

    async syncWithServer() {
        try {
            var synced = await DataStore.syncFromServer();
            if (synced) {
                this.refreshAll();
            }
        } catch (err) {
            console.warn('[App] Server sync failed:', err.message);
        }
    },

    refreshAll() {
        Dashboard.refresh();
        VehicleManager.renderVehiclesTable();
        MileageManager.populateVehicleFilter();
        MileageManager.renderMileageTable();
        AlertsManager.render();
        UI.updateSidebar();
        UI.updateStatusBar();
        UI.updateAlertBadge();

        if (Auth.isDriver()) {
            DriverView.render();
        }

        // Refresh new modules if available
        if (typeof MaintenanceManager !== 'undefined' && MaintenanceManager.render) MaintenanceManager.render();
        if (typeof ExpirationManager !== 'undefined' && ExpirationManager.render) ExpirationManager.render();
    },

    applyTheme() {
        var settings = DataStore.getSettings();
        var theme = settings.theme || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        // Update login screen gradient
        var loginScreen = document.getElementById('login-screen');
        if (loginScreen) {
            loginScreen.style.background = 'var(--login-gradient)';
            loginScreen.style.backgroundSize = '400% 400%';
            loginScreen.style.animation = 'gradientShift 15s ease infinite';
        }
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                    console.log('[PWA] Service Worker registered with scope:', registration.scope);

                    // Listen for updates
                    registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'activated') {
                                UI.showToast('info', 'App Updated', 'New version available. Refresh to update.');
                            }
                        });
                    });
                })
                .catch(function(err) {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });

            // Listen for sync messages from service worker
            navigator.serviceWorker.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'SYNC_COMPLETE') {
                    App.syncWithServer();
                }
            });
        }

        // PWA install prompt
        var deferredPrompt;
        window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            deferredPrompt = e;
            // Show install button notification
            UI.showToast('info', 'Install App', 'This app can be installed on your device for offline use.');
        });
    }
};

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});

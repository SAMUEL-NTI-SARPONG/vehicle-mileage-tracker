const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const { initDatabase } = require('./db/database');
const seed = require('./db/seed');

const app = express();

// Lazy database initialization (works for both local and serverless)
let dbReady = false;
let dbInitPromise = null;

app.use(async (req, res, next) => {
    if (!dbReady) {
        if (!dbInitPromise) {
            dbInitPromise = (async () => {
                await initDatabase();
                await seed();
                dbReady = true;
                console.log('Database initialized and seeded.');
            })().catch(err => {
                dbInitPromise = null; // Reset so next request retries
                throw err;
            });
        }
        try {
            await dbInitPromise;
        } catch (err) {
            console.error('DB init failed:', err);
            return res.status(500).json({ error: 'Server initializing, please retry' });
        }
    }
    next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory (used in local dev)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/mileage', require('./routes/mileage'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/import', require('./routes/import'));
app.use('/api/reports', require('./routes/reports'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for all non-API routes (local dev)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling
app.use(errorHandler);

// Only start listener when running directly (not on Vercel)
if (!process.env.VERCEL) {
    app.listen(config.port, () => {
        console.log(`Server running on http://localhost:${config.port}`);
    });
}

module.exports = app;

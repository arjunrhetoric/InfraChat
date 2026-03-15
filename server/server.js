require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const { initializeSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const messageRoutes = require('./routes/messages');
const auditRoutes = require('./routes/audit');
const directMessageRoutes = require('./routes/directMessages');
const directMessageActionRoutes = require('./routes/directMessageActions');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const fs = require('fs');


const app = express();
const server = http.createServer(app);

// Connect database
connectDB();
 // Add this at the top with other requires

const path = require("path");

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// Logic to create the uploads folder if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created uploads directory');
}



// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));




// Health route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Internal Network Server API is running',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', messageRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/direct-messages', directMessageRoutes);
app.use('/api/direct-message-actions', directMessageActionRoutes);
app.use('/api/upload', uploadRoutes);



// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

// Initialize socket
initializeSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

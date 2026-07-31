const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; // Garanti non-null par le guard dans server.js
const { PassThrough } = require('stream');

module.exports = function(io) {
    // Middleware d'authentification pour les websockets
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error'));
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.isTemp) return next(new Error('Temp token not allowed'));
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        let currentStream = null;

        // ---- LIVE LOGS ----
        socket.on('start-logs', async (containerId) => {
            try {
                const container = docker.getContainer(containerId);
                const info = await container.inspect();
                const isTty = info.Config.Tty;

                const stream = await container.logs({
                    follow: true,
                    stdout: true,
                    stderr: true,
                    tail: 200 // Garde un peu plus d'historique
                });
                
                currentStream = stream;
                
                if (isTty) {
                    stream.on('data', (chunk) => {
                        socket.emit('log-data', chunk.toString('utf8'));
                    });
                } else {
                    const stdout = new PassThrough();
                    const stderr = new PassThrough();
                    
                    stdout.on('data', chunk => socket.emit('log-data', chunk.toString('utf8')));
                    stderr.on('data', chunk => socket.emit('log-data', chunk.toString('utf8')));
                    
                    docker.modem.demuxStream(stream, stdout, stderr);
                }

                stream.on('error', (err) => {
                    socket.emit('log-error', err.message);
                });

            } catch(e) {
                socket.emit('log-error', e.message);
            }
        });

        // ---- WEB TERMINAL ----
        socket.on('start-terminal', async (containerId, options = { cmd: 'sh' }) => {
            try {
                const container = docker.getContainer(containerId);
                const exec = await container.exec({
                    AttachStdin: true,
                    AttachStdout: true,
                    AttachStderr: true,
                    Tty: true,
                    Cmd: [options.cmd]
                });

                const stream = await exec.start({ hijack: true, stdin: true });
                currentStream = stream;

                stream.on('data', (chunk) => {
                    socket.emit('terminal-data', chunk.toString('utf8'));
                });

                socket.on('terminal-input', (data) => {
                    if (currentStream) currentStream.write(data);
                });

                socket.on('terminal-resize', async ({ cols, rows }) => {
                    try {
                        await exec.resize({ h: rows, w: cols });
                    } catch(e) {}
                });

            } catch (e) {
                socket.emit('terminal-error', e.message);
            }
        });

        socket.on('disconnect', () => {
            if (currentStream && currentStream.destroy) {
                currentStream.destroy();
            }
        });

        socket.on('stop-stream', () => {
            if (currentStream && currentStream.destroy) {
                currentStream.destroy();
                currentStream = null;
            }
        });
    });
};

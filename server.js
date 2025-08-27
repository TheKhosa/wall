const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

// In-memory storage for the drawing history in "world" coordinates.
const drawingHistory = [];

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Infinite Collaborative Wall</title>
        <style>
          body { margin: 0; overflow: hidden; font-family: Arial, sans-serif; user-select: none; }
          #drawing-wall { border: 1px solid black; cursor: crosshair; background-color: #f9f9f9; }
          #controls {
            position: fixed;
            top: 15px;
            left: 15px;
            padding: 10px;
            background-color: rgba(255, 255, 255, 0.85);
            border-radius: 5px;
            display: flex;
            align-items: center;
            z-index: 10;
          }
          #colorPicker { margin-left: 5px; }
          #clearButton {
            margin-left: 15px; padding: 5px 10px; border-radius: 5px;
            border: 1px solid #ccc; cursor: pointer;
          }
          .info-panel {
            position: fixed; bottom: 10px; right: 10px;
            background-color: rgba(0, 0, 0, 0.5); color: white;
            padding: 5px 10px; border-radius: 3px; font-size: 12px;
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div id="controls">
          <label for="colorPicker">Color:</label>
          <input type="color" id="colorPicker" value="#000000">
          <button id="clearButton">Clear Wall</button>
        </div>
        <canvas id="drawing-wall"></canvas>
        <div class="info-panel">
          <div>Left-click: Draw | Right-click: Pan</div>
          <div id="zoom-level">Zoom: 100%</div>
        </div>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const socket = io();
            const canvas = document.getElementById('drawing-wall');
            const context = canvas.getContext('2d');
            const colorPicker = document.getElementById('colorPicker');
            const clearButton = document.getElementById('clearButton');
            const zoomLevelText = document.getElementById('zoom-level');

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            // --- Viewport State (Camera & Zoom) ---
            let cameraX = 0;
            let cameraY = 0;
            let zoom = 1;
            const MAX_ZOOM = 5;
            const MIN_ZOOM = 0.1;
            const SCROLL_SENSITIVITY = 0.005;

            let isPanning = false;
            let lastPanX = 0;
            let lastPanY = 0;
            
            // --- Drawing State ---
            let isDrawing = false;
            let currentColor = colorPicker.value;
            let lastDrawX = 0;
            let lastDrawY = 0;

            let localHistory = [];

            // --- Coordinate Transformation ---
            const toWorldCoords = (screenX, screenY) => {
                return { x: (screenX - cameraX) / zoom, y: (screenY - cameraY) / zoom };
            };
            
            // --- Rendering ---
            const redrawCanvas = () => {
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.save();
                // Apply all transformations
                context.translate(cameraX, cameraY);
                context.scale(zoom, zoom);
                
                // Draw all segments in world coordinates
                for (const data of localHistory) {
                    drawSegment(data);
                }

                context.restore();
                
                // Update zoom level display
                zoomLevelText.textContent = \`Zoom: \${Math.round(zoom * 100)}%\`;
            };

            const drawSegment = (data) => {
                context.beginPath();
                context.moveTo(data.x0, data.y0);
                context.lineTo(data.x1, data.y1);
                context.strokeStyle = data.color;
                // Line width appears constant regardless of zoom
                context.lineWidth = 5 / zoom; 
                context.lineCap = 'round';
                context.stroke();
                context.closePath();
            };

            // --- Event Handlers ---
            colorPicker.addEventListener('input', (e) => currentColor = e.target.value);
            clearButton.addEventListener('click', () => socket.emit('clear'));
            
            // --- ZOOM HANDLER ---
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                
                const worldPosBefore = toWorldCoords(e.offsetX, e.offsetY);

                // Calculate new zoom
                const zoomAmount = e.deltaY * SCROLL_SENSITIVITY;
                zoom *= Math.exp(-zoomAmount);
                zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

                // Adjust camera position to keep mouse position static
                cameraX = e.offsetX - worldPosBefore.x * zoom;
                cameraY = e.offsetY - worldPosBefore.y * zoom;

                redrawCanvas();
            });

            // --- MOUSE DOWN HANDLER ---
            canvas.addEventListener('mousedown', (e) => {
                if (e.button === 2) { // Right-click for Panning
                    isPanning = true;
                    canvas.style.cursor = 'grabbing';
                    lastPanX = e.clientX;
                    lastPanY = e.clientY;
                } 
                else if (e.button === 0) { // Left-click for Drawing
                    isDrawing = true;
                    const worldPos = toWorldCoords(e.offsetX, e.offsetY);
                    lastDrawX = worldPos.x;
                    lastDrawY = worldPos.y;
                }
            });

            // --- MOUSE MOVE HANDLER ---
            canvas.addEventListener('mousemove', (e) => {
                if (isPanning) {
                    const dx = e.clientX - lastPanX;
                    const dy = e.clientY - lastPanY;
                    cameraX += dx;
                    cameraY += dy;
                    lastPanX = e.clientX;
                    lastPanY = e.clientY;
                    redrawCanvas();
                } else if (isDrawing) {
                    const worldPos = toWorldCoords(e.offsetX, e.offsetY);
                    const data = {
                        x0: lastDrawX, y0: lastDrawY,
                        x1: worldPos.x, y1: worldPos.y,
                        color: currentColor
                    };
                    
                    localHistory.push(data);
                    redrawCanvas();
                    socket.emit('draw', data);
                    lastDrawX = worldPos.x;
                    lastDrawY = worldPos.y;
                }
            });

            // --- MOUSE UP HANDLER ---
            canvas.addEventListener('mouseup', (e) => {
                if (e.button === 2) { isPanning = false; canvas.style.cursor = 'crosshair'; } 
                else if (e.button === 0) { isDrawing = false; }
            });

            // Prevent context menu on right-click
            canvas.addEventListener('contextmenu', e => e.preventDefault());

            // --- Socket.IO Listeners ---
            socket.on('draw', (data) => { localHistory.push(data); redrawCanvas(); });
            socket.on('history', (history) => { localHistory = history; redrawCanvas(); });
            socket.on('clear', () => { localHistory = []; redrawCanvas(); });

            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                redrawCanvas();
            });
          });
        </script>
      </body>
    </html>
  `);
});

// --- Server-Side Socket Logic (Unchanged) ---
io.on('connection', (socket) => {
  socket.emit('history', drawingHistory);
  socket.on('draw', (data) => {
    drawingHistory.push(data);
    socket.broadcast.emit('draw', data);
  });
  socket.on('clear', () => {
    drawingHistory.length = 0;
    io.emit('clear');
  });
});

http.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

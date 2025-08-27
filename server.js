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
          #drawing-wall { border: 1px solid black; cursor: crosshair; }
          #controls {
            position: fixed;
            top: 15px;
            left: 15px;
            padding: 10px;
            background-color: rgba(255, 255, 255, 0.85);
            border-radius: 5px;
            display: flex;
            align-items: center;
            z-index: 10; /* Ensure controls are above canvas */
          }
          #colorPicker { margin-left: 5px; }
          #clearButton {
            margin-left: 15px; padding: 5px 10px; border-radius: 5px;
            border: 1px solid #ccc; cursor: pointer;
          }
          #info {
            position: fixed; bottom: 10px; right: 10px;
            background-color: rgba(0, 0, 0, 0.5); color: white;
            padding: 5px 10px; border-radius: 3px; font-size: 12px;
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
        <!-- CORRECTED INSTRUCTION TEXT HERE -->
        <div id="info">Left-click to draw | Hold right-click to pan</div>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const socket = io();
            const canvas = document.getElementById('drawing-wall');
            const context = canvas.getContext('2d');
            const colorPicker = document.getElementById('colorPicker');
            const clearButton = document.getElementById('clearButton');

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            // --- Camera and Pan State ---
            let cameraX = 0;
            let cameraY = 0;
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
                return { x: screenX - cameraX, y: screenY - cameraY };
            };
            
            // --- Rendering ---
            const redrawCanvas = () => {
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.save();
                context.translate(cameraX, cameraY);
                
                for (const data of localHistory) {
                    drawSegment(data);
                }

                context.restore();
            };

            const drawSegment = (data) => {
                context.beginPath();
                context.moveTo(data.x0, data.y0);
                context.lineTo(data.x1, data.y1);
                context.strokeStyle = data.color;
                context.lineWidth = 5;
                context.lineCap = 'round';
                context.stroke();
                context.closePath();
            };

            // --- Event Handlers ---
            colorPicker.addEventListener('input', (e) => currentColor = e.target.value);
            clearButton.addEventListener('click', () => socket.emit('clear'));


            // MOUSE DOWN HANDLER
            canvas.addEventListener('mousedown', (e) => {
                // Ensure we only process mouse buttons 0 (Left) and 2 (Right)
                if (e.button === 2) {
                    // RIGHT CLICK: Start Panning
                    isPanning = true;
                    isDrawing = false; 
                    canvas.style.cursor = 'grabbing';
                    lastPanX = e.clientX;
                    lastPanY = e.clientY;
                    // Crucial: Prevent context menu immediately on right-click down
                    e.preventDefault(); 
                } 
                else if (e.button === 0) {
                    // LEFT CLICK: Start Drawing
                    isDrawing = true;
                    isPanning = false; 
                    const worldPos = toWorldCoords(e.offsetX, e.offsetY);
                    lastDrawX = worldPos.x;
                    lastDrawY = worldPos.y;
                }
            });

            // MOUSE MOVE HANDLER
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
                        x0: lastDrawX,
                        y0: lastDrawY,
                        x1: worldPos.x,
                        y1: worldPos.y,
                        color: currentColor
                    };
                    
                    localHistory.push(data);
                    redrawCanvas();
                    socket.emit('draw', data);

                    lastDrawX = worldPos.x;
                    lastDrawY = worldPos.y;
                }
            });

            // MOUSE UP HANDLER (Released button)
            canvas.addEventListener('mouseup', (e) => {
                if (e.button === 2) { 
                    isPanning = false;
                    canvas.style.cursor = 'crosshair';
                } else if (e.button === 0) { 
                    isDrawing = false;
                }
            });

            // MOUSE LEAVE HANDLER (Safety stop)
            canvas.addEventListener('mouseout', () => {
                isDrawing = false;
                // Note: We intentionally don't stop panning here, as the user might still be holding the right button
                // while temporarily dragging the cursor outside the canvas area.
            });
            
            // PREVENT DEFAULT CONTEXT MENU
            // This is absolutely vital for right-click panning to work smoothly.
            canvas.addEventListener('contextmenu', e => e.preventDefault());
            
            // --- Socket.IO Listeners ---
            socket.on('draw', (data) => {
                localHistory.push(data);
                redrawCanvas();
            });

            socket.on('history', (history) => {
                localHistory = history;
                redrawCanvas();
            });

            socket.on('clear', () => {
                localHistory = [];
                redrawCanvas();
            });

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

// --- Server-Side Socket Logic (Unchanged from previous versions) ---
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

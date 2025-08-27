const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

// In-memory storage for the drawing history.
// For a real-world application, you might use a database.
const drawingHistory = [];

// Serve the HTML, CSS, and client-side JavaScript
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Collaborative Drawing Wall</title>
        <style>
          body {
            margin: 0;
            overflow: hidden;
            font-family: Arial, sans-serif;
          }
          #drawing-wall {
            border: 1px solid black;
          }
          #controls {
            position: fixed;
            top: 15px;
            left: 15px;
            padding: 10px;
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 5px;
            display: flex;
            align-items: center;
          }
          #colorPicker {
              margin-left: 5px;
          }
          #clearButton {
            margin-left: 15px;
            padding: 5px 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
            cursor: pointer;
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

            let isDrawing = false;
            let currentColor = colorPicker.value;
            let lastX = 0;
            let lastY = 0;

            colorPicker.addEventListener('input', (e) => {
              currentColor = e.target.value;
            });

            clearButton.addEventListener('click', () => {
                socket.emit('clear');
            });

            function draw(x0, y0, x1, y1, color) {
              context.beginPath();
              context.moveTo(x0, y0);
              context.lineTo(x1, y1);
              context.strokeStyle = color;
              context.lineWidth = 5;
              context.lineCap = 'round'; // Makes lines smoother
              context.stroke();
              context.closePath();
            }
            
            function clearCanvas() {
                context.clearRect(0, 0, canvas.width, canvas.height);
            }

            function startDrawing(e) {
                isDrawing = true;
                [lastX, lastY] = [e.offsetX, e.offsetY];
            }

            function drawOnMove(e) {
              if (isDrawing) {
                const data = {
                    x0: lastX,
                    y0: lastY,
                    x1: e.offsetX,
                    y1: e.offsetY,
                    color: currentColor
                };
                draw(data.x0, data.y0, data.x1, data.y1, data.color);
                socket.emit('draw', data);
                [lastX, lastY] = [e.offsetX, e.offsetY];
              }
            }

            function stopDrawing() {
              if (isDrawing) {
                isDrawing = false;
              }
            }

            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', drawOnMove);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseout', stopDrawing);

            // Listener for receiving drawing data from others
            socket.on('draw', (data) => {
              draw(data.x0, data.y0, data.x1, data.y1, data.color);
            });

            // Listener for the initial drawing history
            socket.on('history', (history) => {
                for (const data of history) {
                    draw(data.x0, data.y0, data.x1, data.y1, data.color);
                }
            });

            // Listener for the clear event
            socket.on('clear', () => {
                clearCanvas();
            });

            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                // Redraw history on resize
                clearCanvas();
                socket.emit('requestHistory');
            });

            // Request history on initial connection
            socket.emit('requestHistory');
          });
        </script>
      </body>
    </html>
  `);
});

// Handle socket connections
io.on('connection', (socket) => {
  // Send the drawing history to the newly connected user
  socket.on('requestHistory', () => {
    socket.emit('history', drawingHistory);
  });

  // When a user draws, save it and broadcast it
  socket.on('draw', (data) => {
    drawingHistory.push(data);
    // Broadcast the drawing data to all other clients
    socket.broadcast.emit('draw', data);
  });

  // When a user clears the wall
  socket.on('clear', () => {
    drawingHistory.length = 0; // Clear the history array
    io.emit('clear'); // Broadcast the clear event to everyone
  });
});

http.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

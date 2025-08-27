const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

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
          }
        </style>
      </head>
      <body>
        <div id="controls">
          <label for="colorPicker">Color:</label>
          <input type="color" id="colorPicker" value="#000000">
        </div>
        <canvas id="drawing-wall"></canvas>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          document.addEventListener('DOMContentLoaded', () => {
            const socket = io();
            const canvas = document.getElementById('drawing-wall');
            const context = canvas.getContext('2d');
            const colorPicker = document.getElementById('colorPicker');

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            let isDrawing = false;
            let currentColor = colorPicker.value;
            let lastX = 0;
            let lastY = 0;

            colorPicker.addEventListener('input', (e) => {
              currentColor = e.target.value;
            });

            function draw(x0, y0, x1, y1, color, emit) {
              context.beginPath();
              context.moveTo(x0, y0);
              context.lineTo(x1, y1);
              context.strokeStyle = color;
              context.lineWidth = 5;
              context.stroke();
              context.closePath();

              if (!emit) { return; }

              socket.emit('draw', {
                x0: x0,
                y0: y0,
                x1: x1,
                y1: y1,
                color: color
              });
            }

            canvas.addEventListener('mousedown', (e) => {
              isDrawing = true;
              [lastX, lastY] = [e.offsetX, e.offsetY];
            });

            canvas.addEventListener('mousemove', (e) => {
              if (isDrawing) {
                draw(lastX, lastY, e.offsetX, e.offsetY, currentColor, true);
                [lastX, lastY] = [e.offsetX, e.offsetY];
              }
            });

            canvas.addEventListener('mouseup', () => {
              if (isDrawing) {
                isDrawing = false;
              }
            });
            
            canvas.addEventListener('mouseout', () => isDrawing = false);

            socket.on('draw', (data) => {
              draw(data.x0, data.y0, data.x1, data.y1, data.color, false);
            });

            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            });
          });
        </script>
      </body>
    </html>
  `);
});

// Handle socket connections
io.on('connection', (socket) => {
  socket.on('draw', (data) => {
    // Broadcast the drawing data to all other clients
    socket.broadcast.emit('draw', data);
  });
});

http.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

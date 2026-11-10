@echo off
echo Starting local test server for Mobile OCD Demo on http://localhost:8080...
echo (You can also open this link on your phone if connected to the same Wi-Fi)
python -m http.server 8080
pause

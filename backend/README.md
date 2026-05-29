# Backend Deploy

Deploy this `backend` folder to Render as a Python web service.

Render settings:

```text
Build Command: pip install -r requirements.txt
Start Command: python server.py
Health Check Path: /health
```

The hand gesture WebSocket endpoint is:

```text
/ws/gesture
```

After Render gives you a public URL, add that URL to the Vercel frontend as `GESTURE_BACKEND_URL`.


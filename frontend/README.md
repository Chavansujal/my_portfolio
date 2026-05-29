# Frontend Deploy

Deploy this `frontend` folder to Vercel.

1. Set the Vercel project root directory to `frontend`.
2. Add an environment variable named `GESTURE_BACKEND_URL`.
3. Set it to your Render backend URL, for example:

```text
https://portfolio-gesture-backend.onrender.com
```

The build script writes that value into `config.js`, and `script.js` converts it to:

```text
wss://your-render-service.onrender.com/ws/gesture
```


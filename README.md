# ✊✋✌️ Piedra Papel Tijera — Online

Multijugador en tiempo real con WebSockets (Socket.io).

## Estructura
```
ppt-online/
├── server.js          ← Servidor Node.js
├── package.json
├── public/
│   ├── index.html
│   ├── style.css
│   └── game.js
```

## Correr localmente

```bash
npm install
npm start
```
Abre http://localhost:3000 en dos pestañas o dispositivos de la misma red.

## Deploy gratis en Railway

1. Sube el proyecto a GitHub
2. Entra a https://railway.app → New Project → Deploy from GitHub
3. Selecciona tu repo → Railway detecta Node.js automáticamente
4. Listo, te da una URL pública (ej. https://ppt-online.up.railway.app)

## Deploy gratis en Render

1. Sube a GitHub
2. Entra a https://render.com → New → Web Service
3. Conecta tu repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Plan: Free → Create Web Service

import express from "express";
import sessions from "express-session";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import os from "os";

const app = express();
const Port = 3000;
app.use(
    session({
        secret:'P4-EMGM#BOTsito-sesionesPersistenetes',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 5* 60 *1000} // 1 día
    })
)

// Middleware para procesar JSON y datos de formularios
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Almacén de sesiones (simulación en memoria, no recomendado para producción)
const sessionStore = {};

// Función para obtener la IP del cliente
const getClienteIP = (req) => {
  return (
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress
  );
};

//? Login endpoint
app.post("/login", (req, res) => {
  const { email, nickname, macAddress } = req.body;
  if (!email || !nickname || !macAddress) {
    return res.status(400).json({ message: "Se esperan campos requeridos" });
  }

  const sessionId = uuidv4();
  const now = new Date();

  sessionStore[sessionId] = {
    sessionId,
    email,
    nickname,
    macAddress,
    ip: getClienteIP(req),
    createdAt: now,
    lastAccessed: now,
  };

  res.status(200).json({
    message: "Sesión iniciada",
    sessionId,
  });
});

//? Logout endpoint
app.post("/logout", (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || !sessionStore[sessionId]) {
    return res.status(404).json({ message: "No se ha encontrado una sesión activa." });
  }

  delete sessionStore[sessionId];
  res.status(200).json({ message: "Logout exitoso" });
});

//? Actualización de la sesión
app.put("/update", (req, res) => {
  const { sessionId, email, nickname } = req.body;
  if (!sessionId || !sessionStore[sessionId]) {
    return res.status(404).json({ message: "No existe una sesión activa" });
  }

  if (email) sessionStore[sessionId].email = email;
  if (nickname) sessionStore[sessionId].nickname = nickname;
  sessionStore[sessionId].lastAccessed = new Date();

  res.status(200).json({
    message: "Sesión actualizada",
    session: sessionStore[sessionId],
  });
});

//? Estado de la sesión
app.get("/status", (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId || !sessionStore[sessionId]) {
    return res.status(404).json({ message: "No hay sesión activa" });
  }

  res.status(200).json({
    message: "Sesión activa",
    session: sessionStore[sessionId],
  });
});

app.get('/', (req, res)=>{
  return res.status(200).json({message: "Bienvenid@ a la api de control de sesiones ",
                               author: "T.S.U Erick Matias Granillo Mejia." })
})
//Funcion de utilidad que nos permite acceder a la informacion de la interfaz de red 
const getServerNetworkInfo = () => {
const interfaces = os.networkInterfaces()
for (const name in interfaces){
      for(const iface of interfaces[name]){
        if(iface.family === 'IPv4' && !iface.internal){
          return {serverIp: iface.address, serverMac: iface.mac};
        }
      }
}
}

// Iniciar el servidor
app.listen(Port, () => {
  console.log(`Servidor inicializado en el puerto ${Port}`);
});

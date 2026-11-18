// 1. Crea un proyecto en Firebase y una base de datos Cloud Firestore.
// 2. Pega aquí, entre las llaves, el objeto firebaseConfig que muestra Firebase.
// 3. Mientras falten datos, la aplicación funciona en modo local para pruebas.
//
// No subas credenciales administrativas ni archivos de cuentas de servicio al navegador.

export const firebaseConfig = {
  apiKey: "AIzaSyCW4etQ2PDgBPmlmlg_JMRKpKmpNFDIBw8",
  authDomain: "huellas-del-espacio.firebaseapp.com",
  projectId: "huellas-del-espacio",
  storageBucket: "huellas-del-espacio.firebasestorage.app",
  messagingSenderId: "424303918113",
  appId: "1:424303918113:web:e95035a527024f190c7760",
  measurementId: "G-7YJL7L652R"
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

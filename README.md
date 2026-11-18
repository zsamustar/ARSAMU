# Huellas del Espacio

Prototipo WebAR basado en ubicación: muestra cápsulas de memoria cercanas mediante cámara, orientación, geolocalización, Three.js y Cloud Firestore. No requiere build ni dependencias instaladas.

## Despliegue en 3 pasos

1. Crea un proyecto de Firebase, habilita **Cloud Firestore** y copia su objeto de configuración web en [`firebase-config.js`](firebase-config.js). Para una demo abierta, configura reglas de Firestore apropiadas para el aula; antes de publicar, aplica reglas de acceso reales.
2. Sirve esta carpeta por HTTPS. Para probar localmente puedes usar `npx serve .`; para sensores reales abre la dirección HTTPS desde el móvil. Los permisos de cámara y GPS no funcionan de forma fiable con `file://`.
3. Sube estos cinco archivos a un repositorio y publícalo con GitHub Pages, o importa la carpeta en Vercel como sitio estático. No hace falta configurar comandos de compilación.

## Prueba rápida

Pulsa **Entrar al espacio** y concede los permisos solicitados. En interior o sin giroscopio, usa **Modo Demo**: crea cuatro pensamientos alrededor de la posición actual y activa el arrastre con mouse o dedo. Si Firebase aún no está configurado, los pensamientos se conservan solo durante la pestaña abierta.

## Archivos

- `index.html`: estructura y controles accesibles.
- `style.css`: interfaz editorial adaptable y capa AR.
- `app.js`: sensores, conversión ENU, Three.js, raycasting, formulario y sincronización.
- `firebase-config.js`: único archivo que requiere configuración.

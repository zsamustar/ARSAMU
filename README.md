# Huellas Sonoras

Prototipo de realidad aumentada para el Proyecto 7. La cámara reconoce tres imágenes impresas y muestra una huella de partículas con audio reactivo. No requiere instalar Node, Three.js ni MindAR: se cargan desde CDN.

## Lo que falta añadir antes de publicarlo

1. En `assets/`, coloca tres audios MP3 de 30 a 45 segundos y nómbralos exactamente `audio0.mp3`, `audio1.mp3` y `audio2.mp3`.
2. Ya tienes tres marcadores listos en `assets/markers/`: `01-calma.png`, `02-euforia.png` y `03-nostalgia.png`. No los recortes, edites ni cambies de orden.
3. Abre el [compilador oficial de MindAR](https://hiukim.github.io/mind-ar-js-doc/tools/compile/) desde una computadora. Carga esas tres imágenes a la vez y en ese orden. Descarga el resultado y guárdalo como `assets/targets.mind`.
4. Imprime las tres imágenes usadas para compilar, preferiblemente en papel mate A5 o A4. La primera imagen corresponde al marcador 0; la segunda al 1; la tercera al 2.

## Publicación rápida en GitHub Pages

1. Crea un repositorio público llamado `huellas-sonoras`.
2. Sube el contenido completo de esta carpeta, incluida `assets/targets.mind` y los tres MP3.
3. En GitHub, abre **Settings → Pages**. En **Build and deployment**, elige **Deploy from a branch**, selecciona `main` y `/ (root)`, y guarda.
4. Abre `https://TU-USUARIO.github.io/huellas-sonoras/` desde el móvil y permite el acceso a la cámara.

No abras `index.html` con doble clic: los navegadores requieren HTTPS (o `localhost`) para permitir la cámara.

## Prueba física

Pon un marcador a la vez frente a la cámara con buena luz. Al reconocerlo debe aparecer la huella, reproducirse el audio y activarse **+ Dejar huella**. El formulario cambia temporalmente el color y el comportamiento de la huella activa; no guarda datos en un servidor.

Usa solo audio e imágenes sobre los que tengas permiso de uso.
